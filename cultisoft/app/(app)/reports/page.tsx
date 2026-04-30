import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { formatCLP, formatNumber, formatDate } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface DailySales { day: string; count: number; total: number; }
interface TopProduct { product_name: string; sku: string; total_qty: number; total_revenue: number; }
interface TopPatient { patient_id: number; patient_name: string; rut: string; total_count: number; total_spent: number; }
interface CategoryBreakdown { category: string; count: number; total: number; }
interface PaymentBreakdown { payment_method: string; count: number; total: number; }
interface StaffBreakdown { staff_name: string; count: number; total: number; }

const CATEGORY_LABELS: Record<string, string> = {
  flores: "Flores",
  aceite_cbd: "Aceites CBD",
  capsulas: "Cápsulas",
  topico: "Tópicos",
  farmaceutico: "Farmacéutico",
  otro: "Otro",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireStaff();
  const days = Math.min(365, Math.max(7, parseInt(searchParams.range || "30", 10) || 30));

  const dateFilter = `d.dispensed_at >= NOW() - (INTERVAL '1 day' * ${days}) AND d.status = 'completed'`;

  const totals = await get<{ count: number; total: number; avg: number }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total, COALESCE(AVG(total_amount), 0) as avg
     FROM dispensations d WHERE ${dateFilter}`
  );

  const byDay = await all<DailySales>(
    `SELECT d.dispensed_at::date as day, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total
     FROM dispensations d
     WHERE ${dateFilter}
     GROUP BY d.dispensed_at::date
     ORDER BY day ASC`
  );

  const topProducts = await all<TopProduct>(
    `SELECT pr.name as product_name, pr.sku, SUM(di.quantity) as total_qty, SUM(di.total_price) as total_revenue
     FROM dispensation_items di
     JOIN dispensations d ON d.id = di.dispensation_id
     JOIN products pr ON pr.id = di.product_id
     WHERE ${dateFilter}
     GROUP BY pr.id
     ORDER BY total_revenue DESC
     LIMIT 10`
  );

  const topPatients = await all<TopPatient>(
    `SELECT p.id as patient_id, p.full_name as patient_name, p.rut,
       COUNT(d.id) as total_count, COALESCE(SUM(d.total_amount), 0) as total_spent
     FROM dispensations d
     JOIN patients p ON p.id = d.patient_id
     WHERE ${dateFilter}
     GROUP BY p.id
     ORDER BY total_spent DESC
     LIMIT 10`
  );

  const byCategory = await all<CategoryBreakdown>(
    `SELECT pr.category, COUNT(DISTINCT d.id) as count, SUM(di.total_price) as total
     FROM dispensation_items di
     JOIN dispensations d ON d.id = di.dispensation_id
     JOIN products pr ON pr.id = di.product_id
     WHERE ${dateFilter}
     GROUP BY pr.category
     ORDER BY total DESC`
  );

  const byPayment = await all<PaymentBreakdown>(
    `SELECT COALESCE(payment_method, 'sin_datos') as payment_method,
       COUNT(*) as count, SUM(total_amount) as total
     FROM dispensations d
     WHERE ${dateFilter}
     GROUP BY payment_method
     ORDER BY total DESC`
  );

  const byStaff = await all<StaffBreakdown>(
    `SELECT s.full_name as staff_name, COUNT(d.id) as count, SUM(d.total_amount) as total
     FROM dispensations d
     JOIN staff s ON s.id = d.dispenser_id
     WHERE ${dateFilter}
     GROUP BY s.id
     ORDER BY total DESC`
  );

  const newPatients = (await get<{ c: number }>(
    `SELECT COUNT(*) as c FROM patients WHERE created_at >= NOW() - (INTERVAL '1 day' * ${days})`
  ))?.c || 0;

  const maxDay = Math.max(1, ...byDay.map((b) => b.total));
  const maxCat = Math.max(1, ...byCategory.map((b) => Number(b.total)));

  return (
    <>
      <PageHeader
        title="Reportes"
        subtitle={`Resumen operacional de los últimos ${days} días`}
        actions={
          <div className="flex gap-1.5 text-xs">
            {[7, 30, 90, 180].map((r) => (
              <Link
                key={r}
                href={`?range=${r}`}
                className={
                  days === r
                    ? "px-3 py-1.5 rounded-full bg-primary text-on-primary font-semibold"
                    : "px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-medium"
                }
              >
                {r} días
              </Link>
            ))}
          </div>
        }
      />

      {/* High-level KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-7">
        <Tile label="Dispensaciones" value={formatNumber(totals?.count || 0)} icon="medication" />
        <Tile label="Ingresos totales" value={formatCLP(totals?.total || 0)} icon="payments" />
        <Tile label="Ticket promedio" value={formatCLP(Math.round(totals?.avg || 0))} icon="receipt" />
        <Tile label="Nuevos pacientes" value={formatNumber(newPatients)} icon="person_add" />
      </div>

      {/* Daily chart */}
      <div className="clinical-card p-6 mb-7">
        <h2 className="text-base font-bold text-on-surface mb-1">Ingresos diarios</h2>
        <p className="text-xs text-on-surface-variant mb-5">Total dispensado por día (CLP)</p>
        {byDay.length === 0 ? (
          <p className="text-sm text-on-surface-variant text-center py-8">No hay datos en el rango seleccionado.</p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fit,minmax(20px,1fr))] gap-1 items-end h-48">
            {byDay.map((b) => {
              const h = (b.total / maxDay) * 100;
              return (
                <div key={b.day} className="flex flex-col items-center justify-end h-full group" title={`${b.day}: ${formatCLP(b.total)} (${b.count} disp.)`}>
                  <div
                    className="w-full bg-primary/80 hover:bg-primary rounded-t transition-all"
                    style={{ height: `${Math.max(2, h)}%` }}
                  />
                </div>
              );
            })}
          </div>
        )}
        <div className="flex justify-between text-[10px] text-on-surface-variant mt-2 font-mono">
          <span>{byDay[0]?.day}</span>
          <span>{byDay[byDay.length - 1]?.day}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-7 mb-7">
        {/* Top products */}
        <div className="clinical-card p-6">
          <h2 className="text-base font-bold text-on-surface mb-1">Top productos</h2>
          <p className="text-xs text-on-surface-variant mb-4">Ordenados por ingresos</p>
          {topProducts.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4">Sin datos.</p>
          ) : (
            <ol className="space-y-2.5">
              {topProducts.map((p, i) => (
                <li key={p.sku} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-primary-fixed text-on-primary-fixed-variant flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-on-surface truncate">{p.product_name}</p>
                    <p className="text-[11px] text-on-surface-variant font-mono">{p.sku} · {formatNumber(p.total_qty)} u.</p>
                  </div>
                  <span className="text-sm font-mono tabular-nums">{formatCLP(p.total_revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Top patients */}
        <div className="clinical-card p-6">
          <h2 className="text-base font-bold text-on-surface mb-1">Pacientes top</h2>
          <p className="text-xs text-on-surface-variant mb-4">Mayor gasto en el periodo</p>
          {topPatients.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4">Sin datos.</p>
          ) : (
            <ol className="space-y-2.5">
              {topPatients.map((p, i) => (
                <li key={p.patient_id} className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-tertiary-container/30 text-tertiary flex items-center justify-center text-xs font-bold">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <Link href={`/patients/${p.patient_id}`} className="text-sm font-medium text-on-surface hover:text-primary truncate block">
                      {p.patient_name}
                    </Link>
                    <p className="text-[11px] text-on-surface-variant font-mono">{p.rut} · {p.total_count} disp.</p>
                  </div>
                  <span className="text-sm font-mono tabular-nums">{formatCLP(p.total_spent)}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-7">
        {/* Category breakdown */}
        <div className="clinical-card p-6 lg:col-span-2">
          <h2 className="text-base font-bold text-on-surface mb-1">Por categoría</h2>
          <p className="text-xs text-on-surface-variant mb-4">Distribución de ingresos por tipo de producto</p>
          {byCategory.length === 0 ? (
            <p className="text-sm text-on-surface-variant py-4">Sin datos.</p>
          ) : (
            <ul className="space-y-3">
              {byCategory.map((c) => {
                const pct = (Number(c.total) / maxCat) * 100;
                return (
                  <li key={c.category}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-medium text-on-surface">{CATEGORY_LABELS[c.category] || c.category}</span>
                      <span className="font-mono tabular-nums">{formatCLP(c.total)}</span>
                    </div>
                    <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Payment + staff */}
        <div className="space-y-6">
          <div className="clinical-card p-6">
            <h2 className="text-base font-bold text-on-surface mb-3">Por método de pago</h2>
            {byPayment.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Sin datos.</p>
            ) : (
              <ul className="space-y-2">
                {byPayment.map((p) => (
                  <li key={p.payment_method} className="flex items-center justify-between text-sm">
                    <span className="text-on-surface capitalize">{p.payment_method}</span>
                    <div className="text-right">
                      <span className="font-mono tabular-nums">{formatCLP(p.total)}</span>
                      <span className="text-[11px] text-on-surface-variant ml-2">({p.count})</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="clinical-card p-6">
            <h2 className="text-base font-bold text-on-surface mb-3">Por operador</h2>
            {byStaff.length === 0 ? (
              <p className="text-sm text-on-surface-variant">Sin datos.</p>
            ) : (
              <ul className="space-y-2">
                {byStaff.map((s) => (
                  <li key={s.staff_name} className="flex items-center justify-between text-sm">
                    <span className="text-on-surface truncate">{s.staff_name}</span>
                    <div className="text-right whitespace-nowrap">
                      <span className="font-mono tabular-nums">{formatCLP(s.total)}</span>
                      <span className="text-[11px] text-on-surface-variant ml-2">({s.count})</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <p className="mt-7 text-[11px] text-on-surface-variant/60 text-center">
        Reporte generado el {formatDate(new Date().toISOString())}
      </p>
    </>
  );
}

function Tile({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="clinical-card p-5 flex items-center gap-4">
      <div className="w-12 h-12 rounded-xl bg-primary-fixed/40 text-primary flex items-center justify-center">
        <span className="material-symbols-outlined text-2xl">{icon}</span>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</p>
        <p className="text-2xl font-light text-on-surface tabular-nums mt-0.5">{value}</p>
      </div>
    </div>
  );
}
