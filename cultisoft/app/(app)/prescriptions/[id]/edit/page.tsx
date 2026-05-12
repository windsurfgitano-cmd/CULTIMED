// Editar receta interna (admin/superadmin).
// Permite cambiar: diagnóstico, código diag, fechas (issue/expiry), is_retained, notas.
// NO permite cambiar items dispensados ni paciente/doctor (esos requieren receta nueva).
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff, isAdminOrAbove } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface RxRow {
  id: number;
  folio: string;
  status: string;
  is_retained: number;
  diagnosis: string | null;
  diagnosis_code: string | null;
  issue_date: string;
  expiry_date: string;
  notes: string | null;
  patient_name: string;
  doctor_name: string;
}

async function updateAction(formData: FormData) {
  "use server";
  const staff = await requireStaff();
  if (!isAdminOrAbove(staff)) redirect("/prescriptions");

  const id = Number(formData.get("id"));
  if (!id) redirect("/prescriptions");

  const diagnosis = String(formData.get("diagnosis") || "").trim() || null;
  const diagCode = String(formData.get("diagnosis_code") || "").trim() || null;
  const issueDate = String(formData.get("issue_date") || "").trim();
  const expiryDate = String(formData.get("expiry_date") || "").trim();
  const isRetained = formData.get("is_retained") ? 1 : 0;
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!issueDate || !expiryDate) redirect(`/prescriptions/${id}/edit?e=dates`);

  await run(
    `UPDATE prescriptions
     SET diagnosis = ?, diagnosis_code = ?, issue_date = ?, expiry_date = ?,
         is_retained = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    diagnosis, diagCode, issueDate, expiryDate, isRetained, notes, id
  );

  await logAudit({
    staffId: staff.id,
    action: "prescription_edited",
    entityType: "prescription",
    entityId: id,
    details: { diagnosis: diagnosis || null, expiry_date: expiryDate, is_retained: isRetained },
  });

  redirect(`/prescriptions/${id}?ok=edited`);
}

export default async function EditPrescriptionPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { e?: string };
}) {
  const staff = await requireStaff();
  if (!isAdminOrAbove(staff)) redirect("/prescriptions");

  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const rx = await get<RxRow>(
    `SELECT r.id, r.folio, r.status, r.is_retained, r.diagnosis, r.diagnosis_code,
       r.issue_date::text as issue_date, r.expiry_date::text as expiry_date, r.notes,
       p.full_name as patient_name, d.full_name as doctor_name
     FROM prescriptions r
     JOIN patients p ON p.id = r.patient_id
     JOIN doctors d ON d.id = r.doctor_id
     WHERE r.id = ?`,
    id
  );
  if (!rx) notFound();

  const error = searchParams.e === "dates" ? "Las fechas de emisión y vencimiento son obligatorias." : null;

  return (
    <>
      <PageHeader
        title={`Editar receta ${rx.folio}`}
        subtitle={`${rx.patient_name} · Dr. ${rx.doctor_name} · Estado actual: ${rx.status}`}
        actions={
          <Link href={`/prescriptions/${id}`} className="btn-secondary">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Volver
          </Link>
        }
      />

      {error && (
        <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg flex gap-2 items-start">
          <span className="material-symbols-outlined ms-fill text-error mt-0.5">error</span>
          <p className="text-sm text-on-error-container">{error}</p>
        </div>
      )}

      <p className="mb-6 text-[12px] text-on-surface-variant leading-relaxed max-w-3xl">
        Edita datos diagnósticos y fechas. Para cambiar paciente, doctor o medicamentos prescritos,
        crea una <Link href="/prescriptions/new" className="underline">receta nueva</Link> y rechaza esta.
      </p>

      <form action={updateAction} className="space-y-6 max-w-4xl">
        <input type="hidden" name="id" value={rx.id} />

        <section className="clinical-card p-6">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">medical_information</span>
            Diagnóstico
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="input-label">Diagnóstico clínico</label>
              <input name="diagnosis" type="text" defaultValue={rx.diagnosis || ""} className="input-field" />
            </div>
            <div>
              <label className="input-label">Código CIE-10 (opcional)</label>
              <input name="diagnosis_code" type="text" defaultValue={rx.diagnosis_code || ""} className="input-field font-mono" placeholder="Ej: G40.9" />
            </div>
          </div>
        </section>

        <section className="clinical-card p-6">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">event</span>
            Vigencia
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="input-label">Fecha emisión *</label>
              <input name="issue_date" type="date" defaultValue={rx.issue_date?.split("T")[0]} required className="input-field" />
            </div>
            <div>
              <label className="input-label">Fecha vencimiento *</label>
              <input name="expiry_date" type="date" defaultValue={rx.expiry_date?.split("T")[0]} required className="input-field" />
            </div>
          </div>
        </section>

        <section className="clinical-card p-6">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="is_retained"
              defaultChecked={rx.is_retained === 1}
              className="mt-1 w-5 h-5"
            />
            <div>
              <p className="text-sm font-semibold text-on-surface">Receta retenida (estupefaciente)</p>
              <p className="text-[12px] text-on-surface-variant">Para productos controlados que requieren retención según DS 345/2016.</p>
            </div>
          </label>
        </section>

        <section className="clinical-card p-6">
          <label className="input-label" htmlFor="notes">Notas internas</label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            defaultValue={rx.notes || ""}
            className="input-field"
          />
        </section>

        <div className="flex justify-end gap-3">
          <Link href={`/prescriptions/${id}`} className="btn-secondary">Cancelar</Link>
          <button type="submit" className="btn-primary">
            <span className="material-symbols-outlined text-base">save</span>
            Guardar cambios
          </button>
        </div>
      </form>
    </>
  );
}
