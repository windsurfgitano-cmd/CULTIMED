import Link from "next/link";
import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { getCurrentCustomer, canPurchase } from "@/lib/auth";
import { formatCLP } from "@/lib/format";
import ProductCard from "@/components/ProductCard";
import AddToCartClient from "@/components/AddToCartClient";

export const dynamic = "force-dynamic";

interface ProductFull {
  id: number; sku: string; name: string; category: string; presentation: string | null;
  active_ingredient: string | null; concentration: string | null;
  thc_percentage: number | null; cbd_percentage: number | null;
  unit: string; requires_prescription: number; is_controlled: number;
  default_price: number; description: string | null; vendor: string | null;
  is_house_brand: number; is_preorder: number;
}
interface BatchInfo {
  id: number; batch_number: string; quantity_current: number;
  manufacture_date: string | null; expiry_date: string | null; supplier: string | null;
}

const CATEGORY_FULL_LABEL: Record<string, string> = {
  flores: "Flor de cannabis medicinal",
  aceite_cbd: "Aceite sublingual",
  capsulas: "Cápsulas farmacéuticas",
  topico: "Aplicación tópica",
  farmaceutico: "Farmacéutico",
  otro: "Producto medicinal",
};

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const slug = params.slug.toLowerCase();
  const product = await get<ProductFull>(
    `SELECT * FROM products WHERE LOWER(sku) = ? AND is_active = 1`,
    slug
  );
  if (!product) notFound();

  const batches = await all<BatchInfo>(
    `SELECT id, batch_number, quantity_current, manufacture_date, expiry_date, supplier
     FROM batches WHERE product_id = ? AND status = 'available' AND quantity_current > 0
     ORDER BY expiry_date ASC LIMIT 3`,
    product.id
  );

  const totalStock = batches.reduce((s, b) => s + b.quantity_current, 0);
  const customer = await getCurrentCustomer();
  const showPrice = canPurchase(customer);

  const related = await all<any>(
    `SELECT id, sku, name, category, presentation, default_price,
       thc_percentage, cbd_percentage, vendor, is_house_brand, description
     FROM products
     WHERE category = ? AND id != ? AND is_active = 1 AND shopify_status = 'active'
     ORDER BY RANDOM() LIMIT 3`,
    product.category, product.id
  );

  // Parse name parts
  const cleanName = product.name.replace(/\s*\(([^)]+)\)\s*$/, "").trim();
  const presentationFromName = product.name.match(/\(([^)]+)\)\s*$/)?.[1];
  const presentation = presentationFromName || product.presentation;
  const nameParts = cleanName.split(" ");
  const firstWord = nameParts[0];
  const restWords = nameParts.slice(1).join(" ");

  return (
    <>
      {/* Breadcrumb */}
      <div className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-8 lg:pt-12 mb-8 lg:mb-12">
        <nav className="text-xs font-mono uppercase tracking-widest text-ink-muted">
          <Link href="/" className="hover:text-ink transition-colors">Inicio</Link>
          <span className="mx-2 text-ink-subtle">/</span>
          <Link href="/productos" className="hover:text-ink transition-colors">Catálogo</Link>
          <span className="mx-2 text-ink-subtle">/</span>
          <span className="text-ink">{firstWord}</span>
        </nav>
      </div>

      {/* Hero — asymmetric editorial */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pb-16 lg:pb-24">
        <div className="grid grid-cols-12 gap-x-6 gap-y-12">
          {/* LEFT — Big visual block */}
          <div className="col-span-12 lg:col-span-7">
            <div className="relative aspect-[4/5] lg:aspect-[1/1] bg-paper-dim overflow-hidden">
              <BotanicalHero category={product.category} accent={product.is_house_brand ? "forest" : "brass"} />
              {/* Overlay info */}
              <div className="absolute top-6 left-6 flex flex-col gap-2">
                {product.is_house_brand === 1 && (
                  <span className="pill-editorial bg-paper-bright/90">Línea Cultimed</span>
                )}
                {product.is_preorder === 1 && (
                  <span className="pill-editorial bg-brass text-paper border-brass">Preventa</span>
                )}
              </div>
              {product.is_controlled === 1 && (
                <div className="absolute bottom-6 right-6">
                  <span className="pill-prescription bg-paper-bright">⚠ Receta retenida</span>
                </div>
              )}
            </div>
            {batches[0] && (
              <p className="mt-4 text-[11px] font-mono uppercase tracking-widest text-ink-subtle nums-lining">
                Lote en dispensación · <span className="text-ink">{batches[0].batch_number}</span>
                {batches[0].expiry_date && (
                  <span> · Vence {new Date(batches[0].expiry_date).toLocaleDateString("es-CL")}</span>
                )}
              </p>
            )}
          </div>

          {/* RIGHT — Editorial text column */}
          <div className="col-span-12 lg:col-span-5 lg:pl-6">
            <div className="lg:sticky lg:top-28">
              <div className="flex items-baseline justify-between mb-6">
                <span className="eyebrow">— {CATEGORY_FULL_LABEL[product.category] || product.category}</span>
                {presentation && (
                  <span className="font-mono text-xs uppercase tracking-widest text-ink-muted">
                    {presentation}
                  </span>
                )}
              </div>

              <h1 className="font-display text-display-2 leading-[0.98] mb-6 text-balance">
                <span className="font-light">{firstWord}</span>
                {restWords && <><br /><span className="italic font-normal">{restWords}</span></>}
              </h1>

              {product.vendor && (
                <p className="font-display text-xl italic text-ink-muted mb-8">
                  {product.is_house_brand ? "Línea farmacéutica Cultimed" : `por ${product.vendor}`}
                </p>
              )}

              <div className="hairline mb-8" />

              {/* Description */}
              {product.description && (
                <p className="text-base leading-relaxed text-ink-muted mb-8 text-pretty">
                  {product.description.length > 280
                    ? product.description.slice(0, 280) + "…"
                    : product.description}
                </p>
              )}

              <div className="hairline mb-8" />

              {/* Technical data */}
              <dl className="space-y-4 mb-10">
                {product.thc_percentage !== null && (
                  <DataRow label="THC" value={`${product.thc_percentage}%`} />
                )}
                {product.cbd_percentage !== null && (
                  <DataRow label="CBD" value={`${product.cbd_percentage}%`} />
                )}
                {product.active_ingredient && (
                  <DataRow label="Principio activo" value={product.active_ingredient} />
                )}
                {product.concentration && (
                  <DataRow label="Concentración" value={product.concentration} />
                )}
                <DataRow label="Vía" value={
                  product.category === "aceite_cbd" ? "Sublingual" :
                  product.category === "capsulas" ? "Oral" :
                  product.category === "topico" ? "Cutánea" :
                  product.category === "flores" ? "Vaporización / inhalación" :
                  "Según indicación"
                } />
                <DataRow label="Receta" value={
                  product.is_controlled === 1
                    ? <span className="text-sangria">Retenida (estupefaciente)</span>
                    : product.requires_prescription === 1
                    ? "Médica vigente requerida"
                    : <span className="text-forest">Venta directa</span>
                } />
              </dl>

              {/* Purchase / unlock block */}
              <div className="bg-paper-bright border border-rule p-6 lg:p-7">
                {showPrice ? (
                  <>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="eyebrow">— Precio</span>
                      {totalStock > 0 ? (
                        <span className="pill-stock">En stock · {totalStock} unid.</span>
                      ) : (
                        <span className="pill-editorial text-ink-muted">Agotado</span>
                      )}
                    </div>
                    <p className="font-display text-5xl font-light tabular-nums mb-6 nums-lining">
                      {formatCLP(product.default_price)}
                    </p>
                    {totalStock > 0 ? (
                      <AddToCartClient
                        product={{
                          productId: product.id,
                          sku: product.sku,
                          name: product.name,
                          presentation: presentation || null,
                          unitPrice: product.default_price,
                        }}
                        maxStock={totalStock}
                      />
                    ) : (
                      <Link href="/consulta" className="btn-ghost w-full justify-center">
                        Notifícame cuando vuelva
                      </Link>
                    )}
                  </>
                ) : customer ? (
                  <>
                    <p className="eyebrow mb-3">— Validación pendiente</p>
                    <p className="font-display text-2xl leading-tight mb-6 text-balance">
                      <span className="font-light">Carga tu</span>{" "}
                      <span className="italic">receta médica</span>{" "}
                      <span className="font-light">para ver precio y disponibilidad.</span>
                    </p>
                    <Link href="/mi-cuenta/recetas" className="btn-brass w-full">
                      Cargar receta médica
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="eyebrow mb-3 text-sangria">— Receta requerida</p>
                    <p className="font-display text-2xl leading-tight mb-6 text-balance">
                      <span className="font-light">Para ver precio y stock,</span>{" "}
                      <span className="italic">crea tu cuenta</span>{" "}
                      <span className="font-light">y valida tu receta.</span>
                    </p>
                    <div className="flex flex-col gap-3">
                      <Link href={`/registro?next=/productos/${slug}`} className="btn-brass w-full">
                        Crear cuenta
                      </Link>
                      <Link href={`/ingresar?next=/productos/${slug}`} className="btn-link w-full justify-center">
                        Ya tengo cuenta →
                      </Link>
                    </div>
                  </>
                )}
              </div>

              <p className="mt-6 text-[11px] font-mono leading-relaxed text-ink-muted">
                Bajo Ley 20.850 y D.S. Nº 345/2016. Producto medicinal.
                Su uso debe ser supervisado por un profesional de la salud.
                <Link href="/compliance" className="ml-1 underline hover:text-ink">Ver normativa →</Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Long-form description */}
      {product.description && product.description.length > 280 && (
        <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-32 border-t border-rule">
          <div className="grid grid-cols-12 gap-x-6">
            <div className="col-span-12 lg:col-span-3">
              <span className="eyebrow flex items-baseline gap-3">
                <span className="editorial-numeral text-base text-ink-subtle">— I</span>
                Sobre esta cepa
              </span>
            </div>
            <div className="col-span-12 lg:col-span-7 lg:col-start-5">
              <div className="prose-editorial text-lg leading-[1.7] text-ink-muted text-pretty space-y-5">
                {product.description.split(". ").map((sentence, i) => (
                  <p key={i}>{sentence}{!sentence.endsWith(".") && "."}</p>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Lot info */}
      {batches.length > 0 && (
        <section className="bg-paper-dim border-y border-rule">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-28">
            <div className="grid grid-cols-12 gap-x-6 mb-12">
              <div className="col-span-12 lg:col-span-3">
                <span className="eyebrow flex items-baseline gap-3">
                  <span className="editorial-numeral text-base text-ink-subtle">— II</span>
                  Lotes activos
                </span>
              </div>
              <div className="col-span-12 lg:col-span-7 lg:col-start-5">
                <h2 className="font-display text-display-3 leading-[1.05] text-balance">
                  <span className="font-light">Cada lote</span>{" "}
                  <span className="italic font-normal">trazado</span>{" "}
                  <span className="font-light">y certificado.</span>
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-12 gap-x-6 lg:gap-y-0 gap-y-6">
              <div className="col-span-12 lg:col-span-7 lg:col-start-5 grid grid-cols-1 sm:grid-cols-3 gap-px bg-rule">
                {batches.map((b) => (
                  <div key={b.id} className="bg-paper p-6">
                    <p className="font-mono text-[11px] uppercase tracking-widest text-ink-muted nums-lining mb-4">
                      Lote {b.batch_number}
                    </p>
                    <dl className="space-y-2 text-xs">
                      {b.manufacture_date && (
                        <div className="flex justify-between">
                          <dt className="text-ink-muted">Fab.</dt>
                          <dd className="font-mono nums-lining">{b.manufacture_date}</dd>
                        </div>
                      )}
                      {b.expiry_date && (
                        <div className="flex justify-between">
                          <dt className="text-ink-muted">Vence</dt>
                          <dd className="font-mono nums-lining">{b.expiry_date}</dd>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <dt className="text-ink-muted">Stock</dt>
                        <dd className="font-mono nums-lining">{b.quantity_current}</dd>
                      </div>
                      {b.supplier && (
                        <div className="pt-2 mt-2 border-t border-rule">
                          <dt className="text-ink-muted">Proveedor</dt>
                          <dd className="text-ink italic mt-0.5">{b.supplier}</dd>
                        </div>
                      )}
                    </dl>
                    <button
                      type="button"
                      className="mt-4 text-[10px] uppercase tracking-widest font-mono text-brass-dim border-b border-brass-dim/40 hover:border-brass-dim pb-0.5"
                    >
                      Ver COA →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Related */}
      {related.length > 0 && (
        <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-32">
          <div className="flex items-end justify-between mb-12 lg:mb-20">
            <div className="flex items-baseline gap-6">
              <span className="editorial-numeral text-2xl text-ink-subtle">— III</span>
              <span className="eyebrow">También en {CATEGORY_FULL_LABEL[product.category] || product.category}</span>
            </div>
            <Link href="/productos" className="btn-link">
              Ver catálogo →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-16">
            {related.map((p, i) => (
              <ProductCard
                key={p.id}
                product={{ ...p, slug: p.sku.toLowerCase() }}
                index={i}
                showPrice={showPrice}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-rule-soft pb-3">
      <dt className="text-[11px] uppercase tracking-widest font-mono text-ink-muted">{label}</dt>
      <dd className="text-sm font-mono nums-lining text-ink text-right">{value}</dd>
    </div>
  );
}

function BotanicalHero({ category, accent }: { category: string; accent: "forest" | "brass" }) {
  const accentColor = accent === "forest" ? "#1F3A2D" : "#A98B5C";
  return (
    <svg
      viewBox="0 0 800 800"
      className="absolute inset-0 w-full h-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <radialGradient id={`bg-${category}-${accent}-hero`} cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#FAF6EE" />
          <stop offset="100%" stopColor="#E5DFD0" />
        </radialGradient>
        <pattern id={`grain-hero-${category}`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="0.6" fill={accentColor} opacity="0.05" />
        </pattern>
      </defs>
      <rect width="800" height="800" fill={`url(#bg-${category}-${accent}-hero)`} />
      <rect width="800" height="800" fill={`url(#grain-hero-${category})`} />

      {category === "flores" && (
        <g transform="translate(400, 420)" stroke={accentColor} strokeWidth="1.2" fill="none" opacity="0.5">
          {[-72, -54, -36, -18, 0, 18, 36, 54, 72].map((rot, i) => {
            const len = 220 - Math.abs(rot) * 1.6;
            const x = Math.sin((rot * Math.PI) / 180) * len;
            const y = -Math.cos((rot * Math.PI) / 180) * len;
            return (
              <g key={i} strokeLinecap="round" strokeLinejoin="round">
                <path d={`M0 0 Q ${x * 0.3} ${y * 0.4}, ${x} ${y}`} />
                {/* leaf serrations */}
                {[0.3, 0.5, 0.7].map((t, j) => {
                  const mx = x * t, my = y * t;
                  const px = mx + Math.cos((rot * Math.PI) / 180) * 8 * (j % 2 ? 1 : -1);
                  const py = my + Math.sin((rot * Math.PI) / 180) * 8 * (j % 2 ? 1 : -1);
                  return <circle key={j} cx={px} cy={py} r="2" fill={accentColor} opacity="0.3" />;
                })}
              </g>
            );
          })}
          <line x1="0" y1="0" x2="0" y2="280" stroke={accentColor} strokeWidth="1.5" />
          <circle cx="0" cy="0" r="6" fill={accentColor} opacity="0.4" />
        </g>
      )}

      {category === "aceite_cbd" && (
        <g transform="translate(400, 380)" stroke={accentColor} strokeWidth="1.5" fill="none" opacity="0.55">
          <path d="M0 -250 C 130 -110, 180 -10, 180 110 C 180 220, 90 290, 0 290 C -90 290, -180 220, -180 110 C -180 -10, -130 -110, 0 -250 Z" />
          <path d="M-70 130 Q 0 170, 70 130" opacity="0.4" />
          <path d="M-100 80 Q 0 110, 100 80" opacity="0.3" />
          <circle cx="-50" cy="50" r="8" fill={accentColor} opacity="0.2" />
          <circle cx="40" cy="-30" r="5" fill={accentColor} opacity="0.15" />
        </g>
      )}

      {category === "capsulas" && (
        <g transform="translate(400, 400)" stroke={accentColor} strokeWidth="1.5" fill="none" opacity="0.55">
          <rect x="-180" y="-60" width="360" height="120" rx="60" />
          <line x1="0" y1="-60" x2="0" y2="60" />
          <rect x="-180" y="-60" width="180" height="120" rx="60" fill={accentColor} opacity="0.08" />
          <text x="0" y="-90" fontFamily="JetBrains Mono" fontSize="11" letterSpacing="0.2em" fill={accentColor} opacity="0.5" textAnchor="middle">
            CAPSULA · 25mg
          </text>
        </g>
      )}

      {category === "topico" && (
        <g transform="translate(400, 400)" stroke={accentColor} strokeWidth="1.5" fill="none" opacity="0.55">
          <rect x="-160" y="-90" width="320" height="50" />
          <rect x="-180" y="-40" width="360" height="280" />
          <line x1="-120" y1="0" x2="120" y2="0" opacity="0.3" />
          <line x1="-120" y1="60" x2="120" y2="60" opacity="0.2" />
          <text x="0" y="120" fontFamily="JetBrains Mono" fontSize="14" letterSpacing="0.3em" fill={accentColor} opacity="0.6" textAnchor="middle">
            CULTIMED
          </text>
          <text x="0" y="160" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="0.2em" fill={accentColor} opacity="0.4" textAnchor="middle">
            BÁLSAMO TÓPICO · 50G
          </text>
        </g>
      )}

      {!["flores", "aceite_cbd", "capsulas", "topico"].includes(category) && (
        <g transform="translate(400, 400)" stroke={accentColor} strokeWidth="1.5" fill="none" opacity="0.55">
          <circle cx="0" cy="0" r="200" />
          <circle cx="0" cy="0" r="140" opacity="0.5" />
          <circle cx="0" cy="0" r="80" opacity="0.3" />
        </g>
      )}

      {/* Editorial corner marks */}
      <g stroke={accentColor} strokeWidth="1.5" opacity="0.4">
        <line x1="50" y1="50" x2="100" y2="50" />
        <line x1="50" y1="50" x2="50" y2="100" />
        <line x1="750" y1="50" x2="700" y2="50" />
        <line x1="750" y1="50" x2="750" y2="100" />
        <line x1="50" y1="750" x2="100" y2="750" />
        <line x1="50" y1="750" x2="50" y2="700" />
        <line x1="750" y1="750" x2="700" y2="750" />
        <line x1="750" y1="750" x2="750" y2="700" />
      </g>
    </svg>
  );
}
