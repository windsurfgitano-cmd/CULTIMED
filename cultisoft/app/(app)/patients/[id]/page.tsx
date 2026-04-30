import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { calcAge, formatCLP, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

interface Patient {
  id: number; rut: string; full_name: string; date_of_birth: string | null; gender: string | null;
  email: string | null; phone: string | null; address: string | null; city: string | null;
  emergency_contact_name: string | null; emergency_contact_phone: string | null;
  allergies: string | null; chronic_conditions: string | null; notes: string | null;
  membership_status: string; membership_started_at: string | null;
  created_at: string;
}

interface PatientRx {
  id: number; folio: string; diagnosis: string; status: string;
  issue_date: string; expiry_date: string; doctor_name: string;
}
interface PatientDispensation {
  id: number; folio: string; total_amount: number; dispensed_at: string;
  product_count: number;
}

async function updateStatus(formData: FormData) {
  "use server";
  const staff = await requireStaff();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  if (!id || !["active", "pending", "suspended"].includes(status)) return;
  await run(
    `UPDATE patients SET membership_status = ?,
       membership_started_at = COALESCE(membership_started_at, CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE NULL END),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    status, status, id
  );
  await logAudit({
    staffId: staff.id, action: "patient_status_changed",
    entityType: "patient", entityId: id, details: { newStatus: status },
  });
  redirect(`/patients/${id}`);
}

export default async function PatientDetailPage({ params }: { params: { id: string } }) {
  await requireStaff();
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const p = await get<Patient>(`SELECT * FROM patients WHERE id = ?`, id);
  if (!p) notFound();

  const rxs = await all<PatientRx>(
    `SELECT r.id, r.folio, r.diagnosis, r.status, r.issue_date, r.expiry_date,
       d.full_name as doctor_name
     FROM prescriptions r
     JOIN doctors d ON d.id = r.doctor_id
     WHERE r.patient_id = ?
     ORDER BY r.issue_date DESC`,
    id
  );

  const dispensations = await all<PatientDispensation>(
    `SELECT d.id, d.folio, d.total_amount, d.dispensed_at,
       (SELECT COUNT(*) FROM dispensation_items di WHERE di.dispensation_id = d.id) as product_count
     FROM dispensations d
     WHERE d.patient_id = ?
     ORDER BY d.dispensed_at DESC
     LIMIT 20`,
    id
  );

  const totals = await get<{ total: number; count: number }>(
    `SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
     FROM dispensations WHERE patient_id = ? AND status = 'completed'`,
    id
  );

  const initials = p.full_name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  const age = calcAge(p.date_of_birth);

  return (
    <>
      <PageHeader
        title={p.full_name}
        actions={
          <>
            <Link href="/patients" className="btn-secondary">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Pacientes
            </Link>
            <Link href={`/dispensations/new?patient=${p.id}`} className="btn-primary">
              <span className="material-symbols-outlined text-base">add</span>
              Nueva dispensación
            </Link>
          </>
        }
      />

      {/* Profile card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 clinical-card p-6">
          <div className="flex items-start gap-5">
            <div className="w-16 h-16 rounded-full bg-primary text-on-primary flex items-center justify-center text-xl font-bold shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-bold text-on-surface">{p.full_name}</h2>
                <StatusBadge status={p.membership_status} />
              </div>
              <p className="text-sm font-mono text-on-surface-variant mt-1">RUT {p.rut}</p>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <Stat label="Edad" value={age !== null ? `${age} años` : "—"} />
                <Stat label="Género" value={p.gender ? GENDER_LABELS[p.gender] || p.gender : "—"} />
                <Stat label="Comuna" value={p.city || "—"} />
                <Stat label="Socio desde" value={formatDate(p.membership_started_at)} />
              </div>
            </div>
          </div>
        </div>

        <div className="clinical-card p-6">
          <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">
            Historial general
          </h3>
          <div className="space-y-3">
            <Stat label="Total dispensado" value={formatCLP(totals?.total || 0)} large />
            <Stat label="Dispensaciones" value={formatNumber(totals?.count || 0)} />
            <Stat label="Recetas activas" value={String(rxs.filter((r) => r.status === "active").length)} />
          </div>
        </div>
      </div>

      {/* Contact + clinical */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="clinical-card p-6">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">contact_mail</span>
            Contacto
          </h3>
          <dl className="space-y-3 text-sm">
            <KV k="Email" v={p.email || "—"} mono />
            <KV k="Teléfono" v={p.phone || "—"} mono />
            <KV k="Dirección" v={p.address ? `${p.address}${p.city ? `, ${p.city}` : ""}` : "—"} />
            <KV k="Contacto emergencia" v={p.emergency_contact_name ? `${p.emergency_contact_name} · ${p.emergency_contact_phone || "—"}` : "—"} />
          </dl>
        </div>

        <div className="clinical-card p-6">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">medical_information</span>
            Información clínica
          </h3>
          <dl className="space-y-3 text-sm">
            <KV k="Alergias" v={p.allergies || "—"} />
            <KV k="Condiciones crónicas" v={p.chronic_conditions || "—"} />
            <KV k="Notas" v={p.notes || "—"} />
          </dl>

          <form action={updateStatus} className="mt-5 pt-5 border-t border-outline-variant/40 flex items-end gap-3">
            <input type="hidden" name="id" value={p.id} />
            <div className="flex-1">
              <label className="input-label">Cambiar estado de membresía</label>
              <select name="status" defaultValue={p.membership_status} className="input-field">
                <option value="active">Activo</option>
                <option value="pending">Pendiente</option>
                <option value="suspended">Suspendido</option>
              </select>
            </div>
            <button type="submit" className="btn-primary whitespace-nowrap">Guardar</button>
          </form>
        </div>
      </div>

      {/* Prescriptions */}
      <section className="mb-6">
        <div className="flex items-end justify-between mb-3">
          <h3 className="text-base font-bold text-on-surface">Recetas</h3>
          <Link href={`/prescriptions/new?patient=${p.id}`} className="text-sm font-semibold text-primary hover:underline">
            Cargar receta →
          </Link>
        </div>
        {rxs.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Este paciente no tiene recetas registradas.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Médico</th>
                  <th>Diagnóstico</th>
                  <th>Emitida</th>
                  <th>Vence</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rxs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/prescriptions/${r.id}`} className="font-mono text-[12px] text-primary hover:underline">
                        {r.folio}
                      </Link>
                    </td>
                    <td>{r.doctor_name}</td>
                    <td className="max-w-md truncate">{r.diagnosis}</td>
                    <td className="text-on-surface-variant text-xs">{formatDate(r.issue_date)}</td>
                    <td className="text-on-surface-variant text-xs">{formatDate(r.expiry_date)}</td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Dispensations history */}
      <section>
        <h3 className="text-base font-bold text-on-surface mb-3">Historial de dispensaciones</h3>
        {dispensations.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Sin dispensaciones registradas.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Productos</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {dispensations.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Link href={`/dispensations/${d.id}`} className="font-mono text-[12px] text-primary hover:underline">
                        {d.folio}
                      </Link>
                    </td>
                    <td className="text-on-surface-variant text-xs whitespace-nowrap">{formatDateTime(d.dispensed_at)}</td>
                    <td className="text-sm">{d.product_count} producto{d.product_count !== 1 ? "s" : ""}</td>
                    <td className="text-right font-mono tabular-nums whitespace-nowrap">{formatCLP(d.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-6 text-[11px] text-on-surface-variant/60">
        Paciente registrado el {formatDateTime(p.created_at)}
      </p>
    </>
  );
}

function Stat({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</dt>
      <dd className={large ? "text-2xl font-light text-on-surface mt-0.5" : "text-sm font-medium text-on-surface mt-0.5"}>{value}</dd>
    </div>
  );
}

function KV({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <dt className="text-on-surface-variant text-[12px]">{k}</dt>
      <dd className={`col-span-2 text-on-surface ${mono ? "font-mono text-[12px]" : ""}`}>{v}</dd>
    </div>
  );
}

const GENDER_LABELS: Record<string, string> = {
  M: "Masculino",
  F: "Femenino",
  X: "Otro",
};
