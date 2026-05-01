import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { formatCLP, formatDate, daysUntil, formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";

export const dynamic = "force-dynamic";

interface BatchRow {
  id: number;
  batch_number: string;
  product_id: number;
  product_name: string;
  product_sku: string;
  category: string;
  presentation: string | null;
  quantity_initial: number;
  quantity_current: number;
  price_per_unit: number;
  expiry_date: string | null;
  supplier: string | null;
  status: string;
  is_controlled: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  flores: "Flor",
  aceite_cbd: "Aceite",
  capsulas: "Cápsula",
  topico: "Tópico",
  farmaceutico: "Farma",
  otro: "Otro",
};
const CATEGORY_ICONS: Record<string, string> = {
  flores: "spa",
  aceite_cbd: "water_drop",
  capsulas: "pill",
  topico: "soap",
  farmaceutico: "medication",
  otro: "category",
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: { q?: string; filter?: string; category?: string };
}) {
  await requireStaff();
  const q = (searchParams.q || "").trim();
  const filter = searchParams.filter || "";
  const category = searchParams.category || "";

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    where.push(`(pr.name LIKE ? OR pr.sku LIKE ? OR b.batch_number LIKE ? OR b.supplier LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (category) {
    where.push(`pr.category = ?`);
    params.push(category);
  }
  if (filter === "low") {
    where.push(`b.quantity_current > 0 AND b.quantity_current <= 5 AND b.status = 'available'`);
  } else if (filter === "out") {
    where.push(`(b.quantity_current = 0 OR b.status = 'depleted')`);
  } else if (filter === "expiring") {
    where.push(`b.expiry_date IS NOT NULL AND b.expiry_date <= CURRENT_DATE + INTERVAL '60 days' AND b.status = 'available'`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const rows = await all<BatchRow>(
    `SELECT b.id, b.batch_number, b.product_id, b.quantity_initial, b.quantity_current,
       b.price_per_unit, b.expiry_date, b.supplier, b.status,
       pr.name as product_name, pr.sku as product_sku, pr.category, pr.presentation,
       pr.is_controlled
     FROM batches b
     JOIN products pr ON pr.id = b.product_id
     ${whereSql}
     ORDER BY
       CASE WHEN b.status = 'available' AND b.quantity_current > 0 THEN 0 ELSE 1 END,
       b.quantity_current ASC,
       pr.name ASC`,
    ...params
  );

  // Summary KPIs
  const summary = await get<{ total_skus: number; total_units: number; total_value: number; low: number; out: number }>(
    `SELECT
       COUNT(DISTINCT pr.id) as total_skus,
       COALESCE(SUM(b.quantity_current), 0) as total_units,
       COALESCE(SUM(b.quantity_current * b.price_per_unit), 0) as total_value,
       SUM(CASE WHEN b.quantity_current > 0 AND b.quantity_current <= 5 AND b.status = 'available' THEN 1 ELSE 0 END) as low,
       SUM(CASE WHEN b.quantity_current = 0 OR b.status = 'depleted' THEN 1 ELSE 0 END) as out
     FROM batches b JOIN products pr ON pr.id = b.product_id`
  );

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q, filter, category, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v as string);
    return `?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Inventario"
        subtitle={`${formatNumber(summary?.total_skus || 0)} productos · ${formatNumber(summary?.total_units || 0)} unidades · valor estimado ${formatCLP(summary?.total_value || 0)}`}
        actions={
          <Link href="/inventory/new" className="btn-primary">
            <span className="material-symbols-outlined text-base">add_box</span>
            Ingresar lote
          </Link>
        }
      />

      <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryTile icon="inventory_2" label="SKUs activos" value={formatNumber(summary?.total_skus || 0)} />
        <SummaryTile icon="local_offer" label="Unidades en stock" value={formatNumber(summary?.total_units || 0)} />
        <SummaryTile icon="trending_down" label="Stock bajo" value={summary?.low || 0} tone={summary && summary.low > 0 ? "warning" : "neutral"} />
        <SummaryTile icon="block" label="Agotados" value={summary?.out || 0} tone={summary && summary.out > 0 ? "error" : "neutral"} />
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <SearchInput placeholder="Buscar producto, SKU, lote, proveedor…" />
        <div className="flex gap-1.5 text-xs flex-wrap">
          {[
            { v: "", l: "Todo el stock" },
            { v: "low", l: "Stock bajo" },
            { v: "out", l: "Agotado" },
            { v: "expiring", l: "Por vencer" },
          ].map((f) => {
            const active = filter === f.v;
            return (
              <Link key={f.v} href={buildHref({ filter: f.v || undefined })}
                className={active
                  ? "px-3 py-1.5 rounded-full bg-primary text-on-primary font-semibold"
                  : "px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-medium"}>
                {f.l}
              </Link>
            );
          })}
        </div>
        <div className="flex gap-1.5 text-xs flex-wrap">
          {[
            { v: "", l: "Todas categorías" },
            { v: "flores", l: "Flores" },
            { v: "aceite_cbd", l: "Aceites" },
            { v: "capsulas", l: "Cápsulas" },
            { v: "topico", l: "Tópicos" },
            { v: "farmaceutico", l: "Farma" },
          ].map((c) => {
            const active = category === c.v;
            return (
              <Link key={c.v} href={buildHref({ category: c.v || undefined })}
                className={active
                  ? "px-3 py-1.5 rounded-full bg-tertiary text-on-tertiary font-semibold"
                  : "px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-medium"}>
                {c.l}
              </Link>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="inventory_2" title="No hay lotes" message={q ? `Sin coincidencias para “${q}”.` : "Aún no hay lotes registrados."} />
      ) : (
        <div className="clinical-card overflow-x-auto">
          <table className="table-clinical">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Lote</th>
                <th>Categoría</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Precio</th>
                <th>Vence</th>
                <th>Proveedor</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const days = daysUntil(b.expiry_date);
                const expiring = days !== null && days <= 60;
                const expired = days !== null && days < 0;
                const fillPct = b.quantity_initial > 0 ? Math.min(100, Math.max(0, (b.quantity_current / b.quantity_initial) * 100)) : 0;
                const stockTone = b.quantity_current === 0 ? "pill-neutral" : b.quantity_current <= 2 ? "pill-error" : b.quantity_current <= 5 ? "pill-warning" : "pill-success";
                return (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/inventory/${b.id}`} className="font-medium text-on-surface hover:text-primary">
                        {b.product_name}
                      </Link>
                      <div className="text-[11px] text-on-surface-variant font-mono">
                        {b.product_sku}
                        {b.is_controlled === 1 && <span className="ml-2 text-error">⚠ Controlado</span>}
                      </div>
                    </td>
                    <td className="font-mono text-[12px] text-on-surface-variant">{b.batch_number}</td>
                    <td>
                      <span className="text-xs text-on-surface-variant flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">{CATEGORY_ICONS[b.category] || "category"}</span>
                        {CATEGORY_LABELS[b.category] || b.category}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className={`pill ${stockTone}`}>{b.quantity_current} / {b.quantity_initial}</span>
                      <div className="mt-1 h-1 w-full bg-surface-container-high rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${fillPct}%` }} />
                      </div>
                    </td>
                    <td className="text-right font-mono tabular-nums whitespace-nowrap">{formatCLP(b.price_per_unit)}</td>
                    <td className={expired ? "text-error font-semibold" : expiring ? "text-warning font-semibold" : "text-on-surface-variant text-xs"}>
                      {b.expiry_date ? (
                        <>
                          <div className="text-xs">{formatDate(b.expiry_date)}</div>
                          {days !== null && (
                            <div className="text-[10px] uppercase tracking-wider">
                              {expired ? `Vencido hace ${Math.abs(days)} días` : `${days} días`}
                            </div>
                          )}
                        </>
                      ) : "—"}
                    </td>
                    <td className="text-xs text-on-surface-variant">{b.supplier || "—"}</td>
                    <td><StatusBadge status={b.status} /></td>
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

function SummaryTile({ icon, label, value, tone = "primary" }: {
  icon: string; label: string; value: string | number; tone?: "primary" | "warning" | "error" | "neutral";
}) {
  const toneCls = {
    primary: "bg-primary-fixed/40 text-on-primary-fixed-variant",
    warning: "bg-warning-container text-warning",
    error: "bg-error-container text-on-error-container",
    neutral: "bg-surface-container text-on-surface-variant",
  }[tone];
  return (
    <div className="clinical-card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneCls}`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</p>
        <p className="text-lg font-semibold text-on-surface tabular-nums">{value}</p>
      </div>
    </div>
  );
}
