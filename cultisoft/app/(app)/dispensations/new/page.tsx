import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { formatCLP } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import NewDispensationClient from "./NewDispensationClient";

export const dynamic = "force-dynamic";

export interface PatientLite {
  id: number; rut: string; full_name: string;
  membership_status: string;
  allergies: string | null; chronic_conditions: string | null;
}
export interface BatchLite {
  id: number; product_id: number; sku: string; name: string;
  category: string; presentation: string | null;
  batch_number: string; quantity_current: number;
  price_per_unit: number;
  is_controlled: number; requires_prescription: number;
  expiry_date: string | null;
  thc_percentage: number | null; cbd_percentage: number | null;
}
export interface RxLite {
  id: number; folio: string; status: string; expiry_date: string;
  diagnosis: string | null; doctor_name: string;
}

async function createDispensation(formData: FormData) {
  "use server";
  const staff = await requireStaff();

  const patientId = Number(formData.get("patient_id"));
  const prescriptionId = Number(formData.get("prescription_id")) || null;
  const paymentMethod = String(formData.get("payment_method") || "efectivo");
  const notes = String(formData.get("notes") || "").trim() || null;

  const itemsJson = String(formData.get("items_json") || "[]");
  let items: { batchId: number; productId: number; quantity: number; price: number }[];
  try {
    items = JSON.parse(itemsJson);
  } catch {
    redirect("/dispensations/new?e=bad_items");
  }
  if (!patientId || items.length === 0) redirect("/dispensations/new?e=missing");

  const folio = `DISP-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  let total = 0;
  for (const it of items) total += it.price * it.quantity;

  let dispId = 0;
  let stockError = "";

  await transaction(async (tx) => {
    // Verify stock again at commit time
    for (const it of items) {
      const b = await tx.get<{ q: number; pr: number }>(`SELECT quantity_current as q, price_per_unit as pr FROM batches WHERE id = ?`, it.batchId);
      if (!b || b.q < it.quantity) {
        stockError = `Stock insuficiente en lote #${it.batchId}`;
        throw new Error(stockError);
      }
    }

    const r = await tx.run(
      `INSERT INTO dispensations (folio, patient_id, prescription_id, dispenser_id, total_amount,
         payment_method, payment_status, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'paid', 'completed', ?)`,
      folio, patientId, prescriptionId, staff.id, total, paymentMethod, notes
    );
    dispId = Number(r.lastInsertRowid);

    for (const it of items) {
      await tx.run(
        `INSERT INTO dispensation_items (dispensation_id, batch_id, product_id, quantity, price_per_unit, total_price)
         VALUES (?, ?, ?, ?, ?, ?)`,
        dispId, it.batchId, it.productId, it.quantity, it.price, it.price * it.quantity
      );
      await tx.run(
        `UPDATE batches SET quantity_current = quantity_current - ?,
           status = CASE WHEN quantity_current - ? <= 0 THEN 'depleted' ELSE status END
         WHERE id = ?`,
        it.quantity, it.quantity, it.batchId
      );
      await tx.run(
        `INSERT INTO inventory_movements (batch_id, movement_type, quantity, reference_type, reference_id, staff_id, reason)
         VALUES (?, 'out', ?, 'dispensation', ?, ?, 'Dispensación')`,
        it.batchId, -it.quantity, dispId, staff.id
      );
      // If linked to a Rx, increment the dispensed counter for that product
      if (prescriptionId) {
        await tx.run(
          `UPDATE prescription_items SET quantity_dispensed = quantity_dispensed + ?
           WHERE prescription_id = ? AND product_id = ?`,
          it.quantity, prescriptionId, it.productId
        );
      }
    }
  });

  await logAudit({
    staffId: staff.id, action: "dispensation_created",
    entityType: "dispensation", entityId: dispId,
    details: { folio, items: items.length, total, prescriptionId },
  });

  redirect(`/dispensations/${dispId}?success=1`);
}

export default async function NewDispensationPage({
  searchParams,
}: {
  searchParams: { patient?: string; prescription?: string; e?: string };
}) {
  await requireStaff();

  const patients = await all<PatientLite>(
    `SELECT id, rut, full_name, membership_status, allergies, chronic_conditions
     FROM patients ORDER BY full_name LIMIT 1000`
  );
  const batches = await all<BatchLite>(
    `SELECT b.id, b.product_id, pr.sku, pr.name, pr.category, pr.presentation,
       b.batch_number, b.quantity_current, b.price_per_unit,
       pr.is_controlled, pr.requires_prescription, b.expiry_date,
       pr.thc_percentage, pr.cbd_percentage
     FROM batches b
     JOIN products pr ON pr.id = b.product_id
     WHERE b.status = 'available' AND b.quantity_current > 0
     ORDER BY pr.name, b.expiry_date ASC`
  );
  const prescriptions = await all<RxLite>(
    `SELECT r.id, r.folio, r.status, r.expiry_date, r.diagnosis,
       d.full_name as doctor_name, r.patient_id
     FROM prescriptions r
     JOIN doctors d ON d.id = r.doctor_id
     WHERE r.status = 'active' AND r.expiry_date >= CURRENT_DATE
     ORDER BY r.created_at DESC`
  );

  const preselectPatient = searchParams.patient ? Number(searchParams.patient) : null;
  const preselectRx = searchParams.prescription ? Number(searchParams.prescription) : null;
  const errMsg = searchParams.e === "missing" ? "Selecciona un paciente y al menos un producto." : null;

  return (
    <>
      <PageHeader
        title="Nueva dispensación"
        subtitle="Registra la entrega de productos al paciente. El stock se descuenta automáticamente."
        actions={<Link href="/dispensations" className="btn-secondary">Cancelar</Link>}
      />
      {errMsg && (
        <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg flex gap-2 items-start">
          <span className="material-symbols-outlined ms-fill text-error mt-0.5">error</span>
          <p className="text-sm text-on-error-container">{errMsg}</p>
        </div>
      )}
      <NewDispensationClient
        patients={patients}
        batches={batches}
        prescriptions={prescriptions as any}
        preselectPatient={preselectPatient}
        preselectRx={preselectRx}
        onSubmit={createDispensation}
      />
    </>
  );
}
