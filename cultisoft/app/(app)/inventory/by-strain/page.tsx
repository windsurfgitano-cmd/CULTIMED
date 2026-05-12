// Vista superadmin: inventario consolidado por strain.
// Agrupa los 20 productos (5g/10g/20g por cepa) en 7 strain masters.
// Muestra stock total en gramos, distribución por formato, lotes activos.
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff, isSuperadmin } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatNumber, formatCLP } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface VariantRow {
  product_id: number;
  sku: string;
  name: string;
  category: string;
  strain_key: string;
  presentation: string | null;
  default_price: number;
  total_stock: number; // unidades de esta variante en lotes available
  image_url: string | null;
  is_house_brand: number;
  vendor: string | null;
  thc_percentage: number | null;
  cbd_percentage: number | null;
}

interface StrainAggregate {
  strain_key: string;
  display_name: string;
  category: string;
  image_url: string | null;
  is_house_brand: number;
  vendor: string | null;
  thc_percentage: number | null;
  cbd_percentage: number | null;
  variants: VariantRow[];
  total_units: number;          // sum unidades de todas las variantes
  total_grams: number;          // sum de unidades × gramos del formato (solo flor)
  total_ml: number;             // sum de unidades × ml (para aceites)
  inventory_value: number;      // sum unidades × default_price
  active_batches: number;
  nearest_expiry: string | null;
}

