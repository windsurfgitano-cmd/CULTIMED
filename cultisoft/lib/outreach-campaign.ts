import crypto from "node:crypto";
import { getSql } from "./db";
import { sendEmail } from "./email";
import { logAudit } from "./audit";
import { buildOutreachEmail, type OutreachTemplate } from "./outreach-email-html";

export const OUTREACH_SEGMENTS = [
  "all",
  "complete_profile",
  "missing_docs",
  "no_valid_rx",
  "no_web_account",
  "activation_reminder",
] as const;

export type OutreachSegment = (typeof OUTREACH_SEGMENTS)[number];

const DOC_FIELDS = [
  "prescription_url",
  "id_front_url",
  "id_back_url",
  "criminal_record_url",
  "rights_assignment_url",
] as const;

const STATIC_SKIP_EMAILS = new Set(["contacto@dispensariocultimed.cl"]);

const TEMPLATE_PRIORITY: OutreachTemplate[] = [
  "register_account",
  "activation_reminder",
  "resubmit_rx",
  "upload_rx",
  "upload_docs",
  "complete_profile",
];

export interface OutreachPreviewRow {
  patient_id: number;
  name: string;
  email: string;
  template: OutreachTemplate;
  segment: string;
  reason: string;
  subject: string;
}

export interface OutreachCampaignStats {
  mode: "dry-run" | "apply";
  segment: string;
  queued: number;
  totalCandidates: number;
  sent: number;
  failed: number;
  skipped: Record<string, number>;
  preview: OutreachPreviewRow[];
  errors: Array<{ patient_id?: number; email?: string; error: string }>;
}

interface PatientRow {
  id: number;
  full_name: string;
  rut: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  city: string | null;
}

interface AccountRow {
  id: number;
  email: string;
  patient_id: number | null;
  password_hash: string | null;
  prescription_status: string;
  prescription_url: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  criminal_record_url: string | null;
  rights_assignment_url: string | null;
  created_at: string;
  matched_patient_id: number;
}

interface QueueItem {
  patient: PatientRow;
  template: OutreachTemplate;
  email: string;
  ctaUrl: string | null;
  segment: string;
  reason: string;
  accountId?: number;
  needsToken?: boolean;
  missingFields?: string[];
  missingDocs?: string[];
}

