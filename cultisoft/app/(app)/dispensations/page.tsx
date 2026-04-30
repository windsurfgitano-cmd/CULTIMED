import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { formatCLP, formatDateTime, formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";

export const dynamic = "force-dynamic";

interface DispRow {
  id: number; folio: string; total_amount: number; payment_method: string | null;
  status: string; dispensed_at: string;
  patient_id: number; patient_name: string; patient_rut: string;
  prescription_folio: string | null;
  dispenser_name: string;
  product_summary: string | null;
}

export default function DispensationsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; range?: string };
}) {
  requireStaff();
  const q = (searchParams.q || "").trim();
  const status = searchParams.status || "";
  const range = searchParams.range || "30";

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    where.push(`(d.folio LIKE ? OR p.full_name LIKE ? OR p.rut LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    where.push(`d.status = ?`);
    params.push(status);
  }
  if (range !== "all") {
    where.push(`d.dispensed_at >= datetime('now', '-${parseInt(range, 10) || 30} days')`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = all<DispRow>(
    `SELECT d.id, d.folio, d.total_amount, d.payment_method, d.status, d.dispensed_at,
       p.id as patient_id, p.full_name as patient_name, p.rut as patient_rut,
       r.folio as prescription_folio,
       s.full_name as dispenser_name,
       (SELECT GROUP_CONCAT(pr.name || ' ×' || di.quantity, ', ')
         FROM dispensation_items di JOIN products pr ON pr.id = di.product_id
         WHERE di.dispensation_id = d.id) as product_summary
     FROM dispensations d
     JOIN patients p ON p.id = d.patient_id
     LEFT JOIN prescriptions r ON r.id = d.prescription_id
     JOIN staff s ON s.id = d.dispenser_id
     ${whereSql}
     ORDER BY d.dispensed_at DESC
     LIMIT 200`,
    ...params
  );

  const summary = get<{ count: number; total: number }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM dispensations d ${whereSql}`,
    ...params
  );

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q, status, range, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v as string);
    return `?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Dispensaciones"
        subtitle={`${formatNumber(summary?.count || 0)} dispensaciones · total ${formatCLP(summary?.total || 0)}`}
        actions={
          <Link href="/dispensations/new" className="btn-primary">
            <span className="material-symbols-outlined text-base">add</span>
            Nueva dispensación
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <SearchInput placeholder="Buscar por folio, paciente, RUT…" />
        <div className="flex gap-1.5 text-xs flex-wrap">
          {[
            { v: "7", l: "Última semana" },
            { v: "30", l: "Últimos 30 días" },
            { v: "90", l: "90 días" },
            { v: "all", l: "Todo" },
          ].map((f) => {
            const active = range === f.v;
            return (
              <Link key={f.v} href={buildHref({ range: f.v })}
                className={active
                  ? "px-3 py-1.5 rounded-full bg-tertiary text-on-tertiary font-semibold"
                  : "px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-medium"}>
                {f.l}
              </Link>
            );
          })}
        </div>
        <div className="flex gap-1.5 text-xs flex-wrap">
          {[
            { v: "", l: "Todas" },
            { v: "completed", l: "Completadas" },
            { v: "pending", l: "Pendientes" },
            { v: "cancelled", l: "Canceladas" },
            { v: "returned", l: "Devueltas" },
          ].map((f) => {
            const active = status === f.v;
            return (
              <Link key={f.v} href={buildHref({ status: f.v || undefined })}
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
        <EmptyState icon="medication" title="No hay dispensaciones" message={q ? "Sin coincidencias." : "Aún no hay dispensaciones registradas."} />
      ) : (
        <div className="clinical-card overflow-x-auto">
          <table className="table-clinical">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Fecha</th>
                <th>Paciente</th>
                <th>Productos</th>
                <th>Receta</th>
                <th className="text-right">Total</th>
                <th>Operador</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/dispensations/${d.id}`} className="font-mono text-[12px] text-primary hover:underline">
                      {d.folio}
                    </Link>
                  </td>
                  <td className="text-xs text-on-surface-variant whitespace-nowrap">{formatDateTime(d.dispensed_at)}</td>
                  <td>
                    <Link href={`/patients/${d.patient_id}`} className="font-medium text-on-surface hover:text-primary">
                      {d.patient_name}
                    </Link>
                    <div className="text-[11px] text-on-surface-variant font-mono">{d.patient_rut}</div>
                  </td>
                  <td className="max-w-md text-sm">{d.product_summary || "—"}</td>
                  <td>
                    {d.prescription_folio ? (
                      <span className="pill pill-primary">{d.prescription_folio}</span>
                    ) : (
                      <span className="text-[11px] text-on-surface-variant">Sin receta</span>
                    )}
                  </td>
                  <td className="text-right font-mono tabular-nums whitespace-nowrap">{formatCLP(d.total_amount)}</td>
                  <td className="text-xs text-on-surface-variant">{d.dispenser_name}</td>
                  <td><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
