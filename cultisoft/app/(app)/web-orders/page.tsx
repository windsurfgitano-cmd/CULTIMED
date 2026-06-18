import Link from "next/link";
import { requireRole, requireOpsRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatCLP, formatDateTime, formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

interface OrderRow {
  id: number;
  folio: string;
  status: string;
  subtotal: number;
  total: number;
  shipping_method: string;
  shipping_phone: string | null;
  payment_proof_url: string | null;
  payment_proof_uploaded_at: string | null;
  created_at: string;
  customer_name: string;
  customer_email: string;
  item_count: number;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending_payment:  { label: "Esperando comprobante", cls: "pill-neutral" },
  proof_uploaded:   { label: "Comprobante recibido", cls: "pill-warning" },
  paid:             { label: "Pago confirmado",       cls: "pill-success" },
  preparing:        { label: "En preparación",        cls: "pill-tertiary" },
  ready_for_pickup: { label: "Lista para retiro",     cls: "pill-success" },
  shipped:          { label: "Despachada",            cls: "pill-success" },
  delivered:        { label: "Entregada",             cls: "pill-success" },
  cancelled:        { label: "Cancelada",             cls: "pill-error" },
  rejected:         { label: "Comprobante rechazado", cls: "pill-error" },
};

const FILTERS = [
  { v: "active_workflow",  l: "Flujo activo" },
  { v: "proof_uploaded",   l: "Por confirmar" },
  { v: "paid",             l: "Pagados" },
  { v: "preparing",        l: "En preparación" },
  { v: "ready_for_pickup", l: "Listos retiro" },
  { v: "shipped",          l: "Despachados" },
  { v: "delivered",        l: "Entregados" },
  { v: "rejected",         l: "Rechazados" },
  { v: "all",              l: "Todos" },
] as const;

function activeWorkflowCount(counts: Record<string, number>) {
  return (
    (counts.pending_payment || 0) +
    (counts.proof_uploaded || 0) +
    (counts.paid || 0) +
    (counts.preparing || 0) +
    (counts.ready_for_pickup || 0)
  );
}

export default async function WebOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireOpsRole();
  const status = searchParams.status || "proof_uploaded";

  const where: string[] = [];
  const params: any[] = [];

  if (status === "active_workflow") {
    where.push(`o.status IN (?, ?, ?, ?, ?)`);
    params.push("pending_payment", "proof_uploaded", "paid", "preparing", "ready_for_pickup");
  } else if (status !== "all") {
    where.push(`o.status = ?`);
    params.push(status);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await all<OrderRow>(
    `SELECT o.id, o.folio, o.status, o.subtotal, o.total,
       o.shipping_method, o.shipping_phone,
       o.payment_proof_url, o.payment_proof_uploaded_at,
       o.created_at,
       COALESCE(NULLIF(c.full_name, ''), c.email) as customer_name,
       c.email as customer_email,
       (SELECT COUNT(*) FROM customer_order_items i WHERE i.order_id = o.id) as item_count
     FROM customer_orders o
     JOIN customer_accounts c ON c.id = o.customer_account_id
     ${whereSql}
     ORDER BY
       CASE o.status
         WHEN 'proof_uploaded' THEN 1
         WHEN 'paid' THEN 2
         WHEN 'preparing' THEN 3
         WHEN 'ready_for_pickup' THEN 4
         WHEN 'pending_payment' THEN 5
         WHEN 'shipped' THEN 6
         WHEN 'delivered' THEN 7
         ELSE 8
       END,
       o.created_at DESC`,
    ...params
  );

  const counts = (await all<{ status: string; n: number }>(
    `SELECT status, COUNT(*) as n FROM customer_orders GROUP BY status`
  )).reduce((acc, r) => ({ ...acc, [r.status]: Number(r.n) }), {} as Record<string, number>);

  const totalAll = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        numeral="03B"
        eyebrow="Pedidos web · Donaciones por transferencia"
        title="Pedidos web"
        subtitle={`${formatNumber(rows.length)} ${rows.length === 1 ? "pedido" : "pedidos"} en este filtro · gestiona pagos por transferencia y prepara para entrega.`}
        actions={
          <Link href="/web-orders/new" className="btn-primary">
            <span className="material-symbols-outlined text-base">add_shopping_cart</span>
            Nuevo pedido manual
          </Link>
        }
      />

      <div className="mb-8 flex flex-wrap gap-1.5 text-xs">
        {FILTERS.map((f) => {
          const sp = new URLSearchParams();
          sp.set("status", f.v);
          const n =
            f.v === "all"
              ? totalAll
              : f.v === "active_workflow"
                ? activeWorkflowCount(counts)
                : counts[f.v] || 0;

          return (
            <Link
              key={f.v}
              href={`?${sp.toString()}`}
              className={
                status === f.v
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
          title="Sin pedidos en este filtro"
          message="Cuando un paciente complete checkout y suba comprobante de transferencia aparecerá aquí."
        />
      ) : (
        <div className="clinical-card overflow-x-auto">
          <table className="table-clinical">
            <thead>
              <tr>
                <th>Folio</th>
                <th>Paciente</th>
                <th className="text-right">Items</th>
                <th className="text-right">Total</th>
                <th>Entrega</th>
                <th>Subido</th>
                <th>Estado</th>
                <th className="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = STATUS_META[r.status] ?? { label: r.status, cls: "pill-neutral" };
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/web-orders/${r.id}`} className="font-mono text-[12px] text-primary hover:underline">
                        {r.folio}
                      </Link>
                      <div className="text-[10px] text-on-surface-variant font-mono mt-0.5">
                        {formatDateTime(r.created_at)}
                      </div>
                    </td>
                    <td>
                      <div className="font-semibold text-on-surface">{r.customer_name}</div>
                      <div className="text-[11px] text-on-surface-variant font-mono mt-0.5">{r.customer_email}</div>
                    </td>
                    <td className="text-right tabular-nums">{r.item_count}</td>
                    <td className="text-right tabular-nums font-semibold">{formatCLP(r.total)}</td>
                    <td>
                      <span className="text-[11px] uppercase tracking-widest font-mono text-on-surface-variant">
                        {r.shipping_method === "pickup" ? "Retiro" : "Despacho"}
                      </span>
                      {r.shipping_phone && (
                        <div className="text-[10px] text-on-surface-variant font-mono mt-0.5">{r.shipping_phone}</div>
                      )}
                    </td>
                    <td className="text-on-surface-variant text-xs whitespace-nowrap">
                      {r.payment_proof_uploaded_at ? formatDateTime(r.payment_proof_uploaded_at) : "—"}
                    </td>
                    <td>
                      <span className={`pill ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td className="text-right">
                      <Link href={`/web-orders/${r.id}`} className="btn-secondary text-xs">
                        Ver
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