import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatDate, daysUntil, formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";

export const dynamic = "force-dynamic";

interface RxRow {
  id: number; folio: string; status: string; is_retained: number;
  diagnosis: string; diagnosis_code: string | null;
  issue_date: string; expiry_date: string;
  patient_id: number; patient_name: string; patient_rut: string;
  doctor_name: string;
  item_count: number;
}

export default async function PrescriptionsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  await requireStaff();
  const q = (searchParams.q || "").trim();
  const status = searchParams.status || "";

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    where.push(`(r.folio LIKE ? OR p.full_name LIKE ? OR p.rut LIKE ? OR d.full_name LIKE ? OR r.diagnosis LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    where.push(`r.status = ?`);
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await all<RxRow>(
    `SELECT r.id, r.folio, r.status, r.is_retained, r.diagnosis, r.diagnosis_code,
       r.issue_date, r.expiry_date,
       p.id as patient_id, p.full_name as patient_name, p.rut as patient_rut,
       d.full_name as doctor_name,
       (SELECT COUNT(*) FROM prescription_items pi WHERE pi.prescription_id = r.id) as item_count
     FROM prescriptions r
     JOIN patients p ON p.id = r.patient_id
     JOIN doctors d ON d.id = r.doctor_id
     ${whereSql}
     ORDER BY r.created_at DESC`,
    ...params
  );

  return (
    <>
      <PageHeader
        title="Recetas médicas"
        subtitle={`${formatNumber(rows.length)} resultados`}
        actions={
          <Link href="/prescriptions/new" className="btn-primary">
            <span className="material-symbols-outlined text-base">receipt_long</span>
            Cargar receta
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <SearchInput placeholder="Buscar por folio, paciente, médico, diagnóstico…" />
        <div className="flex gap-1.5 text-xs flex-wrap">
          {[
            { v: "", l: "Todas" },
            { v: "pending", l: "Pendientes" },
            { v: "active", l: "Activas" },
            { v: "fulfilled", l: "Completadas" },
            { v: "expired", l: "Vencidas" },
            { v: "rejected", l: "Rechazadas" },
          ].map((f) => {
            const sp = new URLSearchParams();
            if (q) sp.set("q", q);
            if (f.v) sp.set("status", f.v);
            const active = status === f.v;
            return (
              <Link key={f.v} href={`?${sp.toString()}`}
                className={active
                  ? "px-3 py-1.5 rounded-full bg-primary text-on-primary font-semibold"
                  : "px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-medium"}>
                {f.l}
              </Link>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="receipt_long" title="No hay recetas" message={q ? `Sin coincidencias.` : "Aún no se han cargado recetas."} />
      ) : (
        <div className="clinical-card overflow-x-auto">
          <table className="table-clinical">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Paciente</th>
                <th>Médico</th>
                <th>Diagnóstico</th>
                <th className="text-right">Items</th>
                <th>Vence</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const days = daysUntil(r.expiry_date);
                const expiring = days !== null && days <= 7 && days >= 0;
                const expired = days !== null && days < 0;
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/prescriptions/${r.id}`} className="font-mono text-[12px] text-primary hover:underline">
                        {r.folio}
                      </Link>
                      {r.is_retained === 1 && (
                        <div className="text-[10px] text-error font-bold uppercase tracking-wider mt-0.5">
                          Receta retenida
                        </div>
                      )}
                    </td>
                    <td>
                      <Link href={`/patients/${r.patient_id}`} className="font-medium text-on-surface hover:text-primary">
                        {r.patient_name}
                      </Link>
                      <div className="text-[11px] text-on-surface-variant font-mono">{r.patient_rut}</div>
                    </td>
                    <td className="text-sm">{r.doctor_name}</td>
                    <td className="max-w-xs">
                      <div className="text-sm text-on-surface line-clamp-1">{r.diagnosis || "—"}</div>
                      {r.diagnosis_code && <div className="text-[10px] text-on-surface-variant font-mono">{r.diagnosis_code}</div>}
                    </td>
                    <td className="text-right tabular-nums">{r.item_count}</td>
                    <td className={expired ? "text-error font-semibold text-xs" : expiring ? "text-warning font-semibold text-xs" : "text-on-surface-variant text-xs"}>
                      <div>{formatDate(r.expiry_date)}</div>
                      {days !== null && (
                        <div className="text-[10px] uppercase tracking-wider">
                          {expired ? "Vencida" : days === 0 ? "Hoy" : `${days}d`}
                        </div>
                      )}
                    </td>
                    <td><StatusBadge status={r.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
