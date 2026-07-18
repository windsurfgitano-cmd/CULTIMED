import Link from "next/link";
import { all } from "@/lib/db";
import { getCurrentCustomer, canPurchase } from "@/lib/auth";
import ProductCard from "@/components/ProductCard";
import CatalogGate from "@/components/CatalogGate";
import { isReachable } from "@/lib/availability";

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
  image_url: string | null;
  strain_key: string | null;
  is_active: number;
  shopify_status: string | null;
  is_preorder: number;
  total_stock: number;
  price_tiers: unknown;
}

interface CatalogStrain {
  head: CatalogProduct;
  variants: Array<{ id: number; sku: string; presentation: string | null; default_price: number; total_stock: number }>;
  total_stock: number;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: { cat?: string; brand?: string; sort?: string };
}) {
  const customer = await getCurrentCustomer();
  // Gating estricto SANNA: solo pacientes con receta aprobada ven el catálogo.
  if (!customer) return <CatalogGate status="anonymous" />;
  if (customer.prescription_status !== "aprobada") {
    const status = customer.prescription_status as "none" | "pending" | "rechazada" | "expired";
    return <CatalogGate status={status} />;
  }
  const showPrice = canPurchase(customer);

  const cat = searchParams.cat || "";
  const brand = searchParams.brand || "";
  const sort = searchParams.sort || "newest";

  const where: string[] = [`p.strain_key IS NOT NULL`];
  const params: any[] = [];
  if (cat) { where.push(`p.category = ?`); params.push(cat); }
  if (brand === "cultimed") where.push(`p.is_house_brand = 1`);
  else if (brand === "external") where.push(`p.is_house_brand = 0`);

  // Espejo SQL de isReachable() (lib/availability.ts): las alcanzables arriba.
  // La preventa cuenta como alcanzable aunque no tenga estado 'active'.
  const reachableOrder = `CASE WHEN p.is_active = 1 AND (p.shopify_status = 'active' OR p.is_preorder = 1) THEN 0 ELSE 1 END`;
  let order = `${reachableOrder}, p.is_house_brand DESC, p.created_at DESC`;
  if (sort === "thc-high") order = `${reachableOrder}, p.thc_percentage DESC NULLS LAST`;
  else if (sort === "thc-low") order = `${reachableOrder}, p.thc_percentage ASC NULLS LAST`;
  else if (sort === "price-low") order = `${reachableOrder}, p.default_price ASC`;
  else if (sort === "price-high") order = `${reachableOrder}, p.default_price DESC`;

  const products = await all<CatalogProduct>(
    `SELECT p.id, p.sku, p.name, p.category, p.presentation, p.default_price,
       p.thc_percentage, p.cbd_percentage, p.vendor, p.is_house_brand, p.description,
       p.image_url, p.strain_key, p.is_active, p.shopify_status, p.is_preorder, p.price_tiers,
       COALESCE((SELECT SUM(quantity_current) FROM batches b WHERE b.product_id = p.id AND b.status = 'available'), 0) as total_stock
     FROM products p
     WHERE ${where.join(" AND ")}
     ORDER BY ${order}
     LIMIT 200`,
    ...params
  );

  // Agrupa por strain_key (1 publicación por cepa). Head = la variante de menor gramaje (precio más bajo).
  // Si no tiene strain_key (legacy), usa el id como clave única.
  const groupsMap = new Map<string, CatalogStrain>();
  for (const p of products) {
    const key = p.strain_key || `solo-${p.id}`;
    const existing = groupsMap.get(key);
    if (!existing) {
      groupsMap.set(key, {
        head: p,
        variants: [{ id: p.id, sku: p.sku, presentation: p.presentation, default_price: p.default_price, total_stock: p.total_stock }],
        total_stock: p.total_stock,
      });
    } else {
      existing.variants.push({ id: p.id, sku: p.sku, presentation: p.presentation, default_price: p.default_price, total_stock: p.total_stock });
      existing.total_stock += p.total_stock;
      // Head = variante con menor precio (default ascendente por gramaje)
      if (p.default_price < existing.head.default_price) existing.head = p;
    }
  }
  // Ordena variantes dentro de cada grupo por precio ascendente (gramaje creciente)
  const strains: CatalogStrain[] = Array.from(groupsMap.values()).map((g) => ({
    ...g,
    variants: g.variants.sort((a, b) => a.default_price - b.default_price),
  }));
  const availableCount = strains.filter((s) => s.head.is_active === 1 && s.head.shopify_status === "active").length;
  const soldOutCount = strains.length - availableCount;

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
              <span className="eyebrow">Catálogo clínico · {availableCount} disponibles · {soldOutCount} agotadas</span>
            </div>
            <h1 className="font-display text-display-2 leading-[1.0] text-balance">
              <span className="font-light">Catálogo</span>{" "}
              <span className="italic font-normal">clínico</span>
              <span className="font-light">.</span>
            </h1>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:pb-3">
            <p className="text-sm leading-relaxed text-ink-muted">
              Disponibilidad real por lote para pacientes validados. Gaslight, Bourbon y Aceite
              Sublingual Calma están habilitados para compra; las demás genéticas quedan visibles
              como agotadas para transparentar reposiciones y trazabilidad del dispensario.
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
        {strains.length === 0 ? (
          <div className="py-32 text-center">
            <p className="font-display text-3xl italic text-ink-muted mb-4">Catálogo en reposo.</p>
            <p className="text-sm text-ink-muted">No hay productos que coincidan con los filtros aplicados.</p>
            <Link href="/productos" className="btn-link mt-6">Limpiar filtros →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-16 lg:gap-y-24">
            {strains.map((s, i) => (
              <ProductCard
                key={s.head.id}
                product={{ ...s.head, slug: s.head.sku.toLowerCase() }}
                index={i}
                showPrice={showPrice}
                variants={s.variants}
                aggregateStock={s.total_stock}
                unavailable={!isReachable({ ...s.head, stock: s.total_stock })}
                pricePerGram={Boolean(s.head.price_tiers)}
              />
            ))}
          </div>
        )}

        {!showPrice && strains.length > 0 && (
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
                  <Link href="/mi-cuenta/recetas" className="btn-link">Ya tengo receta · Cargar documento →</Link>
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
