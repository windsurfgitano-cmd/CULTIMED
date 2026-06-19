import crypto from "node:crypto";
import { buildOutreachEmail } from "./outreach-email-html.mjs";

export const SEGMENTS = [
  "all",
  "complete_profile",
  "missing_docs",
  "no_valid_rx",
  "no_web_account",
  "activation_reminder",
];

const DOC_FIELDS = [
  "prescription_url",
  "id_front_url",
  "id_back_url",
  "criminal_record_url",
  "rights_assignment_url",
];

const SKIP_EMAILS = new Set([
  "contacto@dispensariocultimed.cl",
  "rincondeoz@gmail.com",
]);

const TEMPLATE_PRIORITY = [
  "register_account",
  "activation_reminder",
  "resubmit_rx",
  "upload_rx",
  "upload_docs",
  "complete_profile",
];

function hasUrl(value) {
  return Boolean(value && String(value).trim());
}

function isValidEmail(email) {
  if (!email) return false;
  const e = String(email).trim().toLowerCase();
  if (SKIP_EMAILS.has(e)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function missingPatientFields(p) {
  const missing = [];
  if (!p.rut?.trim()) missing.push("RUT");
  if (!p.phone?.trim()) missing.push("Teléfono");
  if (!p.email?.trim()) missing.push("Email");
  if (!p.date_of_birth) missing.push("Fecha de nacimiento");
  if (!p.city?.trim()) missing.push("Comuna");
  return missing;
}

function countDocs(acc) {
  let n = 0;
  for (const f of DOC_FIELDS) if (hasUrl(acc[f])) n++;
  return n;
}

function missingDocFields(acc) {
  return DOC_FIELDS.filter((f) => !hasUrl(acc[f]));
}

function pickPrimaryAccount(linked) {
  if (!linked.length) return null;
  return [...linked].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0];
}

function categorizeNoValidRx({ linked, hadExpiredInternal }) {
  if (!linked.length) return hadExpiredInternal ? "internal_expired_only" : "no_web_account";
  const statuses = new Set(linked.map((a) => a.prescription_status));
  if (statuses.has("pending")) return "has_web_pending";
  if (statuses.has("rechazada")) return "has_web_rechazada";
  if (statuses.has("none") || statuses.has("expired")) return "has_web_none";
  return hadExpiredInternal ? "internal_expired_only" : "has_web_none";
}

async function loadCampaignData(sql) {
  const patients = await sql`
    SELECT id, full_name, rut, email, phone, date_of_birth, city, membership_status
    FROM patients
    WHERE membership_status IS DISTINCT FROM 'deleted'
    ORDER BY id
  `;

  const accounts = await sql`
    SELECT
      c.id,
      c.email,
      c.full_name,
      c.rut,
      c.patient_id,
      c.password_hash,
      c.prescription_status,
      c.prescription_url,
      c.id_front_url,
      c.id_back_url,
      c.criminal_record_url,
      c.rights_assignment_url,
      c.created_at,
      p.id AS matched_patient_id
    FROM customer_accounts c
    JOIN patients p ON p.membership_status IS DISTINCT FROM 'deleted'
      AND (
        c.patient_id = p.id
        OR (
          p.rut IS NOT NULL AND p.rut <> ''
          AND c.rut IS NOT NULL AND c.rut <> ''
          AND REPLACE(REPLACE(UPPER(c.rut), '.', ''), '-', '')
            = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
        )
        OR (
          p.email IS NOT NULL AND p.email <> ''
          AND LOWER(c.email) = LOWER(p.email)
        )
      )
    ORDER BY c.created_at ASC
  `;

  const validInternalRx = await sql`
    SELECT DISTINCT patient_id
    FROM prescriptions
    WHERE status = 'active' AND expiry_date >= CURRENT_DATE
  `;
  const validInternalSet = new Set(validInternalRx.map((r) => r.patient_id));

  const expiredInternalRx = await sql`
    SELECT DISTINCT patient_id
    FROM prescriptions
    WHERE expiry_date < CURRENT_DATE AND status NOT IN ('rejected', 'pending')
  `;
  const expiredInternalSet = new Set(expiredInternalRx.map((r) => r.patient_id));

  const accountsByPatient = new Map();
  for (const acc of accounts) {
    const pid = acc.matched_patient_id;
    if (!accountsByPatient.has(pid)) accountsByPatient.set(pid, []);
    accountsByPatient.get(pid).push(acc);
  }

  return { patients, accountsByPatient, validInternalSet, expiredInternalSet };
}

function resolveRecipient(patient, ctx, storeBase) {
  const linked = ctx.accountsByPatient.get(patient.id) || [];
  const primary = pickPrimaryAccount(linked);
  const missingFields = missingPatientFields(patient);
  const missingDocs = primary ? missingDocFields(primary) : [];
  const criticalDocs = missingDocs.filter(
    (d) => d === "prescription_url" || d === "id_front_url"
  );

  const hasValidRx =
    ctx.validInternalSet.has(patient.id) ||
    linked.some((a) => a.prescription_status === "aprobada");

  const candidates = [];

  if (!linked.length && !hasValidRx) {
    const email = patient.email;
    if (isValidEmail(email)) {
      const q = encodeURIComponent(email);
      candidates.push({
        template: "register_account",
        email,
        ctaUrl: `${storeBase}/registro?email=${q}`,
        segment: "no_web_account",
        reason: "sin cuenta web",
      });
    }
  }

  if (primary && (!primary.password_hash || primary.password_hash === "")) {
    if (isValidEmail(primary.email)) {
      candidates.push({
        template: "activation_reminder",
        email: primary.email,
        accountId: primary.id,
        ctaUrl: null,
        segment: "activation_reminder",
        reason: "cuenta sin activar",
        needsToken: true,
      });
    }
  }

  if (!hasValidRx && linked.length) {
    const cat = categorizeNoValidRx({
      linked,
      hadExpiredInternal: ctx.expiredInternalSet.has(patient.id),
    });
    const email = primary?.email || patient.email;
    if (isValidEmail(email)) {
      if (cat === "has_web_rechazada") {
        candidates.push({
          template: "resubmit_rx",
          email,
          ctaUrl: `${storeBase}/mi-cuenta/recetas`,
          segment: "no_valid_rx",
          reason: "receta rechazada",
        });
      } else if (cat !== "has_web_pending") {
        candidates.push({
          template: "upload_rx",
          email,
          ctaUrl: `${storeBase}/mi-cuenta/recetas`,
          segment: "no_valid_rx",
          reason: cat,
        });
      }
    }
  }

  if (primary && criticalDocs.length > 0) {
    const email = primary.email || patient.email;
    if (isValidEmail(email)) {
      candidates.push({
        template: "upload_docs",
        email,
        ctaUrl: `${storeBase}/mi-cuenta/perfil`,
        segment: "missing_docs",
        reason: `faltan: ${criticalDocs.join(", ")}`,
        missingDocs: criticalDocs,
      });
    }
  }

  if (missingFields.length > 0) {
    const email = primary?.email || patient.email;
    if (isValidEmail(email)) {
      const hasAccount = Boolean(primary?.password_hash);
      candidates.push({
        template: "complete_profile",
        email,
        ctaUrl: hasAccount ? `${storeBase}/mi-cuenta/perfil` : `${storeBase}/registro`,
        segment: "complete_profile",
        reason: `faltan: ${missingFields.join(", ")}`,
        missingFields,
      });
    }
  }

  if (!candidates.length) return null;

  for (const tpl of TEMPLATE_PRIORITY) {
    const hit = candidates.find((c) => c.template === tpl);
    if (hit) return { patient, ...hit, allCandidates: candidates.length };
  }
  return { patient, ...candidates[0], allCandidates: candidates.length };
}

function filterBySegment(recipient, segment) {
  if (segment === "all") return true;
  return recipient.segment === segment;
}

async function getRecentOutreachPatientIds(sql, cooldownDays) {
  const rows = await sql`
    SELECT DISTINCT entity_id AS patient_id
    FROM audit_logs
    WHERE action = 'outreach_email_sent'
      AND entity_type = 'patient'
      AND created_at >= NOW() - (${cooldownDays}::int * INTERVAL '1 day')
  `;
  return new Set(rows.map((r) => r.patient_id));
}

async function createActivationLink(sql, accountId, storeBase, apply) {
  if (!apply) return `${storeBase}/recuperar/dry-run-token`;
  const raw = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  await sql`
    INSERT INTO password_reset_tokens (account_type, account_id, token_hash, expires_at, requested_ip)
    VALUES ('customer', ${accountId}, ${tokenHash},
            CURRENT_TIMESTAMP + INTERVAL '14 days',
            'outreach-campaign')
  `;
  return `${storeBase}/recuperar/${raw}`;
}

export async function buildOutreachQueue(sql, opts) {
  const {
    segment = "all",
    limit = Infinity,
    cooldownDays = 7,
    storeBase = "https://dispensariocultimed.cl",
  } = opts;

  if (!SEGMENTS.includes(segment)) {
    throw new Error(`Segmento inválido: ${segment}. Usa: ${SEGMENTS.join(", ")}`);
  }

  const ctx = await loadCampaignData(sql);
  const recentSet = await getRecentOutreachPatientIds(sql, cooldownDays);
  const queue = [];
  const skipped = { cooldown: 0, no_email: 0, merged: 0, segment: 0, staff_skip: 0 };

  for (const patient of ctx.patients) {
    if (patient.rut?.startsWith("MERGED-")) {
      skipped.merged++;
      continue;
    }

    const recipient = resolveRecipient(patient, ctx, storeBase);
    if (!recipient) continue;
    if (!filterBySegment(recipient, segment)) {
      skipped.segment++;
      continue;
    }
    if (recentSet.has(patient.id)) {
      skipped.cooldown++;
      continue;
    }
    if (!isValidEmail(recipient.email)) {
      skipped.no_email++;
      continue;
    }

    queue.push(recipient);
  }

  queue.sort((a, b) => a.patient.id - b.patient.id);
  const limited = queue.slice(0, limit === Infinity ? queue.length : limit);

  return { queue: limited, skipped, totalCandidates: queue.length };
}

export async function sendOutreachCampaign(sql, opts) {
  const {
    apply = false,
    staffId = null,
    resendApiKey,
    emailFrom = "Cultimed <no-reply@dispensariocultimed.cl>",
    emailReplyTo = "contacto@dispensariocultimed.cl",
    delayMs = 400,
    ...queueOpts
  } = opts;

  const { queue, skipped, totalCandidates } = await buildOutreachQueue(sql, queueOpts);
  const stats = {
    mode: apply ? "apply" : "dry-run",
    segment: queueOpts.segment || "all",
    queued: queue.length,
    totalCandidates,
    skipped,
    sent: 0,
    failed: 0,
    errors: [],
    preview: [],
  };

  for (const item of queue) {
    let ctaUrl = item.ctaUrl;
    if (item.needsToken && item.accountId) {
      ctaUrl = await createActivationLink(
        sql,
        item.accountId,
        queueOpts.storeBase || "https://dispensariocultimed.cl",
        apply
      );
    }

    const { subject, html, text } = buildOutreachEmail(item.template, {
      fullName: item.patient.full_name,
      storeBase: queueOpts.storeBase || "https://dispensariocultimed.cl",
      ctaUrl,
      missingFields: item.missingFields || [],
      missingDocs: item.missingDocs || [],
    });

    const row = {
      patient_id: item.patient.id,
      name: item.patient.full_name,
      email: item.email,
      template: item.template,
      segment: item.segment,
      reason: item.reason,
      subject,
    };

    if (!apply) {
      stats.preview.push(row);
      stats.sent++;
      continue;
    }

    if (!resendApiKey) {
      stats.failed++;
      stats.errors.push({ patient_id: item.patient.id, error: "RESEND_API_KEY missing" });
      continue;
    }

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: emailFrom,
          to: [item.email],
          reply_to: emailReplyTo,
          subject,
          html,
          text,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        stats.failed++;
        stats.errors.push({
          patient_id: item.patient.id,
          email: item.email,
          error: body?.message || `HTTP ${res.status}`,
        });
        continue;
      }

      await sql`
        INSERT INTO audit_logs (staff_id, action, entity_type, entity_id, details)
        VALUES (
          ${staffId},
          'outreach_email_sent',
          'patient',
          ${item.patient.id},
          ${sql.json({
            email: item.email,
            template: item.template,
            segment: item.segment,
            resend_id: body.id,
            subject,
          })}
        )
      `;
      stats.sent++;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    } catch (err) {
      stats.failed++;
      stats.errors.push({
        patient_id: item.patient.id,
        email: item.email,
        error: err?.message || String(err),
      });
    }
  }

  return stats;
}