/** Extrae gramos o ml de una presentación tipo "5g", "20G", "10ML", "30 ml". */
function parsePresentation(p: string | null): { grams: number; ml: number } {
  if (!p) return { grams: 0, ml: 0 };
  const s = p.trim();
  const mg = s.match(/^(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (mg) return { grams: parseFloat(mg[1].replace(",", ".")), ml: 0 };
  const mml = s.match(/^(\d+(?:[.,]\d+)?)\s*ml\b/i);
  if (mml) return { grams: 0, ml: parseFloat(mml[1].replace(",", ".")) };
  return { grams: 0, ml: 0 };
}

/** Limpia el nombre del producto quitando el "(5g)" del final → "Wedding Cake (Índica Dominante) - LitFarms". */
function cleanName(n: string): string {
  return n.replace(/\s*[-—·]?\s*\(?\d+\s*(?:g|ml)\)?\s*$/i, "").trim();
}

const CATEGORY_LABELS: Record<string, string> = {
  flores: "Flor",
  aceite_cbd: "Aceite",
  capsulas: "Cápsula",
  topico: "Tópico",
};

export default async function InventoryByStrainPage() {
  const me = await requireStaff();
  // Vista superadmin only — info consolidada estratégica
  if (!isSuperadmin(me)) redirect("/inventory");

  const rows = await all<VariantRow & { active_batches: number; nearest_expiry: string | null }>(
    `SELECT p.id as product_id, p.sku, p.name, p.category, p.strain_key,
       p.presentation, p.default_price, p.image_url, p.is_house_brand,
       p.vendor, p.thc_percentage, p.cbd_percentage,
       COALESCE((SELECT SUM(quantity_current) FROM batches b WHERE b.product_id = p.id AND b.status='available'), 0) as total_stock,
       COALESCE((SELECT COUNT(*) FROM batches b WHERE b.product_id = p.id AND b.status='available' AND quantity_current > 0), 0) as active_batches,
       (SELECT MIN(expiry_date)::text FROM batches b WHERE b.product_id = p.id AND b.status='available' AND quantity_current > 0) as nearest_expiry
     FROM products p
     WHERE p.is_active = 1 AND p.shopify_status='active'
     ORDER BY p.strain_key NULLS LAST, p.default_price ASC`
  );

  // Agrupar por strain_key
  const map = new Map<string, StrainAggregate>();
  for (const r of rows) {
    const key = r.strain_key || `solo-${r.product_id}`;
    if (!map.has(key)) {
      map.set(key, {
        strain_key: key,
        display_name: cleanName(r.name),
        category: r.category,
        image_url: r.image_url,
        is_house_brand: r.is_house_brand,
        vendor: r.vendor,
        thc_percentage: r.thc_percentage,
        cbd_percentage: r.cbd_percentage,
        variants: [],
        total_units: 0,
        total_grams: 0,
        total_ml: 0,
        inventory_value: 0,
        active_batches: 0,
        nearest_expiry: null,
      });
    }
    const agg = map.get(key)!;
    const { grams, ml } = parsePresentation(r.presentation);
    agg.variants.push(r);
    agg.total_units += r.total_stock;
    agg.total_grams += grams * r.total_stock;
    agg.total_ml += ml * r.total_stock;
    agg.inventory_value += r.default_price * r.total_stock;
    agg.active_batches += (r as any).active_batches;
    if ((r as any).nearest_expiry && (!agg.nearest_expiry || (r as any).nearest_expiry < agg.nearest_expiry)) {
      agg.nearest_expiry = (r as any).nearest_expiry;
    }
  }
  const strains = Array.from(map.values()).sort((a, b) => b.total_grams + b.total_ml - (a.total_grams + a.total_ml));

  const totalInventoryValue = strains.reduce((s, x) => s + x.inventory_value, 0);
  const totalGrams = strains.reduce((s, x) => s + x.total_grams, 0);
  const totalMl = strains.reduce((s, x) => s + x.total_ml, 0);

  return (
    <>
      <PageHeader
        numeral="07"
        eyebrow="Inventario · Vista por strain (Super Admin)"
        title="Inventario consolidado"
        subtitle={`${strains.length} strains · ${formatNumber(totalGrams)}g + ${formatNumber(totalMl)}ml en stock · ${formatCLP(totalInventoryValue)} valor inventario.`}
        actions={
          <Link href="/inventory" className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass">
            ← Vista por lote
          </Link>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Strains activas" value={strains.length.toString()} sub="con stock disponible" />
        <StatCard label="Total gramos (flor)" value={`${formatNumber(totalGrams)}g`} sub="suma de variantes" />
        <StatCard label="Total ml (aceite)" value={`${formatNumber(totalMl)}ml`} sub="suma de variantes" />
        <StatCard label="Valor de inventario" value={formatCLP(totalInventoryValue)} sub="precio venta × unidades" />
      </div>

      {/* Strains grid */}
      <div className="space-y-4">
        {strains.map((s) => (
          <article key={s.strain_key} className="clinical-card overflow-hidden">
            <div className="grid grid-cols-12 gap-0">
              {/* Image */}
              <div className="col-span-12 md:col-span-2 bg-paper-dim aspect-[4/3] md:aspect-auto relative">
                {s.image_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={s.image_url} alt={s.display_name} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-ink-subtle">
                    <span className="material-symbols-outlined text-4xl">{s.category === "aceite_cbd" ? "water_drop" : "spa"}</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="col-span-12 md:col-span-10 p-5">
                <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-3 flex-wrap mb-1">
                      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-subtle">
                        {CATEGORY_LABELS[s.category] || s.category}
                      </span>
                      {s.is_house_brand === 1 && (
                        <span className="pill-success">Línea Cultimed</span>
                      )}
                      {s.vendor && s.is_house_brand !== 1 && (
                        <span className="text-[11px] text-on-surface-variant italic">{s.vendor}</span>
                      )}
                    </div>
                    <h3 className="font-display text-xl text-on-surface leading-tight">{s.display_name}</h3>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-mono">Stock total</p>
                    <p className={`font-mono text-2xl font-bold nums-lining ${s.total_units < 5 ? "text-error" : s.total_units < 15 ? "text-warning" : "text-on-surface"}`}>
                      {s.total_grams > 0 ? `${formatNumber(s.total_grams)}g` : s.total_ml > 0 ? `${formatNumber(s.total_ml)}ml` : `${s.total_units}u`}
                    </p>
                    <p className="text-[11px] text-on-surface-variant nums-lining">{s.total_units} unidades · {s.active_batches} lote{s.active_batches !== 1 ? "s" : ""}</p>
                  </div>
                </div>

                {/* Variantes */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                  {s.variants.map((v) => {
                    const lowStock = v.total_stock > 0 && v.total_stock < 5;
                    const outOfStock = v.total_stock === 0;
                    return (
                      <Link
                        key={v.product_id}
                        href={`/inventory?q=${encodeURIComponent(v.sku)}`}
                        className={`px-3 py-2.5 border transition-colors flex items-baseline justify-between gap-2 group ${outOfStock ? "border-rule-soft bg-paper-dim/30 opacity-60" : lowStock ? "border-warning/40 bg-warning/5 hover:border-warning" : "border-rule hover:border-ink hover:bg-paper-dim/30"}`}
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-ink uppercase tracking-widest">{v.presentation || "—"}</p>
                          <p className="text-[11px] text-ink-muted truncate">{v.sku}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`font-mono text-sm font-bold nums-lining ${outOfStock ? "text-ink-subtle" : lowStock ? "text-warning" : "text-ink"}`}>
                            {v.total_stock}
                          </p>
                          <p className="text-[10px] text-ink-muted nums-lining">{formatCLP(v.default_price)}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                {/* Footer info */}
                <div className="mt-3 pt-3 border-t border-rule-soft flex items-baseline justify-between gap-3 flex-wrap text-[11px] font-mono text-on-surface-variant nums-lining">
                  <div className="flex items-baseline gap-4">
                    {s.thc_percentage !== null && <span>THC <strong className="text-on-surface">{s.thc_percentage}%</strong></span>}
                    {s.cbd_percentage !== null && <span>CBD <strong className="text-on-surface">{s.cbd_percentage}%</strong></span>}
                    <span>Valor: <strong className="text-on-surface">{formatCLP(s.inventory_value)}</strong></span>
                  </div>
                  {s.nearest_expiry && (
                    <span>Próxima vencimiento: <strong className="text-on-surface">{s.nearest_expiry}</strong></span>
                  )}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      {strains.length === 0 && (
        <div className="clinical-card p-12 text-center">
          <p className="font-display text-2xl italic text-on-surface-variant mb-2">Sin strains activas.</p>
          <p className="text-sm text-on-surface-variant">No hay productos con strain_key asignado.</p>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="clinical-card p-5">
      <p className="text-[10px] uppercase tracking-widest text-on-surface-variant font-mono">{label}</p>
      <p className="font-display text-2xl mt-1 nums-lining">{value}</p>
      {sub && <p className="text-[11px] text-on-surface-variant mt-1">{sub}</p>}
    </div>
  );
}
