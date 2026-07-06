import { redirect } from "next/navigation";
import { requireStaff, isAdminOrAbove } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import clsx from "clsx";

export const dynamic = "force-dynamic";

interface LogRow {
  id: number;
  type: string;
  channel: string;
  recipient: string;
  status: string;
  error: string | null;
  created_at: string;
  customer_name: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  receta_aprobada: "Receta aprobada",
  receta_rechazada: "Receta rechazada",
  pedido_pago_confirmado: "Pago confirmado",
  pedido_despachado: "Pedido despachado",
  recompra: "Recompra",
  pedido_abandonado: "Pedido abandonado",
};

const STATUS_CLS: Record<string, string> = {
  sent: "pill-success",
  failed: "pill-error",
  pending: "pill-warning",
  skipped_optout: "pill-neutral",
  skipped_not_configured: "pill-neutral",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const staff = await requireStaff();
  if (!isAdminOrAbove(staff)) redirect("/dashboard");

  const type = searchParams.type && TYPE_LABEL[searchParams.type] ? searchParams.type : "";
  const where = type ? `WHERE nl.type = ?` : "";
  const params = type ? [type] : [];

  const rows = await all<LogRow>(
    `SELECT nl.id, nl.type, nl.channel, nl.recipient, nl.status, nl.error, nl.created_at,
       c.full_name as customer_name
     FROM notification_log nl
     LEFT JOIN customer_accounts c ON c.id = nl.customer_account_id
     ${where}
     ORDER BY nl.created_at DESC
     LIMIT 100`,
    ...params
  );

  return (
    <div>
      <PageHeader
        numeral="01a"
        eyebrow="Notificaciones automáticas"
        title="Notificaciones"
        subtitle="Últimos 100 envíos a pacientes: recetas, pedidos, recompra y abandonados."
      />

      <div className="flex flex-wrap gap-2 mb-8">
        <FilterChip active={!type} href="/notifications">Todas</FilterChip>
        {Object.entries(TYPE_LABEL).map(([k, label]) => (
          <FilterChip key={k} active={type === k} href={`/notifications?type=${k}`}>{label}</FilterChip>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted py-16 text-center">Sin envíos registrados todavía.</p>
      ) : (
        <div className="overflow-x-auto border border-rule bg-paper-bright">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="px-4 py-3 eyebrow">Fecha</th>
                <th className="px-4 py-3 eyebrow">Tipo</th>
                <th className="px-4 py-3 eyebrow">Canal</th>
                <th className="px-4 py-3 eyebrow">Paciente</th>
                <th className="px-4 py-3 eyebrow">Destinatario</th>
                <th className="px-4 py-3 eyebrow">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule-soft">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-xs nums-lining whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-3">{TYPE_LABEL[r.type] || r.type}</td>
                  <td className="px-4 py-3 font-mono text-xs uppercase">{r.channel}</td>
                  <td className="px-4 py-3">{r.customer_name || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.recipient}</td>
                  <td className="px-4 py-3">
                    <span className={clsx(STATUS_CLS[r.status] || "pill-neutral")} title={r.error || undefined}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={clsx(
        "px-4 py-1.5 text-xs uppercase tracking-widest font-medium transition-all duration-200 border",
        active ? "bg-ink text-paper border-ink" : "bg-transparent text-ink border-rule hover:border-ink"
      )}
    >
      {children}
    </a>
  );
}
