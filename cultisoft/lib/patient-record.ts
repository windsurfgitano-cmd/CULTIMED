import { all, get } from "./db";
import { resolveStorageUrl } from "./storage";

export interface PatientCore {
  id: number;
  rut: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  notes: string | null;
  membership_status: string;
  membership_started_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PatientRx {
  id: number;
  folio: string;
  diagnosis: string;
  status: string;
  issue_date: string;
  expiry_date: string;
  doctor_name: string;
}

export interface PatientDispensation {
  id: number;
  folio: string;
  total_amount: number;
  status: string;
  dispensed_at: string;
  product_count: number;
}

export interface PatientAccount {
  id: number;
  email: string;
  full_name: string | null;
  rut: string | null;
  phone: string | null;
  patient_id: number | null;
  prescription_status: string;
  prescription_url: string | null;
  prescription_uploaded_at: string | null;
  prescription_reviewed_at: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  criminal_record_url: string | null;
  rights_assignment_url: string | null;
  is_ambassador: number;
  created_at: string;
  updated_at: string;
  link_source: "patient_id" | "rut" | "email";
}

export interface PatientWebOrder {
  id: number;
  folio: string;
  status: string;
  total: number;
  payment_method: string;
  created_at: string;
  customer_email: string;
  customer_account_id: number;
  item_count: number;
}

export interface PatientTimelineEvent {
  at: string;
  kind: string;
  title: string;
  detail: string | null;
  href: string | null;
}

export interface PatientDocument {
  key: string;
  label: string;
  stored: string | null;
  url: string | null;
  isImage: boolean;
}

export interface PatientAuditEntry {
  id: number;
  action: string;
  staff_name: string | null;
  created_at: string;
}

export interface PatientRecord {
  patient: PatientCore;
  prescriptions: PatientRx[];
  dispensations: PatientDispensation[];
  accounts: Array<PatientAccount & { documents: PatientDocument[] }>;
  webOrders: PatientWebOrder[];
  timeline: PatientTimelineEvent[];
  audits: PatientAuditEntry[];
  totals: {
    dispensed: number;
    dispensation_count: number;
    web_orders: number;
    web_spent: number;
    active_rx: number;
  };
}

function normalizeRut(rut: string | null | undefined): string | null {
  if (!rut) return null;
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

function isImageUrl(url: string | null): boolean {
  if (!url) return false;
  return /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url) || url.includes("image/");
}

export async function loadPatientRecord(patientId: number): Promise<PatientRecord | null> {
  const patient = await get<PatientCore>(`SELECT * FROM patients WHERE id = ?`, patientId);
  if (!patient) return null;

  const patientRut = normalizeRut(patient.rut);
  const patientEmail = patient.email?.trim().toLowerCase() || null;

  const prescriptions = await all<PatientRx>(
    `SELECT r.id, r.folio, r.diagnosis, r.status, r.issue_date, r.expiry_date,
       d.full_name as doctor_name
     FROM prescriptions r
     JOIN doctors d ON d.id = r.doctor_id
     WHERE r.patient_id = ?
     ORDER BY r.issue_date DESC`,
    patientId
  );

  const dispensations = await all<PatientDispensation>(
    `SELECT d.id, d.folio, d.total_amount, d.status, d.dispensed_at,
       (SELECT COUNT(*) FROM dispensation_items di WHERE di.dispensation_id = d.id) as product_count
     FROM dispensations d
     WHERE d.patient_id = ?
     ORDER BY d.dispensed_at DESC`,
    patientId
  );

  const rawAccounts = await all<PatientAccount & { link_source: string }>(
    `SELECT c.id, c.email, c.full_name, c.rut, c.phone, c.patient_id,
       c.prescription_status, c.prescription_url, c.prescription_uploaded_at, c.prescription_reviewed_at,
       c.id_front_url, c.id_back_url, c.criminal_record_url, c.rights_assignment_url,
       COALESCE(c.is_ambassador, 0) as is_ambassador,
       c.created_at, c.updated_at,
       CASE
         WHEN c.patient_id = ? THEN 'patient_id'
         WHEN ? IS NOT NULL AND REPLACE(REPLACE(UPPER(c.rut), '.', ''), '-', '') = ? THEN 'rut'
         WHEN ? IS NOT NULL AND LOWER(c.email) = ? THEN 'email'
         ELSE 'patient_id'
       END as link_source
     FROM customer_accounts c
     WHERE c.patient_id = ?
        OR (? IS NOT NULL AND REPLACE(REPLACE(UPPER(c.rut), '.', ''), '-', '') = ?)
        OR (? IS NOT NULL AND LOWER(c.email) = ?)
     ORDER BY c.created_at DESC`,
    patientId,
    patientRut, patientRut,
    patientEmail, patientEmail,
    patientId,
    patientRut, patientRut,
    patientEmail, patientEmail
  );

  const accountIds = [...new Set(rawAccounts.map((a) => a.id))];
  let webOrders: PatientWebOrder[] = [];
  if (accountIds.length > 0) {
    const placeholders = accountIds.map(() => "?").join(",");
    webOrders = await all<PatientWebOrder>(
      `SELECT o.id, o.folio, o.status, o.total, o.payment_method, o.created_at,
         c.email as customer_email, o.customer_account_id,
         (SELECT COUNT(*) FROM customer_order_items i WHERE i.order_id = o.id) as item_count
       FROM customer_orders o
       JOIN customer_accounts c ON c.id = o.customer_account_id
       WHERE o.customer_account_id IN (${placeholders})
       ORDER BY o.created_at DESC`,
      ...accountIds
    );
  }

  const docDefs = (acc: PatientAccount) => [
    { key: "prescription", url: acc.prescription_url, label: "Receta médica" },
    { key: "id_front", url: acc.id_front_url, label: "Carnet (frente)" },
    { key: "id_back", url: acc.id_back_url, label: "Carnet (dorso)" },
    { key: "criminal_record", url: acc.criminal_record_url, label: "Antecedentes penales" },
    { key: "rights_assignment", url: acc.rights_assignment_url, label: "Cesión de derechos" },
  ];

  const accounts = await Promise.all(
    rawAccounts.map(async (acc) => {
      const documents: PatientDocument[] = [];
      for (const d of docDefs(acc)) {
        const resolved = d.url ? await resolveStorageUrl(d.url) : null;
        documents.push({
          key: d.key,
          label: d.label,
          stored: d.url,
          url: resolved,
          isImage: isImageUrl(resolved || d.url),
        });
      }
      return { ...acc, documents };
    })
  );

  const orderEvents =
    accountIds.length > 0
      ? await all<{ at: string; title: string; detail: string | null; order_id: number; folio: string }>(
          `SELECT e.created_at as at, e.event_type as title, e.message as detail,
             o.id as order_id, o.folio
           FROM customer_order_events e
           JOIN customer_orders o ON o.id = e.order_id
           WHERE o.customer_account_id IN (${accountIds.map(() => "?").join(",")})
           ORDER BY e.created_at DESC
           LIMIT 40`,
          ...accountIds
        )
      : [];

  const timeline: PatientTimelineEvent[] = [];

  timeline.push({
    at: patient.created_at,
    kind: "patient",
    title: "Paciente registrado en Cultisoft",
    detail: patient.rut,
    href: null,
  });

  for (const r of prescriptions) {
    timeline.push({
      at: r.issue_date,
      kind: "prescription",
      title: `Receta ${r.folio} · ${r.status}`,
      detail: r.diagnosis,
      href: `/prescriptions/${r.id}`,
    });
  }

  for (const d of dispensations) {
    timeline.push({
      at: d.dispensed_at,
      kind: "dispensation",
      title: `Dispensación ${d.folio}`,
      detail: d.status,
      href: `/dispensations/${d.id}`,
    });
  }

  for (const o of webOrders) {
    timeline.push({
      at: o.created_at,
      kind: "web_order",
      title: `Pedido web ${o.folio} · ${o.status}`,
      detail: o.customer_email,
      href: `/web-orders/${o.id}`,
    });
  }

  for (const e of orderEvents) {
    timeline.push({
      at: e.at,
      kind: "order_event",
      title: `Pedido ${e.folio}: ${e.title}`,
      detail: e.detail,
      href: `/web-orders/${e.order_id}`,
    });
  }

  for (const acc of accounts) {
    if (acc.prescription_uploaded_at) {
      timeline.push({
        at: acc.prescription_uploaded_at,
        kind: "web_rx",
        title: `Receta web subida · ${acc.email}`,
        detail: acc.prescription_status,
        href: `/web-prescriptions/${acc.id}`,
      });
    }
    if (acc.prescription_reviewed_at) {
      timeline.push({
        at: acc.prescription_reviewed_at,
        kind: "web_rx_review",
        title: `Receta web revisada · ${acc.prescription_status}`,
        detail: acc.email,
        href: `/web-prescriptions/${acc.id}`,
      });
    }
    timeline.push({
      at: acc.created_at,
      kind: "account",
      title: `Cuenta web creada · ${acc.email}`,
      detail: acc.link_source !== "patient_id" ? `Vinculada por ${acc.link_source}` : null,
      href: `/web-prescriptions/${acc.id}`,
    });
  }

  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const audits = await all<PatientAuditEntry>(
    `SELECT a.id, a.action, s.full_name as staff_name, a.created_at
     FROM audit_logs a
     LEFT JOIN staff s ON s.id = a.staff_id
     WHERE (a.entity_type = 'patient' AND a.entity_id = ?)
        OR (a.entity_type = 'customer_account' AND a.entity_id IN (${accountIds.length ? accountIds.map(() => "?").join(",") : "NULL"}))
     ORDER BY a.created_at DESC
     LIMIT 30`,
    patientId,
    ...(accountIds.length ? accountIds : [])
  );

  const dispTotals = await get<{ total: number; count: number }>(
    `SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
     FROM dispensations WHERE patient_id = ? AND status = 'completed'`,
    patientId
  );

  const webTotals = await get<{ total: number; count: number }>(
    accountIds.length
      ? `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
         FROM customer_orders WHERE customer_account_id IN (${accountIds.map(() => "?").join(",")})
           AND status NOT IN ('cancelled', 'rejected')`
      : `SELECT 0 as total, 0 as count`,
    ...(accountIds.length ? accountIds : [])
  );

  return {
    patient,
    prescriptions,
    dispensations,
    accounts,
    webOrders,
    timeline: timeline.slice(0, 60),
    audits,
    totals: {
      dispensed: dispTotals?.total ?? 0,
      dispensation_count: dispTotals?.count ?? 0,
      web_orders: webTotals?.count ?? 0,
      web_spent: webTotals?.total ?? 0,
      active_rx: prescriptions.filter((r) => r.status === "active").length,
    },
  };
}