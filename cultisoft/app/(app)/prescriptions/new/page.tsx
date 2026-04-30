import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, run, transaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import PageHeader from "@/components/PageHeader";

interface PatientOption { id: number; rut: string; full_name: string; }
interface DoctorOption { id: number; full_name: string; professional_license: string; }
interface ProductOption { id: number; sku: string; name: string; requires_prescription: number; is_controlled: number; }

async function createPrescription(formData: FormData) {
  "use server";
  const staff = requireStaff();
  const patientId = Number(formData.get("patient_id"));
  const doctorId = Number(formData.get("doctor_id"));
  const diagnosis = String(formData.get("diagnosis") || "").trim();
  const code = String(formData.get("diagnosis_code") || "").trim() || null;
  const issued = String(formData.get("issue_date") || "").trim() || new Date().toISOString().slice(0, 10);
  const expires = String(formData.get("expiry_date") || "").trim();
  const retained = formData.get("is_retained") ? 1 : 0;
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!patientId || !doctorId || !expires) redirect("/prescriptions/new?e=incomplete");

  // Items
  const productIds = formData.getAll("item_product_id").map((v) => Number(v));
  const qtys = formData.getAll("item_quantity").map((v) => Number(v));
  const dosages = formData.getAll("item_dosage").map((v) => String(v));
  const items: { productId: number; qty: number; dosage: string }[] = [];
  for (let i = 0; i < productIds.length; i++) {
    if (productIds[i] && qtys[i] > 0) {
      items.push({ productId: productIds[i], qty: qtys[i], dosage: dosages[i] || "" });
    }
  }
  if (items.length === 0) redirect("/prescriptions/new?e=no_items");

  // Folio
  const folioBase = `RX-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;

  let newId = 0;
  transaction(() => {
    const r = run(
      `INSERT INTO prescriptions (folio, patient_id, doctor_id, diagnosis, diagnosis_code,
         issue_date, expiry_date, is_retained, status, verified_by, verified_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, CURRENT_TIMESTAMP, ?)`,
      folioBase, patientId, doctorId, diagnosis, code, issued, expires, retained, staff.id, notes
    );
    newId = Number(r.lastInsertRowid);
    for (const it of items) {
      run(
        `INSERT INTO prescription_items (prescription_id, product_id, quantity_prescribed, quantity_dispensed, dosage_instructions)
         VALUES (?, ?, ?, 0, ?)`,
        newId, it.productId, it.qty, it.dosage || null
      );
    }
    logAudit({ staffId: staff.id, action: "prescription_created", entityType: "prescription", entityId: newId, details: { folio: folioBase, items: items.length } });
  });

  redirect(`/prescriptions/${newId}`);
}

const ERR: Record<string, string> = {
  incomplete: "Faltan datos obligatorios (paciente, médico, fecha de vencimiento).",
  no_items: "Debes agregar al menos un producto a la receta.",
};

export default function NewPrescriptionPage({ searchParams }: { searchParams: { e?: string; patient?: string } }) {
  requireStaff();
  const patients = all<PatientOption>(`SELECT id, rut, full_name FROM patients ORDER BY full_name LIMIT 500`);
  const doctors = all<DoctorOption>(`SELECT id, full_name, professional_license FROM doctors WHERE is_active = 1 ORDER BY full_name`);
  const products = all<ProductOption>(`SELECT id, sku, name, requires_prescription, is_controlled FROM products WHERE is_active = 1 AND requires_prescription = 1 ORDER BY name`);
  const error = searchParams.e ? ERR[searchParams.e] : null;
  const preselectedPatient = searchParams.patient ? Number(searchParams.patient) : undefined;

  // Default expiry: 60 days from today
  const defaultExpiry = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 60);
    return d.toISOString().slice(0, 10);
  })();

  return (
    <>
      <PageHeader
        title="Cargar nueva receta"
        subtitle="Asocia una receta médica al paciente para autorizar la dispensación de productos controlados o de prescripción."
        actions={<Link href="/prescriptions" className="btn-secondary">Volver</Link>}
      />

      {error && (
        <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg flex gap-2 items-start">
          <span className="material-symbols-outlined ms-fill text-error mt-0.5">error</span>
          <p className="text-sm text-on-error-container">{error}</p>
        </div>
      )}

      <form action={createPrescription} className="space-y-6">
        <div className="clinical-card p-6 grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          <h2 className="md:col-span-2 text-sm font-bold text-on-surface flex items-center gap-2 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">person_search</span>
            Paciente y médico
          </h2>
          <div>
            <label className="input-label">Paciente *</label>
            <select name="patient_id" required defaultValue={preselectedPatient} className="input-field">
              <option value="">— Selecciona un paciente —</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name} · {p.rut}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label">Médico tratante *</label>
            <select name="doctor_id" required className="input-field">
              <option value="">— Selecciona un médico —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name} · {d.professional_license}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="input-label">Fecha emisión</label>
            <input name="issue_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input-field" />
          </div>
          <div>
            <label className="input-label">Fecha vencimiento *</label>
            <input name="expiry_date" type="date" defaultValue={defaultExpiry} required className="input-field" />
          </div>
          <div className="md:col-span-2">
            <label className="input-label">Diagnóstico</label>
            <input name="diagnosis" className="input-field" placeholder="Ej: Lumbalgia crónica con componente neuropático" />
          </div>
          <div>
            <label className="input-label">Código (CIE-10)</label>
            <input name="diagnosis_code" className="input-field" placeholder="Ej: M54.5" />
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" name="is_retained" className="w-4 h-4 accent-primary" />
              <span>Receta retenida (estupefaciente)</span>
            </label>
          </div>
        </div>

        <div className="clinical-card p-6">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">medication</span>
            Productos prescritos
          </h2>

          <div id="items">
            <Item products={products} />
            <Item products={products} />
          </div>

          <p className="text-[11px] text-on-surface-variant mt-3">
            Tip: agrega tantas filas como necesites. Las filas vacías se ignoran al guardar.
          </p>
        </div>

        <div className="clinical-card p-6">
          <label className="input-label">Notas / observaciones</label>
          <textarea name="notes" rows={3} className="input-field" placeholder="Indicaciones adicionales, plan de seguimiento..." />
        </div>

        <div className="flex justify-end gap-3">
          <Link href="/prescriptions" className="btn-secondary">Cancelar</Link>
          <button type="submit" className="btn-primary">
            <span className="material-symbols-outlined text-base">save</span>
            Guardar receta
          </button>
        </div>
      </form>
    </>
  );
}

function Item({ products }: { products: ProductOption[] }) {
  return (
    <div className="grid grid-cols-12 gap-3 mb-3 items-start">
      <div className="col-span-12 md:col-span-6">
        <label className="input-label">Producto</label>
        <select name="item_product_id" className="input-field">
          <option value="">—</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku}){p.is_controlled ? " ⚠" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="col-span-4 md:col-span-2">
        <label className="input-label">Cantidad</label>
        <input name="item_quantity" type="number" min="0" step="1" className="input-field" placeholder="0" />
      </div>
      <div className="col-span-8 md:col-span-4">
        <label className="input-label">Posología</label>
        <input name="item_dosage" className="input-field" placeholder="Ej: 5 gotas sublinguales c/12h" />
      </div>
    </div>
  );
}