function hasUrl(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

function isValidEmail(email: string | null | undefined, skipEmails: Set<string>): boolean {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  if (skipEmails.has(e)) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function missingPatientFields(p: PatientRow): string[] {
  const missing: string[] = [];
  if (!p.rut?.trim()) missing.push("RUT");
  if (!p.phone?.trim()) missing.push("Teléfono");
  if (!p.email?.trim()) missing.push("Email");
  if (!p.date_of_birth) missing.push("Fecha de nacimiento");
  if (!p.city?.trim()) missing.push("Comuna");
  return missing;
}

function missingDocFields(acc: AccountRow): string[] {
  return DOC_FIELDS.filter((f) => !hasUrl(acc[f]));
}

function pickPrimaryAccount(linked: AccountRow[]): AccountRow | null {
  if (!linked.length) return null;
  return [...linked].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )[0]!;
}

function categorizeNoValidRx(linked: AccountRow[], hadExpiredInternal: boolean): string {
  if (!linked.length) return hadExpiredInternal ? "internal_expired_only" : "no_web_account";
  const statuses = new Set(linked.map((a) => a.prescription_status));
  if (statuses.has("pending")) return "has_web_pending";
  if (statuses.has("rechazada")) return "has_web_rechazada";
  if (statuses.has("none") || statuses.has("expired")) return "has_web_none";
  return hadExpiredInternal ? "internal_expired_only" : "has_web_none";
}

function resolveRecipient(
  patient: PatientRow,
  accountsByPatient: Map<number, AccountRow[]>,
  validInternalSet: Set<number>,
  expiredInternalSet: Set<number>,
  storeBase: string,
  skipEmails: Set<string>
): QueueItem | null {
  const linked = accountsByPatient.get(patient.id) || [];
  const primary = pickPrimaryAccount(linked);
  const missingFields = missingPatientFields(patient);
  const missingDocs = primary ? missingDocFields(primary) : [];
  const criticalDocs = missingDocs.filter((d) => d === "prescription_url" || d === "id_front_url");
  const hasValidRx =
    validInternalSet.has(patient.id) || linked.some((a) => a.prescription_status === "aprobada");

  const candidates: QueueItem[] = [];

  if (!linked.length && !hasValidRx && isValidEmail(patient.email, skipEmails)) {
    candidates.push({
      patient,
      template: "register_account",
      email: patient.email!,
      ctaUrl: `${storeBase}/registro?email=${encodeURIComponent(patient.email!)}`,
      segment: "no_web_account",
      reason: "sin cuenta web",
    });
  }

  if (primary && (!primary.password_hash || primary.password_hash === "") && isValidEmail(primary.email, skipEmails)) {
    candidates.push({
      patient,
      template: "activation_reminder",
      email: primary.email,
      ctaUrl: null,
      accountId: primary.id,
      needsToken: true,
      segment: "activation_reminder",
      reason: "cuenta sin activar",
    });
  }

  if (!hasValidRx && linked.length) {
    const cat = categorizeNoValidRx(linked, expiredInternalSet.has(patient.id));
    const email = primary?.email || patient.email;
    if (isValidEmail(email, skipEmails) && cat !== "has_web_pending") {
      candidates.push({
        patient,
        template: cat === "has_web_rechazada" ? "resubmit_rx" : "upload_rx",
        email: email!,
        ctaUrl: `${storeBase}/mi-cuenta/recetas`,
        segment: "no_valid_rx",
        reason: cat,
      });
    }
  }

  if (primary && criticalDocs.length && isValidEmail(primary.email || patient.email, skipEmails)) {
    candidates.push({
      patient,
      template: "upload_docs",
      email: (primary.email || patient.email)!,
      ctaUrl: `${storeBase}/mi-cuenta/perfil`,
      segment: "missing_docs",
      reason: `faltan: ${criticalDocs.join(", ")}`,
      missingDocs: criticalDocs,
    });
  }

  if (missingFields.length && isValidEmail(primary?.email || patient.email, skipEmails)) {
    const hasAccount = Boolean(primary?.password_hash);
    candidates.push({
      patient,
      template: "complete_profile",
      email: (primary?.email || patient.email)!,
      ctaUrl: hasAccount ? `${storeBase}/mi-cuenta/perfil` : `${storeBase}/registro`,
      segment: "complete_profile",
      reason: `faltan: ${missingFields.join(", ")}`,
      missingFields,
    });
  }

  if (!candidates.length) return null;
  for (const tpl of TEMPLATE_PRIORITY) {
    const hit = candidates.find((c) => c.template === tpl);
    if (hit) return hit;
  }
  return candidates[0]!;
}

async function createActivationLink(accountId: number, storeBase: string, apply: boolean): Promise<string> {
  if (!apply) return `${storeBase}/recuperar/dry-run-token`;
  const sql = getSql();
  const raw = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(raw).digest("hex");
  await sql`
    INSERT INTO password_reset_tokens (account_type, account_id, token_hash, expires_at, requested_ip)
    VALUES ('customer', ${accountId}, ${tokenHash}, CURRENT_TIMESTAMP + INTERVAL '14 days', 'outreach-campaign')
  `;
  return `${storeBase}/recuperar/${raw}`;
}

export async function runOutreachCampaign(opts: {
  segment: OutreachSegment;
  limit?: number;
  cooldownDays?: number;
  storeBase?: string;
  apply?: boolean;
  staffId?: number | null;
  delayMs?: number;
}): Promise<OutreachCampaignStats> {
  const sql = getSql();
  const segment = opts.segment;
  const limit = opts.limit ?? 50;
  const cooldownDays = opts.cooldownDays ?? 7;
  const storeBase = opts.storeBase || process.env.NEXT_PUBLIC_STORE_URL || "https://dispensariocultimed.cl";
  const apply = opts.apply ?? false;
  const delayMs = opts.delayMs ?? 400;

  // Excluye emails del propio equipo (staff) para no mandarles la campaña como si
  // fueran pacientes reales — puede coincidir por cuentas compartidas o pacientes
  // legacy de Shopify que resultaron ser el mismo staff.
  const staffEmails = await sql<{ email: string }[]>`SELECT email FROM staff`;
  const skipEmails = new Set([
    ...STATIC_SKIP_EMAILS,
    ...staffEmails.map((s) => s.email.trim().toLowerCase()),
  ]);

  const patients = await sql<PatientRow[]>`
    SELECT id, full_name, rut, email, phone, date_of_birth, city
    FROM patients WHERE membership_status IS DISTINCT FROM 'deleted' ORDER BY id
  `;

  const accounts = await sql<AccountRow[]>`
    SELECT c.id, c.email, c.patient_id, c.password_hash, c.prescription_status,
      c.prescription_url, c.id_front_url, c.id_back_url, c.criminal_record_url,
      c.rights_assignment_url, c.created_at, p.id AS matched_patient_id
    FROM customer_accounts c
    JOIN patients p ON p.membership_status IS DISTINCT FROM 'deleted'
      AND (c.patient_id = p.id OR (
        p.rut IS NOT NULL AND p.rut <> '' AND c.rut IS NOT NULL AND c.rut <> ''
        AND REPLACE(REPLACE(UPPER(c.rut), '.', ''), '-', '') = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
      ) OR (p.email IS NOT NULL AND p.email <> '' AND LOWER(c.email) = LOWER(p.email)))
    ORDER BY c.created_at ASC
  `;

  const validInternal = await sql<{ patient_id: number }[]>`
    SELECT DISTINCT patient_id FROM prescriptions WHERE status = 'active' AND expiry_date >= CURRENT_DATE
  `;
  const expiredInternal = await sql<{ patient_id: number }[]>`
    SELECT DISTINCT patient_id FROM prescriptions
    WHERE expiry_date < CURRENT_DATE AND status NOT IN ('rejected', 'pending')
  `;
  const validInternalSet = new Set(validInternal.map((r) => r.patient_id));
  const expiredInternalSet = new Set(expiredInternal.map((r) => r.patient_id));

  const accountsByPatient = new Map<number, AccountRow[]>();
  for (const acc of accounts) {
    const pid = acc.matched_patient_id;
    if (!accountsByPatient.has(pid)) accountsByPatient.set(pid, []);
    accountsByPatient.get(pid)!.push(acc);
  }

  const recentRows = await sql<{ patient_id: number }[]>`
    SELECT DISTINCT entity_id AS patient_id FROM audit_logs
    WHERE action = 'outreach_email_sent' AND entity_type = 'patient'
      AND created_at >= NOW() - (${cooldownDays} * INTERVAL '1 day')
  `;
  const recentSet = new Set(recentRows.map((r) => r.patient_id));

  const skipped = { cooldown: 0, no_email: 0, merged: 0, segment: 0 };
  const queue: QueueItem[] = [];

  for (const patient of patients) {
    if (patient.rut?.startsWith("MERGED-")) {
      skipped.merged++;
      continue;
    }
    const item = resolveRecipient(
      patient,
      accountsByPatient,
      validInternalSet,
      expiredInternalSet,
      storeBase,
      skipEmails
    );
    if (!item) continue;
    if (segment !== "all" && item.segment !== segment) {
      skipped.segment++;
      continue;
    }
    if (recentSet.has(patient.id)) {
      skipped.cooldown++;
      continue;
    }
    if (!isValidEmail(item.email, skipEmails)) {
      skipped.no_email++;
      continue;
    }
    queue.push(item);
  }

  queue.sort((a, b) => a.patient.id - b.patient.id);
  const batch = queue.slice(0, limit);

  const stats: OutreachCampaignStats = {
    mode: apply ? "apply" : "dry-run",
    segment,
    queued: batch.length,
    totalCandidates: queue.length,
    sent: 0,
    failed: 0,
    skipped,
    preview: [],
    errors: [],
  };

  for (const item of batch) {
    let ctaUrl = item.ctaUrl || storeBase;
    if (item.needsToken && item.accountId) {
      ctaUrl = await createActivationLink(item.accountId, storeBase, apply);
    }

    const { subject, html, text } = buildOutreachEmail(item.template, {
      fullName: item.patient.full_name,
      ctaUrl,
      missingFields: item.missingFields,
      missingDocs: item.missingDocs,
    });

    const row: OutreachPreviewRow = {
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

    const result = await sendEmail({ to: item.email, subject, html, text });
    if (!result.ok) {
      stats.failed++;
      stats.errors.push({ patient_id: item.patient.id, email: item.email, error: result.error || "send failed" });
      continue;
    }

    await logAudit({
      staffId: opts.staffId ?? null,
      action: "outreach_email_sent",
      entityType: "patient",
      entityId: item.patient.id,
      details: {
        email: item.email,
        template: item.template,
        segment: item.segment,
        resend_id: result.id,
        subject,
      },
    });

    stats.preview.push(row);
    stats.sent++;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  return stats;
}