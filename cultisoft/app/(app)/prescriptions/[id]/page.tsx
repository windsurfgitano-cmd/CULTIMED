import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { calcAge, formatDate, formatDateTime, daysUntil } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

interface RxFull {
  id: number; folio: string; status: string; is_retained: number;
  diagnosis: string | null; diagnosis_code: string | null;
  issue_date: string; expiry_date: string;
  notes: string | null;
  verified_at: string | null; created_at: string;
  patient_id: number; patient_name: string; patient_rut: string; patient_dob: string | null;
  doctor_name: string; doctor_license: string; doctor_specialty: string | null;
  verifier_name: string | null;
}

interface RxItem {
  id: number; product_id: number;
  product_name: string; product_sku: string;
  presentation: string | null;
  quantity_prescribed: number; quantity_dispensed: number;
  dosage_instructions: string | null;
}

async function changeStatus(formData: FormData) {
  "use server";
  const staff = requireStaff();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  if (!id || !["pending", "active", "fulfilled", "rejected", "expired"].includes(status)) return;
  run(
    `UPDATE prescriptions SET status = ?, verified_by = ?, verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    status, staff.id, id
  );
  logAudit({ staffId: staff.id, action: `prescription_${status}`, entityType: "prescription", entityId: id });
  redirect(`/prescriptions/${id}`);
}

export default function PrescriptionDetailPage({ params }: { params: { id: string } }) {
  requireStaff();
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const r = get<RxFull>(
    `SELECT r.*, p.id as patient_id, p.full_name as patient_name, p.rut as patient_rut,
       p.date_of_birth as patient_dob,
       d.full_name as doctor_name, d.professional_license as doctor_license, d.specialty as doctor_specialty,
       v.full_name as verifier_name
     FROM prescriptions r
     JOIN patients p ON p.id = r.patient_id
     JOIN doctors d ON d.id = r.doctor_id
     LEFT JOIN staff v ON v.id = r.verified_by
     WHERE r.id = ?`,
    id
  );
  if (!r) notFound();

  const items = all<RxItem>(
    `SELECT pi.id, pi.product_id, pi.quantity_prescribed, pi.quantity_dispensed, pi.dosage_instructions,
       pr.name as product_name, pr.sku as product_sku, pr.presentation
     FROM prescription_items pi
     JOIN products pr ON pr.id = pi.product_id
     WHERE pi.prescription_id = ?
     ORDER BY pi.id`,
    id
  );

  const days = daysUntil(r.expiry_date);
  const totalPrescribed = items.reduce((s, i) => s + i.quantity_prescribed, 0);
  const totalDispensed = items.reduce((s, i) => s + i.quantity_dispensed, 0);
  const fulfillPct = totalPrescribed > 0 ? (totalDispensed / totalPrescribed) * 100 : 0;

  return (
    <>
      <PageHeader
        title={`Receta ${r.folio}`}
        subtitle={r.diagnosis || "Sin diagnóstico registrado"}
        actions={
          <>
            <Link href="/prescriptions" className="btn-secondary">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Recetas
            </Link>
            {r.status === "active" && (
              <Link href={`/dispensations/new?patient=${r.patient_id}&prescription=${r.id}`} className="btn-primary">
                <span className="material-symbols-outlined text-base">medication</span>
                Dispensar
              </Link>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 clinical-card p-6">
          <div className="flex justify-between items-start mb-5">
            <div>
              <h2 className="text-base font-bold text-on-surface flex items-center gap-2">
                Información clínica
                {r.is_retained === 1 && (
                  <span className="pill pill-error">Retenida</span>
                )}
              </h2>
            </div>
            <StatusBadge status={r.status} />
          </div>

          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4 text-sm">
            <KV k="Diagnóstico" v={r.diagnosis || "—"} />
            <KV k="CIE-10" v={r.diagnosis_code || "—"} mono />
            <KV k="Emitida" v={formatDate(r.issue_date)} />
            <KV k="Vence" v={`${formatDate(r.expiry_date)}${days !== null ? ` (${days >= 0 ? `${days}d` : "vencida"})` : ""}`} tone={days !== null && days < 0 ? "error" : days !== null && days <= 7 ? "warning" : "default"} />
          </dl>

          {r.notes && (
            <div className="mt-5 pt-5 border-t border-outline-variant/40">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Notas</p>
              <p className="text-sm text-on-surface whitespace-pre-wrap">{r.notes}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="clinical-card p-5">
            <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Paciente</h3>
            <Link href={`/patients/${r.patient_id}`} className="text-base font-semibold text-on-surface hover:text-primary">
              {r.patient_name}
            </Link>
            <p className="text-xs text-on-surface-variant font-mono mt-0.5">{r.patient_rut}</p>
            {calcAge(r.patient_dob) !== null && (
              <p className="text-xs text-on-surface-variant mt-1">{calcAge(r.patient_dob)} años</p>
            )}
          </div>

          <div className="clinical-card p-5">
            <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Médico tratante</h3>
            <p className="text-base font-semibold text-on-surface">{r.doctor_name}</p>
            <p className="text-xs text-on-surface-variant font-mono mt-0.5">{r.doctor_license}</p>
            {r.doctor_specialty && <p className="text-xs text-on-surface-variant mt-1">{r.doctor_specialty}</p>}
          </div>

          {r.verifier_name && (
            <div className="clinical-card p-5">
              <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-2">Verificada por</h3>
              <p className="text-sm font-semibold text-on-surface">{r.verifier_name}</p>
              <p className="text-[11px] text-on-surface-variant mt-0.5">{formatDateTime(r.verified_at)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <h3 className="text-base font-bold text-on-surface mb-3 flex items-center justify-between">
        <span>Productos prescritos</span>
        <span className="text-xs font-normal text-on-surface-variant">
          {totalDispensed} / {totalPrescribed} dispensado · {fulfillPct.toFixed(0)}%
        </span>
      </h3>
      {items.length === 0 ? (
        <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
          Esta receta no tiene productos prescritos.
        </div>
      ) : (
        <div className="clinical-card overflow-hidden mb-6">
          <table className="table-clinical">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Posología</th>
                <th className="text-right">Prescrita</th>
                <th className="text-right">Dispensada</th>
                <th>Avance</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const pct = it.quantity_prescribed > 0 ? (it.quantity_dispensed / it.quantity_prescribed) * 100 : 0;
                return (
                  <tr key={it.id}>
                    <td>
                      <p className="font-medium text-on-surface">{it.product_name}</p>
                      <p className="text-[11px] text-on-surface-variant font-mono">{it.product_sku}</p>
                    </td>
                    <td className="text-sm">{it.dosage_instructions || "—"}</td>
                    <td className="text-right tabular-nums font-mono">{it.quantity_prescribed}</td>
                    <td className="text-right tabular-nums font-mono">{it.quantity_dispensed}</td>
                    <td className="w-32">
                      <div className="h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                      <p className="text-[10px] text-on-surface-variant mt-1">{pct.toFixed(0)}%</p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Actions */}
      <div className="clinical-card p-6">
        <h3 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-[20px]">verified_user</span>
          Cambiar estado
        </h3>
        <form action={changeStatus} className="flex items-end gap-3 flex-wrap">
          <input type="hidden" name="id" value={r.id} />
          <div>
            <label className="input-label">Nuevo estado</label>
            <select name="status" defaultValue={r.status} className="input-field min-w-[200px]">
              <option value="pending">Pendiente</option>
              <option value="active">Activa (verificada)</option>
              <option value="fulfilled">Completada</option>
              <option value="rejected">Rechazada</option>
              <option value="expired">Vencida</option>
            </select>
          </div>
          <button type="submit" className="btn-primary">
            <span className="material-symbols-outlined text-base">save</span>
            Actualizar
          </button>
        </form>
      </div>

      <p className="mt-4 text-[11px] text-on-surface-variant/60">
        Receta creada el {formatDateTime(r.created_at)}
      </p>
    </>
  );
}

function KV({ k, v, mono = false, tone = "default" }: { k: string; v: string; mono?: boolean; tone?: "default" | "warning" | "error" }) {
  const cls = tone === "error" ? "text-error font-semibold" : tone === "warning" ? "text-warning font-semibold" : "text-on-surface";
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{k}</dt>
      <dd className={`mt-1 text-sm ${mono ? "font-mono" : ""} ${cls}`}>{v}</dd>
    </div>
  );
}
