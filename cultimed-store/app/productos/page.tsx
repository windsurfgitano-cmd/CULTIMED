import Link from "next/link";
import { all } from "@/lib/db";
import { getCurrentCustomer, canPurchase } from "@/lib/auth";
import ProductCard from "@/components/ProductCard";

export const dynamic = "force-dynamic";

interface CatalogProduct {
  id: number;
  sku: string;
  name: string;
  category: string;
  presentation: string | null;
  default_price: number;
  thc_percentage: number | null;
  cbd_percentage: number | null;
  vendor: string | null;
  is_house_brand: number;
  description: string | null;
  total_stock: number;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: { cat?: string; brand?: string; sort?: string };
}) {
  const customer = await getCurrentCustomer();
  const showPrice = canPurchase(customer);

  const cat = searchParams.cat || "";
  const brand = searchParams.brand || "";
  const sort = searchParams.sort || "newest";

  const where: string[] = [`p.is_active = 1`, `p.shopify_status = 'active'`];
  const params: any[] = [];
  if (cat) { where.push(`p.category = ?`); params.push(cat); }
  if (brand === "cultimed") where.push(`p.is_house_brand = 1`);
  else if (brand === "external") where.push(`p.is_house_brand = 0`);

  let order = `p.is_house_brand DESC, p.created_at DESC`;
  if (sort === "thc-high") order = `p.thc_percentage DESC NULLS LAST`;
  else if (sort === "thc-low") order = `p.thc_percentage ASC NULLS LAST`;
  else if (sort === "price-low") order = `p.default_price ASC`;
  else if (sort === "price-high") order = `p.default_price DESC`;

  const products = await all<CatalogProduct>(
    `SELECT p.id, p.sku, p.name, p.category, p.presentation, p.default_price,
       p.thc_percentage, p.cbd_percentage, p.vendor, p.is_house_brand, p.description,
       COALESCE((SELECT SUM(quantity_current) FROM batches b WHERE b.product_id = p.id), 0) as total_stock
     FROM products p
     WHERE ${where.join(" AND ")}
     ORDER BY ${order}
     LIMIT 100`,
    ...params
  );

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { cat, brand, sort, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `?${sp.toString()}`;
  };

  return (
    <>
      {/* Hero band */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12 lg:pt-20 pb-12 lg:pb-20">
        <div className="grid grid-cols-12 gap-x-6 items-end mb-8 lg:mb-12">
          <div className="col-span-12 lg:col-span-8">
            <div className="flex items-baseline gap-6 mb-6">
              <span className="editorial-numeral text-2xl text-ink-subtle">— 01</span>
              <span className="eyebrow">Catálogo · {products.length} productos</span>
            </div>
            <h1 className="font-display text-display-2 leading-[1.0] text-balance">
              <span className="font-light">Catálogo</span>{" "}
              <span className="italic font-normal">vivo</span>
              <span className="font-light">.</span>
            </h1>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:pb-3">
            <p className="text-sm leading-relaxed text-ink-muted">
              Selección rotativa de cepas premium y formulaciones farmacéuticas. Disponibilidad
              y precios visibles únicamente con cuenta y receta validada.
            </p>
          </div>
        </div>

        <div className="hairline-thick" />
      </section>

      {/* Filters */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 mb-12 lg:mb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12">
          <FilterGroup label="Categoría" idx="A">
            <FilterChip active={!cat} href={buildHref({ cat: undefined })}>Todas</FilterChip>
            <FilterChip active={cat === "flores"} href={buildHref({ cat: "flores" })}>Flor</FilterChip>
            <FilterChip active={cat === "aceite_cbd"} href={buildHref({ cat: "aceite_cbd" })}>Aceite</FilterChip>
            <FilterChip active={cat === "capsulas"} href={buildHref({ cat: "capsulas" })}>Cápsulas</FilterChip>
            <FilterChip active={cat === "topico"} href={buildHref({ cat: "topico" })}>Tópico</FilterChip>
          </FilterGroup>

          <FilterGroup label="Línea" idx="B">
            <FilterChip active={!brand} href={buildHref({ brand: undefined })}>Todas</FilterChip>
            <FilterChip active={brand === "cultimed"} href={buildHref({ brand: "cultimed" })}>Cultimed</FilterChip>
            <FilterChip active={brand === "external"} href={buildHref({ brand: "external" })}>Breeders</FilterChip>
          </FilterGroup>

          <FilterGroup label="Ordenar por" idx="C">
            <FilterChip active={sort === "newest"} href={buildHref({ sort: "newest" })}>Recientes</FilterChip>
            <FilterChip active={sort === "thc-high"} href={buildHref({ sort: "thc-high" })}>+ THC</FilterChip>
            <FilterChip active={sort === "thc-low"} href={buildHref({ sort: "thc-low" })}>− THC</FilterChip>
            {showPrice && <FilterChip active={sort === "price-low"} href={buildHref({ sort: "price-low" })}>Precio ↑</FilterChip>}
            {showPrice && <FilterChip active={sort === "price-high"} href={buildHref({ sort: "price-high" })}>Precio ↓</FilterChip>}
          </FilterGroup>
        </div>
      </section>

      {/* Products grid */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pb-24 lg:pb-40">
        {products.length === 0 ? (
          <div className="py-32 text-center">
            <p className="font-display text-3xl italic text-ink-muted mb-4">Catálogo en reposo.</p>
            <p className="text-sm text-ink-muted">No hay productos que coincidan con los filtros aplicados.</p>
            <Link href="/productos" className="btn-link mt-6">Limpiar filtros →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-16 lg:gap-y-24">
            {products.map((p, i) => (
              <ProductCard
                key={p.id}
                product={{ ...p, slug: p.sku.toLowerCase() }}
                index={i}
                showPrice={showPrice}
              />
            ))}
          </div>
        )}

        {!showPrice && products.length > 0 && (
          <div className="mt-20 lg:mt-32">
            <div className="hairline mb-12" />
            <div className="grid grid-cols-12 gap-x-6 gap-y-8">
              <div className="col-span-12 lg:col-span-7">
                <p className="eyebrow text-sangria mb-4">— Acceso restringido</p>
                <h3 className="font-display text-display-3 leading-[1.05] text-balance">
                  <span className="font-light">Para ver</span>{" "}
                  <span className="italic font-normal">precios</span>{" "}
                  <span className="font-light">y disponibilidad real,</span>{" "}
                  <span className="italic font-normal">crea tu cuenta</span>{" "}
                  <span className="font-light">y carga tu receta.</span>
                </h3>
              </div>
              <div className="col-span-12 lg:col-span-4 lg:col-start-9 lg:pt-3">
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                  Validamos cada receta médica antes de mostrar el catálogo completo. Es parte
                  de nuestro compromiso con la Ley 20.850 y con la seguridad clínica del paciente.
                </p>
                <div className="flex flex-col gap-3">
                  <Link href="/registro" className="btn-brass">Crear cuenta</Link>
                  <Link href="/consulta" className="btn-link">¿No tienes receta? Agendar consulta →</Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function FilterGroup({ label, idx, children }: { label: string; idx: string; children: React.ReactNode }) {
  return (
    <div className="lg:col-span-4">
      <p className="eyebrow mb-3 flex items-baseline gap-3">
        <span className="editorial-numeral text-base text-ink-subtle">— {idx}</span>
        <span>{label}</span>
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function FilterChip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        "px-4 py-1.5 text-xs uppercase tracking-widest font-medium transition-all duration-200 border " +
        (active
          ? "bg-ink text-paper border-ink"
          : "bg-transparent text-ink border-rule hover:border-ink")
      }
    >
      {children}
    </Link>
  );
}
