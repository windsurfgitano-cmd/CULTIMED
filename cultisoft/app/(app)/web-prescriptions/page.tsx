import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

interface WebRx {
  id: number;
  email: string;
  full_name: string;
  rut: string | null;
  phone: string | null;
  prescription_status: "none" | "pending" | "aprobada" | "rechazada";
  prescription_url: string | null;
  prescription_uploaded_at: string | null;
  prescription_reviewed_at: string | null;
  reviewer_name: string | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pendiente",  cls: "pill-warning" },
  aprobada:  { label: "Aprobada",   cls: "pill-success" },
  rechazada: { label: "Rechazada",  cls: "pill-error"   },
  none:      { label: "Sin receta", cls: "pill-neutral" },
};

export default function WebPrescriptionsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  requireStaff();
  const status = searchParams.status || "pending";

  const where: string[] = [];
  const params: any[] = [];
  if (status && status !== "all") {
    where.push(`c.prescription_status = ?`);
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = all<WebRx>(
    `SELECT c.id, c.email, c.full_name, c.rut, c.phone,
       c.prescription_status, c.prescription_url,
       c.prescription_uploaded_at, c.prescription_reviewed_at,
       s.full_name as reviewer_name
     FROM customer_accounts c
     LEFT JOIN staff s ON s.id = c.prescription_reviewed_by
     ${whereSql}
     ORDER BY
       CASE c.prescription_status
         WHEN 'pending' THEN 1
         WHEN 'approved' THEN 2
         WHEN 'rejected' THEN 3
         ELSE 4
       END,
       c.prescription_uploaded_at DESC`,
    ...params
  );

  const counts = all<{ status: string; n: number }>(
    `SELECT prescription_status as status, COUNT(*) as n
     FROM customer_accounts
     GROUP BY prescription_status`
  ).reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {} as Record<string, number>);

  return (
    <>
      <PageHeader
        numeral="04B"
        eyebrow="Recetas web · Validación"
        title="Recetas web"
        subtitle={`${formatNumber(rows.length)} ${rows.length === 1 ? "registro" : "registros"} en este filtro · pacientes que subieron receta desde el sitio público.`}
      />

      <div className="mb-8 flex flex-wrap gap-1.5 text-xs">
        {[
          { v: "pending",   l: "Pendientes" },
          { v: "aprobada",  l: "Aprobadas" },
          { v: "rechazada", l: "Rechazadas" },
          { v: "none",      l: "Sin receta" },
          { v: "all",       l: "Todas" },
        ].map((f) => {
          const sp = new URLSearchParams();
          if (f.v && f.v !== "pending") sp.set("status", f.v);
          const active = status === f.v;
          const n = f.v === "all"
            ? Object.values(counts).reduce((a, b) => a + b, 0)
            : (counts[f.v] || 0);
          return (
            <Link
              key={f.v}
              href={`?${sp.toString()}`}
              className={
                active
                  ? "px-3 py-1.5 bg-forest text-paper font-mono uppercase tracking-widest text-[11px]"
                  : "px-3 py-1.5 bg-paper-bright border border-rule text-ink-muted hover:text-ink hover:border-ink font-mono uppercase tracking-widest text-[11px]"
              }
            >
              {f.l} <span className="ml-1 opacity-70">[{n}]</span>
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Sin solicitudes pendientes"
          message="Cuando un paciente suba una receta desde dispensariocultimed.cl aparecerá aquí para validación QF."
        />
      ) : (
        <div className="border border-rule bg-paper-bright overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-dim/40">
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Paciente</th>
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Contacto</th>
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Subida</th>
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Revisor</th>
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Estado</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = STATUS_META[r.prescription_status] ?? STATUS_META.none;
                return (
                  <tr key={r.id} className="border-b border-rule-soft hover:bg-paper-dim/30 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-display italic text-base text-ink">{r.full_name}</div>
                      {r.rut && <div className="text-[11px] text-ink-subtle font-mono mt-0.5">{r.rut}</div>}
                    </td>
                    <td className="px-5 py-4">
                      <div className="text-[12px] text-ink-muted font-mono">{r.email}</div>
                      {r.phone && <div className="text-[11px] text-ink-subtle font-mono mt-0.5">{r.phone}</div>}
                    </td>
                    <td className="px-5 py-4">
                      {r.prescription_uploaded_at ? (
                        <span className="text-[12px] text-ink-muted font-mono">
                          {formatDateTime(r.prescription_uploaded_at)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {r.reviewer_name ? (
                        <>
                          <div className="text-[12px] text-ink-muted">{r.reviewer_name}</div>
                          {r.prescription_reviewed_at && (
                            <div className="text-[10px] text-ink-subtle font-mono mt-0.5">
                              {formatDateTime(r.prescription_reviewed_at)}
                            </div>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`pill ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/web-prescriptions/${r.id}`}
                        className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass transition-colors"
                      >
                        Revisar →
                      </Link>
                    </td>
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
