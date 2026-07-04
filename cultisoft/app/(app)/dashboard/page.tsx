import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatCLP, formatTime, relativeTime, formatDate } from "@/lib/format";
import { getDashboardCounts } from "@/lib/dashboard-counts";
import LiveStatsGrid from "@/components/LiveStatsGrid";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface DocCompleteness {
  label: string;
  count: number;
}

interface RecentOrder {
  id: number;
  folio: string;
  created_at: string;
  customer_name: string;
  customer_email: string;
  product_summary: string;
  total: number;
  status: string;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending_payment:  "Esperando comprobante",
  proof_uploaded:   "Comprobante recibido",
  paid:             "Pago confirmado",
  preparing:        "Preparando",
  ready_for_pickup: "Lista para retiro",
  shipped:          "Despachada",
  delivered:        "Entregada",
  cancelled:        "Cancelada",
  rejected:         "Comprobante rechazado",
};

interface LowStockBatch {
  batch_id: number;
  product_name: string;
  batch_number: string;
  quantity_current: number;
  expiry_date: string | null;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { denied?: string };
}) {
  const staff = await requireStaff();
  const counts = await getDashboardCounts();

  const docStats = await all<{ status: string; n: number }>(
    `SELECT
       CASE
         WHEN id_front_url IS NOT NULL AND id_back_url IS NOT NULL
              AND criminal_record_url IS NOT NULL AND prescription_url IS NOT NULL
              AND rights_assignment_url IS NOT NULL THEN 'complete'
         WHEN id_front_url IS NULL AND id_back_url IS NULL
              AND criminal_record_url IS NULL AND prescription_url IS NULL
              AND rights_assignment_url IS NULL THEN 'none'
         ELSE 'partial'
       END as status,
       COUNT(*) as n
     FROM customer_accounts
     GROUP BY status`
  );
  const docStatsMap = docStats.reduce((acc, r) => ({ ...acc, [r.status]: r.n }), {} as Record<string, number>);
  const docCompleteness: DocCompleteness[] = [
    { label: "5/5 documentos", count: docStatsMap.complete || 0 },
    { label: "Parcial",        count: docStatsMap.partial || 0 },
    { label: "Sin documentos", count: docStatsMap.none || 0 },
  ];

  const recentOrders = await all<RecentOrder>(`
    SELECT o.id, o.folio, o.created_at, o.total, o.status,
      c.full_name as customer_name, c.email as customer_email,
      (SELECT STRING_AGG(pr.name || ' ×' || oi.quantity, ', ')
        FROM customer_order_items oi JOIN products pr ON pr.id = oi.product_id
        WHERE oi.order_id = o.id) as product_summary
    FROM customer_orders o
    JOIN customer_accounts c ON c.id = o.customer_account_id
    ORDER BY o.created_at DESC
    LIMIT 8
  `);

  const lowStock = await all<LowStockBatch>(`
    SELECT b.id as batch_id, b.batch_number, b.quantity_current, b.expiry_date,
      pr.name as product_name
    FROM batches b
    JOIN products pr ON pr.id = b.product_id
    WHERE b.status = 'available' AND b.quantity_current <= 10
    ORDER BY b.quantity_current ASC
    LIMIT 5
  `);

  const dateLabel = new Date().toLocaleDateString("es-CL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const firstName = staff.full_name.split(" ")[0];

  return (
    <>

      {searchParams.denied && (
        <div className="mb-7 p-4 bg-sangria/10 border-l-2 border-sangria">
          <p className="eyebrow text-sangria mb-1">— Sin permiso</p>
          <p className="text-sm text-ink">No tienes permisos para acceder a esa sección.</p>
        </div>
      )}

      <PageHeader
        numeral="00"
        eyebrow={`Dashboard · ${dateLabel}`}
        title={`Hola, ${firstName}`}
        subtitle="Resumen operacional del dispensario en tiempo real."
        actions={
          <Link href="/web-orders" className="btn-primary">
            <span aria-hidden>+</span> Ver pedidos web
          </Link>
        }
      />

      <LiveStatsGrid initialCounts={counts} />

      {/* ─── Body grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-12">
        {/* Recent web orders */}
        <section className="lg:col-span-2">
          <div className="flex items-baseline justify-between mb-5">
            <div className="flex items-baseline gap-4">
              <span className="editorial-numeral text-base text-ink-subtle">— I</span>
              <span className="eyebrow">Pedidos web recientes</span>
            </div>
            <Link href="/web-orders" className="text-xs uppercase tracking-widest font-mono text-ink-muted hover:text-ink border-b border-transparent hover:border-ink/40 pb-0.5">
              Ver todos →
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="border-y border-rule py-16 text-center">
              <p className="font-display text-2xl italic text-ink-muted">Sin pedidos aún.</p>
            </div>
          ) : (
            <div className="border-y border-rule overflow-x-auto">
              <table className="table-clinical">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Paciente</th>
                    <th>Producto</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-[12px] text-ink-muted whitespace-nowrap nums-lining">
                        <div>{formatTime(r.created_at)}</div>
                        <div className="text-[10px] text-ink-subtle">{relativeTime(r.created_at)}</div>
                      </td>
                      <td>
                        <Link href={`/web-orders/${r.id}`} className="font-display text-base hover:italic transition-all">
                          {r.customer_name || r.customer_email}
                        </Link>
                        <div className="text-[11px] text-ink-muted font-mono nums-lining">{r.customer_email}</div>
                      </td>
                      <td className="text-sm max-w-md">{r.product_summary || "—"}</td>
                      <td className="text-right font-mono tabular-nums nums-lining whitespace-nowrap">
                        {formatCLP(r.total)}
                      </td>
                      <td className="text-right text-xs text-ink-muted italic whitespace-nowrap">{ORDER_STATUS_LABELS[r.status] || r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Quick actions + low stock */}
        <aside className="space-y-10">
          <div>
            <div className="flex items-baseline gap-4 mb-5">
              <span className="editorial-numeral text-base text-ink-subtle">— II</span>
              <span className="eyebrow">Acciones rápidas</span>
            </div>
            <div className="space-y-2">
              {[
                { href: "/web-orders",        label: "Pedidos web",        num: "01" },
                { href: "/patients/new",      label: "Registrar paciente", num: "02" },
                { href: "/prescriptions/new", label: "Cargar receta",      num: "03" },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="group flex items-baseline justify-between gap-4 py-3 border-b border-rule-soft hover:border-ink transition-colors"
                >
                  <span className="flex items-baseline gap-4">
                    <span className="editorial-numeral text-xs text-ink-subtle group-hover:text-brass">{a.num}</span>
                    <span className="font-display text-lg group-hover:italic transition-all">{a.label}</span>
                  </span>
                  <span className="text-ink-muted group-hover:text-ink group-hover:translate-x-1 transition-all" aria-hidden>→</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Documentos pacientes */}
          <div>
            <div className="flex items-baseline gap-4 mb-5">
              <span className="editorial-numeral text-base text-ink-subtle">— III</span>
              <span className="eyebrow">Documentos de pacientes</span>
            </div>
            <div className="border-y border-rule-soft divide-y divide-rule-soft">
              {docCompleteness.map((d) => (
                <div key={d.label} className="flex items-center justify-between py-3">
                  <span className="text-sm text-ink-muted">{d.label}</span>
                  <span className={`font-mono text-sm tabular-nums ${
                    d.label === "5/5 documentos" ? "text-forest" :
                    d.label === "Sin documentos" ? "text-ink-subtle" : "text-brass-dim"
                  }`}>{d.count}</span>
                </div>
              ))}
            </div>
            <Link
              href="/web-prescriptions?status=all"
              className="inline-block mt-3 text-[11px] font-mono uppercase tracking-widest text-ink-muted hover:text-ink transition-colors"
            >
              Ver todos →
            </Link>
          </div>

          {lowStock.length > 0 && (
            <div>
              <div className="flex items-baseline gap-4 mb-5">
                <span className="editorial-numeral text-base text-ink-subtle">— IV</span>
                <span className="eyebrow">Lotes con menor stock</span>
              </div>
              <ul className="border-y border-rule-soft divide-y divide-rule-soft">
                {lowStock.map((b) => (
                  <li key={b.batch_id}>
                    <Link
                      href={`/inventory/${b.batch_id}`}
                      className="group flex items-baseline justify-between gap-3 py-3 hover:bg-paper-bright -mx-2 px-2 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-base truncate group-hover:italic transition-all">{b.product_name}</p>
                        <p className="text-[10px] uppercase tracking-widest text-ink-muted font-mono nums-lining mt-0.5">
                          Lote {b.batch_number}
                          {b.expiry_date && <> · vence {formatDate(b.expiry_date)}</>}
                        </p>
                      </div>
                      <span className={
                        b.quantity_current <= 2 ? "pill pill-error" :
                        b.quantity_current <= 5 ? "pill pill-warning" :
                        "pill pill-neutral"
                      }>{b.quantity_current} u.</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Decorative editorial card */}
          <div className="relative border border-forest bg-forest text-paper p-6 overflow-hidden">
            <div
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                mixBlendMode: "multiply",
              }}
              aria-hidden
            />
            <p className="relative eyebrow text-paper/60">— Manual de uso</p>
            <p className="relative font-display text-2xl mt-2 leading-tight text-balance">
              <span className="font-light">¿Primera vez</span>{" "}
              <span className="italic">aquí?</span>
            </p>
            <p className="relative text-xs text-paper/70 mt-2 leading-relaxed">
              Conoce el flujo completo del dispensario.
            </p>
            <Link
              href="/manual"
              className="relative inline-flex items-center gap-2 mt-4 text-xs uppercase tracking-widest font-mono text-brass-bright hover:text-paper border-b border-brass-bright/40 hover:border-paper pb-0.5 transition-all"
            >
              Abrir manual →
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
