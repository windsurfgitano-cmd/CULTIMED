import Link from "next/link";
import { requireStaff } from "@/lib/auth";
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
  pending_proof:    { label: "Esperando comprobante", cls: "pill-neutral" },
  proof_uploaded:   { label: "Comprobante recibido", cls: "pill-warning" },
  paid:             { label: "Pago confirmado",       cls: "pill-success" },
  preparing:        { label: "En preparación",        cls: "pill-tertiary" },
  ready_for_pickup: { label: "Lista para retiro",     cls: "pill-success" },
  shipped:          { label: "Despachada",            cls: "pill-success" },
  delivered:        { label: "Entregada",             cls: "pill-success" },
  cancelled:        { label: "Cancelada",             cls: "pill-error" },
  rejected:         { label: "Comprobante rechazado", cls: "pill-error" },
};

export default async function WebOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  await requireStaff();
  const status = searchParams.status || "proof_uploaded";

  const where: string[] = [];
  const params: any[] = [];
  if (status && status !== "all") {
    where.push(`o.status = ?`);
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await all<OrderRow>(
    `SELECT o.id, o.folio, o.status, o.subtotal, o.total,
       o.shipping_method, o.shipping_phone,
       o.payment_proof_url, o.payment_proof_uploaded_at,
       o.created_at,
       c.full_name as customer_name, c.email as customer_email,
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
         WHEN 'shipped' THEN 5
         WHEN 'delivered' THEN 6
         WHEN 'pending_proof' THEN 7
         ELSE 8
       END,
       o.created_at DESC`,
    ...params
  );

  const counts = (await all<{ status: string; n: number }>(
    `SELECT status, COUNT(*) as n FROM customer_orders GROUP BY status`
  )).reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {} as Record<string, number>);

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
        {[
          { v: "proof_uploaded",   l: "Por confirmar" },
          { v: "paid",             l: "Pagados" },
          { v: "preparing",        l: "En preparación" },
          { v: "ready_for_pickup", l: "Listos retiro" },
          { v: "shipped",          l: "Despachados" },
          { v: "delivered",        l: "Entregados" },
          { v: "rejected",         l: "Rechazados" },
          { v: "all",              l: "Todos" },
        ].map((f) => {
          const sp = new URLSearchParams();
          if (f.v && f.v !== "proof_uploaded") sp.set("status", f.v);
          const active = status === f.v;
          const n = f.v === "all" ? totalAll : (counts[f.v] || 0);
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
          title="Sin pedidos en este filtro"
          message="Cuando un paciente complete checkout y suba comprobante de transferencia aparecerá aquí."
        />
      ) : (
        <div className="border border-rule bg-paper-bright overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-dim/40">
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Folio</th>
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Paciente</th>
                <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Items</th>
                <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Total</th>
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Entrega</th>
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Subido</th>
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Estado</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = STATUS_META[r.status] ?? { label: r.status, cls: "pill-neutral" };
                return (
                  <tr key={r.id} className="border-b border-rule-soft hover:bg-paper-dim/30 transition-colors">
                    <td className="px-5 py-4">
                      <Link href={`/web-orders/${r.id}`} className="font-mono text-[11px] text-ink hover:text-brass underline-offset-2 hover:underline">
                        {r.folio}
                      </Link>
                      <div className="text-[10px] text-ink-subtle font-mono mt-0.5">
                        {formatDateTime(r.created_at)}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-display italic text-base text-ink">{r.customer_name}</div>
                      <div className="text-[11px] text-ink-subtle font-mono mt-0.5">{r.customer_email}</div>
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums font-mono text-[12px]">
                      {r.item_count}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums font-mono text-[13px] text-ink">
                      {formatCLP(r.total)}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-[11px] uppercase tracking-widest font-mono text-ink-muted">
                        {r.shipping_method === "pickup" ? "Retiro" : "Despacho"}
                      </span>
                      {r.shipping_phone && (
                        <div className="text-[10px] text-ink-subtle font-mono mt-0.5">{r.shipping_phone}</div>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {r.payment_proof_uploaded_at ? (
                        <span className="text-[11px] text-ink-muted font-mono">
                          {formatDateTime(r.payment_proof_uploaded_at)}
                        </span>
                      ) : (
                        <span className="text-[11px] text-ink-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`pill ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/web-orders/${r.id}`}
                        className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass transition-colors"
                      >
                        Ver →
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
