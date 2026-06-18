import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatCLP, formatDateTime, formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

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

export default async function RecentOrdersPage() {
  await requireRole("admin", "superadmin", "pharmacist");

  const rows = await all<OrderRow>(
    `SELECT o.id, o.folio, o.status, o.subtotal, o.total,
       o.shipping_method, o.shipping_phone,
       o.payment_proof_url, o.payment_proof_uploaded_at,
       o.created_at,
       c.full_name as customer_name, c.email as customer_email,
       (SELECT COUNT(*) FROM customer_order_items i WHERE i.order_id = o.id) as item_count
     FROM customer_orders o
     JOIN customer_accounts c ON c.id = o.customer_account_id
     ORDER BY o.created_at DESC
     LIMIT 50`
  );

  // Get statistics
  const stats = await all<{ status: string; n: number }>(
    `SELECT status, COUNT(*) as n FROM customer_orders GROUP BY status ORDER BY n DESC`
  );

  const totalOrders = rows.length;
  const now = new Date();
  const last7Days = rows.filter((r) => {
    const created = new Date(r.created_at).getTime();
    return now.getTime() - created <= 7 * 24 * 60 * 60 * 1000;
  }).length;

  return (
    <>
      <PageHeader
        title="Pedidos web más recientes"
        subtitle={`${totalOrders} pedidos totales · ${last7Days} en últimos 7 días`}
        actions={
          <Link href="/web-orders" className="btn-secondary">
            ← Volver a web-orders normal
          </Link>
        }
      />

      <div className="mb-6 p-6 clinical-card">
        <h3 className="text-sm font-bold text-on-surface mb-4">Estadísticas por estado</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {stats.map(s => (
            <div key={s.status} className="text-center p-3 bg-surface-container rounded-lg">
              <div className="text-2xl font-bold">{s.n}</div>
              <div className="text-xs text-on-surface-variant mt-1">
                {STATUS_META[s.status]?.label || s.status}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="clinical-card overflow-hidden">
        <table className="table-clinical">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Cliente</th>
              <th>Estado</th>
              <th>Total</th>
              <th>Método</th>
              <th>Items</th>
              <th>Creado</th>
              <th className="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const created = new Date(r.created_at).getTime();
              const daysAgo = Math.floor((now.getTime() - created) / (1000 * 60 * 60 * 24));
              const meta = STATUS_META[r.status] || { label: r.status, cls: "pill-neutral" };
              
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/web-orders/${r.id}`} className="font-mono text-[12px] text-primary hover:underline">
                      {r.folio}
                    </Link>
                  </td>
                  <td>
                    <div className="text-sm font-semibold">{r.customer_name}</div>
                    <div className="text-xs text-on-surface-variant truncate max-w-[180px]">{r.customer_email}</div>
                  </td>
                  <td>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="tabular-nums font-semibold">{formatCLP(r.total)}</td>
                  <td className="text-sm text-on-surface-variant">{r.shipping_method}</td>
                  <td className="text-center tabular-nums">{r.item_count}</td>
                  <td className="text-on-surface-variant text-xs">
                    {formatDateTime(r.created_at)}
                    <div className="text-[10px] text-on-surface-variant/60">
                      {daysAgo === 0 ? "hoy" : `hace ${daysAgo} día${daysAgo !== 1 ? 's' : ''}`}
                    </div>
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

      <div className="mt-6 text-center text-sm text-on-surface-variant">
        Mostrando los {rows.length} pedidos más recientes
      </div>
    </>
  );
}
