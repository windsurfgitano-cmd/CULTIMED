import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole, requireOpsRole } from "@/lib/auth";
import { all, get, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { formatCLP, formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";

export const dynamic = "force-dynamic";

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  category: string;
  presentation: string | null;
  default_price: number | null;
  vendor: string | null;
  strain_key: string | null;
  image_url: string | null;
  is_active: number;
  shopify_status: string | null;
  requires_prescription: number;
  is_controlled: number;
  is_house_brand: number;
  total_stock: number;
  active_batches: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  flores: "Flor",
  aceite_cbd: "Aceite",
  capsulas: "Cápsula",
  topico: "Tópico",
  farmaceutico: "Farma",
  otro: "Otro",
};

async function setWebStatus(formData: FormData) {
  "use server";
  const staff = await requireOpsRole();
  const id = Number(formData.get("id"));
  const mode = String(formData.get("mode") || "");
  if (!id || !["active", "archived"].includes(mode)) redirect("/products");

  await run(
    `UPDATE products SET is_active = ?, shopify_status = ? WHERE id = ?`,
    mode === "active" ? 1 : 0,
    mode,
    id
  );
  await logAudit({
    staffId: staff.id,
    action: mode === "active" ? "product_activated" : "product_archived",
    entityType: "product",
    entityId: id,
    details: { mode },
  });
  redirect("/products?updated=1");
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; category?: string; updated?: string };
}) {
  await requireOpsRole();
  const q = (searchParams.q || "").trim();
  // Por defecto solo variedades comprables — las descontinuadas de Shopify quedaban
  // mezcladas y tapaban el catalogo real (mismo problema que tenia Inventario).
  const status = searchParams.status || "active";
  const category = searchParams.category || "";

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    where.push(`(p.name ILIKE ? OR p.sku ILIKE ? OR p.strain_key ILIKE ? OR p.vendor ILIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (category) {
    where.push(`p.category = ?`);
    params.push(category);
  }
  if (status === "active") where.push(`p.is_active = 1 AND p.shopify_status = 'active'`);
  else if (status === "archived") where.push(`NOT (p.is_active = 1 AND p.shopify_status = 'active')`);
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const products = await all<ProductRow>(
    `SELECT p.id, p.sku, p.name, p.category, p.presentation, p.default_price, p.vendor,
       p.strain_key, p.image_url, p.is_active, p.shopify_status, p.requires_prescription,
       p.is_controlled, p.is_house_brand,
       COALESCE((SELECT SUM(quantity_current) FROM batches b WHERE b.product_id = p.id AND b.status='available'), 0)::int AS total_stock,
       COALESCE((SELECT COUNT(*) FROM batches b WHERE b.product_id = p.id AND b.status='available' AND b.quantity_current > 0), 0)::int AS active_batches
     FROM products p
     ${whereSql}
     ORDER BY CASE WHEN p.is_active = 1 AND p.shopify_status = 'active' THEN 0 ELSE 1 END,
              p.category, p.name, p.default_price NULLS LAST
     LIMIT 300`,
    ...params
  );

  // Resumen independiente del filtro de status actual — si no, al filtrar por
  // "Comprables" el conteo de "Agotados/ocultos" se veia siempre en 0.
  const globalSummary = await get<{ active: number; archived: number; stock: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE p.is_active = 1 AND p.shopify_status = 'active')::int AS active,
       COUNT(*) FILTER (WHERE NOT (p.is_active = 1 AND p.shopify_status = 'active'))::int AS archived,
       COALESCE(SUM(CASE WHEN p.is_active = 1 AND p.shopify_status = 'active'
         THEN (SELECT SUM(quantity_current) FROM batches b WHERE b.product_id = p.id AND b.status='available')
         ELSE 0 END), 0)::int AS stock
     FROM products p`
  );

  const summary = {
    total: (globalSummary?.active || 0) + (globalSummary?.archived || 0),
    active: globalSummary?.active || 0,
    archived: globalSummary?.archived || 0,
    stock: globalSummary?.stock || 0,
  };

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { q, status, category, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `?${sp.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Productos"
        subtitle={`${formatNumber(summary.active)} comprables · ${formatNumber(summary.archived)} agotados/ocultos · ${formatNumber(summary.stock)} unidades en stock`}
        actions={
          <Link href="/products/new" className="btn-primary">
            <span className="material-symbols-outlined text-base">add_box</span>
            Crear producto
          </Link>
        }
      />

      {searchParams.updated && (
        <div className="mb-5 px-4 py-3 bg-success-container/40 border-l-4 border-success rounded-r-lg text-sm text-on-success-container">
          Producto actualizado.
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryTile icon="medical_services" label="Productos" value={summary.total} />
        <SummaryTile icon="storefront" label="Comprables" value={summary.active} tone="success" />
        <SummaryTile icon="block" label="Agotados/ocultos" value={summary.archived} tone="neutral" />
        <SummaryTile icon="inventory_2" label="Unidades" value={summary.stock} />
      </div>

      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <SearchInput placeholder="Buscar producto, SKU, strain, proveedor…" />
        <div className="flex gap-1.5 text-xs flex-wrap">
          {[
            { v: "active", l: "Comprables" },
            { v: "archived", l: "Agotados/ocultos" },
            { v: "all", l: "Todos" },
          ].map((f) => (
            <Link key={f.v} href={buildHref({ status: f.v || undefined })}
              className={status === f.v ? "px-3 py-1.5 rounded-full bg-primary text-on-primary font-semibold" : "px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-medium"}>
              {f.l}
            </Link>
          ))}
        </div>
        <div className="flex gap-1.5 text-xs flex-wrap">
          {[
            { v: "", l: "Todas categorías" },
            { v: "flores", l: "Flores" },
            { v: "aceite_cbd", l: "Aceites" },
            { v: "capsulas", l: "Cápsulas" },
            { v: "topico", l: "Tópicos" },
            { v: "farmaceutico", l: "Farma" },
          ].map((c) => (
            <Link key={c.v} href={buildHref({ category: c.v || undefined })}
              className={category === c.v ? "px-3 py-1.5 rounded-full bg-tertiary text-on-tertiary font-semibold" : "px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-medium"}>
              {c.l}
            </Link>
          ))}
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState icon="medication" title="Sin productos" message={q ? `Sin coincidencias para “${q}”.` : "Aún no hay productos registrados."} />
      ) : (
        <div className="clinical-card overflow-x-auto">
          <table className="table-clinical">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Stock</th>
                <th>Web</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const purchasable = p.is_active === 1 && p.shopify_status === "active";
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="font-medium text-on-surface">{p.name}</div>
                      <div className="text-[11px] text-on-surface-variant font-mono">{p.sku}</div>
                      {p.strain_key && <div className="text-[11px] text-on-surface-variant">{p.strain_key}</div>}
                    </td>
                    <td>
                      <span className="text-xs text-on-surface-variant">{CATEGORY_LABELS[p.category] || p.category}</span>
                      {p.presentation && <div className="text-[11px] text-on-surface-variant">{p.presentation}</div>}
                    </td>
                    <td className="text-right font-mono tabular-nums whitespace-nowrap">{formatCLP(p.default_price || 0)}</td>
                    <td className="text-right">
                      <span className="pill pill-neutral">{p.total_stock}</span>
                      <div className="text-[10px] text-on-surface-variant mt-1">{p.active_batches} lote{p.active_batches !== 1 ? "s" : ""}</div>
                    </td>
                    <td>
                      <span className={purchasable ? "pill pill-success" : "pill pill-neutral"}>
                        {purchasable ? "Comprable" : "Agotado/oculto"}
                      </span>
                      <div className="text-[10px] text-on-surface-variant mt-1">{p.shopify_status || "sin estado"}</div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/products/${p.id}/edit`} className="btn-secondary text-xs px-3 py-1.5">Editar</Link>
                        <Link href={`/inventory/new?product=${p.id}`} className="btn-secondary text-xs px-3 py-1.5">Ingresar lote</Link>
                        <form action={setWebStatus}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="mode" value={purchasable ? "archived" : "active"} />
                          <button type="submit" className={purchasable ? "btn-secondary text-xs px-3 py-1.5" : "btn-primary text-xs px-3 py-1.5"}>
                            {purchasable ? "Marcar agotado" : "Habilitar compra"}
                          </button>
                        </form>
                      </div>
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

function SummaryTile({ icon, label, value, tone = "primary" }: {
  icon: string; label: string; value: string | number; tone?: "primary" | "success" | "neutral";
}) {
  const toneCls = {
    primary: "bg-primary-fixed/40 text-on-primary-fixed-variant",
    success: "bg-success-container text-on-success-container",
    neutral: "bg-surface-container text-on-surface-variant",
  }[tone];
  return (
    <div className="clinical-card p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${toneCls}`}>
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </div>
      <div>
        <p className="text-[11px] uppercase tracking-widest text-on-surface-variant font-semibold">{label}</p>
        <p className="text-2xl font-display text-on-surface tabular-nums">{value}</p>
      </div>
    </div>
  );
}
