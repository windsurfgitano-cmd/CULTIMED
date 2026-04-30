import Link from "next/link";
import { all } from "@/lib/db";
import ProductCard from "@/components/ProductCard";

export const dynamic = "force-dynamic";

interface FeaturedProduct {
  id: number;
  sku: string;
  slug: string;
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
}

export default async function HomePage() {
  const featured = await all<FeaturedProduct>(
    `SELECT p.id, p.sku, p.name, p.category, p.presentation, p.default_price,
       p.thc_percentage, p.cbd_percentage, p.vendor, p.is_house_brand, p.description,
       NULL as image_url,
       LOWER(REPLACE(REPLACE(p.sku, '-', '-'), ' ', '-')) as slug
     FROM products p
     JOIN batches b ON b.product_id = p.id
     WHERE p.is_active = 1 AND b.quantity_current > 0 AND p.shopify_status = 'active'
     GROUP BY p.id
     ORDER BY p.is_house_brand DESC, p.created_at DESC
     LIMIT 6`
  );

  return (
    <>
      {/* ────────────────  HERO  ──────────────── */}
      <section className="relative overflow-hidden">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12 lg:pt-24 pb-20 lg:pb-32">
          <div className="grid grid-cols-12 gap-x-6 gap-y-10 items-end">
            {/* Eyebrow rule */}
            <div className="col-span-12 flex items-center gap-6 mb-6 lg:mb-12">
              <span className="eyebrow opacity-0 animate-fade-up" style={{ animationDelay: "0.1s" }}>
                — Dispensario clínico autorizado
              </span>
              <span
                className="hairline-thick max-w-[200px] origin-left animate-rule-grow"
                style={{ animationDelay: "0.2s" }}
              />
            </div>

            {/* Headline (asymmetric, left-heavy) */}
            <h1 className="col-span-12 lg:col-span-9 font-display text-display-1 text-balance leading-[0.95]">
              <span className="block opacity-0 animate-fade-up" style={{ animationDelay: "0.25s" }}>
                <span className="font-light">Cannabis</span>
              </span>
              <span className="block opacity-0 animate-fade-up" style={{ animationDelay: "0.4s" }}>
                <span className="italic font-normal">medicinal</span>{" "}
                <span className="font-light">de</span>
              </span>
              <span className="block opacity-0 animate-fade-up" style={{ animationDelay: "0.55s" }}>
                <span className="font-light">precisión.</span>
              </span>
            </h1>

            {/* Right column with paragraph + CTAs */}
            <div className="col-span-12 lg:col-span-3 lg:col-start-10 lg:pb-3">
              <div className="opacity-0 animate-fade-up" style={{ animationDelay: "0.7s" }}>
                <p className="text-sm leading-relaxed text-ink-muted mb-6 max-w-xs">
                  Productos farmacéuticos de grado médico, formulados bajo
                  estándares <span className="italic">GMP</span> y respaldados por
                  evidencia clínica. Cada lote certificado por laboratorio
                  independiente.
                </p>
                <div className="flex flex-col gap-3">
                  <Link href="/consulta" className="btn-brass">
                    Agenda tu consulta
                  </Link>
                  <Link href="/productos" className="btn-link">
                    Ver el catálogo →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hero bottom band — quiet trust strip */}
        <div className="border-y border-rule bg-paper-dim/40">
          <div className="max-w-[1440px] mx-auto px-6 lg:px-12 py-6 grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-12 items-center">
            <TrustItem
              n="01"
              title="SANNA · Autorizado"
              description="Cumplimiento total de normativa chilena vigente."
            />
            <TrustItem
              n="02"
              title="ISP · Registrado"
              description="Cada producto con N° de registro sanitario."
            />
            <TrustItem
              n="03"
              title="GMP · Certificado"
              description="Cultivo y procesamiento bajo estándares farmacéuticos."
            />
            <TrustItem
              n="04"
              title="COA · Por lote"
              description="Certificado de análisis de laboratorio independiente."
            />
          </div>
        </div>
      </section>

      {/* ────────────────  SECTION 01 — CATÁLOGO  ──────────────── */}
      <section className="py-24 lg:py-40 max-w-[1440px] mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-12 gap-x-6 mb-16 lg:mb-20 items-end">
          <div className="col-span-12 lg:col-span-7">
            <div className="flex items-baseline gap-6 mb-6">
              <span className="editorial-numeral text-2xl text-ink-subtle">— 01</span>
              <span className="eyebrow">Catálogo</span>
            </div>
            <h2 className="font-display text-display-2 leading-[1.0] text-balance">
              <span className="font-light">Una selección</span>{" "}
              <span className="italic font-normal">curada</span>{" "}
              <span className="font-light">de cepas y formulaciones.</span>
            </h2>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-9 lg:pb-3">
            <p className="text-sm leading-relaxed text-ink-muted mb-4">
              Trabajamos con genéticas premium de breeders internacionales y nuestra propia línea farmacéutica.
              Todos los productos requieren prescripción médica vigente.
            </p>
            <Link href="/productos" className="btn-link">
              Ver catálogo completo →
            </Link>
          </div>
        </div>

        {/* Featured grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-16 lg:gap-y-24">
          {featured.map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} />
          ))}
        </div>
      </section>

      {/* ────────────────  SECTION 02 — CONSULTA  ──────────────── */}
      <section className="bg-forest text-paper py-24 lg:py-40 relative overflow-hidden">
        <div className="absolute inset-0 grain-overlay opacity-50" aria-hidden />
        <div className="relative max-w-[1440px] mx-auto px-6 lg:px-12">
          <div className="grid grid-cols-12 gap-x-6 gap-y-10">
            <div className="col-span-12 lg:col-span-5">
              <div className="flex items-baseline gap-6 mb-6">
                <span className="editorial-numeral text-2xl text-paper/50">— 02</span>
                <span className="eyebrow text-paper/60">Consulta médica</span>
              </div>
              <h2 className="font-display text-display-2 leading-[1.0] text-balance">
                <span className="font-light">¿No tienes</span>{" "}
                <span className="italic font-normal">receta</span>{" "}
                <span className="font-light">médica?</span>
              </h2>
            </div>
            <div className="col-span-12 lg:col-span-6 lg:col-start-7 lg:pt-4">
              <p className="font-display text-2xl lg:text-3xl leading-[1.3] text-balance text-paper mb-8">
                Agenda una consulta con uno de nuestros médicos especialistas. Evaluación clínica,
                titulación de dosis y receta digital — todo desde Chile.
              </p>
              <div className="space-y-3 mb-10">
                {[
                  "Consulta online de 30 minutos",
                  "Médico colegiado especializado en cannabis medicinal",
                  "Receta digital validada en el mismo dispensario",
                  "Seguimiento mensual incluido",
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <span className="font-mono text-[10px] tracking-widest uppercase text-paper/40 w-8">
                      / {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-paper/85">{b}</span>
                  </div>
                ))}
              </div>
              <Link
                href="/consulta"
                className="inline-flex items-center gap-3 px-8 py-3.5 bg-paper text-ink text-sm tracking-editorial font-medium hover:bg-brass-bright transition-colors duration-300"
              >
                Agendar consulta
                <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ────────────────  SECTION 03 — TRAZABILIDAD  ──────────────── */}
      <section className="py-24 lg:py-40 max-w-[1440px] mx-auto px-6 lg:px-12">
        <div className="grid grid-cols-12 gap-x-6 mb-16 lg:mb-24">
          <div className="col-span-12 lg:col-span-7">
            <div className="flex items-baseline gap-6 mb-6">
              <span className="editorial-numeral text-2xl text-ink-subtle">— 03</span>
              <span className="eyebrow">Trazabilidad</span>
            </div>
            <h2 className="font-display text-display-2 leading-[1.0] text-balance">
              <span className="font-light">De la</span>{" "}
              <span className="italic font-normal">semilla</span>{" "}
              <span className="font-light">a tus manos.</span>
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-x-6 gap-y-12">
          <div className="lg:col-span-5">
            <p className="text-base lg:text-lg leading-relaxed text-ink-muted text-pretty mb-6">
              Cada gramo en nuestro catálogo tiene una historia documentada: variedad, cosecha,
              curado, análisis, lote. Te entregamos esa cadena completa, no solo el producto final.
            </p>
            <Link href="/trazabilidad" className="btn-link">
              Cómo funciona la trazabilidad →
            </Link>
          </div>

          <div className="lg:col-span-7">
            <ol className="space-y-6">
              {[
                { n: "01", title: "Semilla", body: "Genética verificada y registrada con breeder de origen." },
                { n: "02", title: "Cultivo", body: "Vegetación y floración con condiciones controladas y registradas." },
                { n: "03", title: "Cosecha y curado", body: "Secado controlado, curado lento, peso y humedad verificados." },
                { n: "04", title: "Laboratorio", body: "COA con cannabinoides, terpenos, contaminantes — independiente." },
                { n: "05", title: "Envasado", body: "Identificación de lote, etiquetado clínico, hermético." },
                { n: "06", title: "Dispensación", body: "Receta verificada, paciente identificado, lote asignado." },
                { n: "07", title: "Despacho", body: "Pickup en farmacia o courier con seguimiento." },
              ].map((step, i) => (
                <li key={step.n} className="grid grid-cols-12 gap-4 items-baseline group">
                  <span className="col-span-2 lg:col-span-1 editorial-numeral text-lg text-ink-subtle group-hover:text-brass transition-colors">
                    {step.n}
                  </span>
                  <div className="col-span-10 lg:col-span-11 pb-6 border-b border-rule">
                    <h3 className="font-display text-2xl lg:text-3xl mb-1 group-hover:italic transition-all">
                      {step.title}
                    </h3>
                    <p className="text-sm text-ink-muted leading-relaxed">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ────────────────  CLOSING / CTA BAND  ──────────────── */}
      <section className="bg-paper-dim border-y border-rule">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-28">
          <div className="grid grid-cols-12 gap-x-6 gap-y-10 items-end">
            <div className="col-span-12 lg:col-span-8">
              <p className="eyebrow mb-4">— Empieza con seguridad clínica</p>
              <h2 className="font-display text-display-2 leading-[1.0] text-balance">
                <span className="font-light">Una farmacia</span>{" "}
                <span className="italic font-normal">no se improvisa.</span>{" "}
                <span className="font-light">Tu tratamiento tampoco.</span>
              </h2>
            </div>
            <div className="col-span-12 lg:col-span-3 lg:col-start-10 lg:pb-3">
              <Link href="/consulta" className="btn-brass w-full mb-3">
                Agendar consulta médica
              </Link>
              <Link href="/registro" className="btn-link w-full justify-center">
                Crear cuenta de paciente →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function TrustItem({ n, title, description }: { n: string; title: string; description: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="editorial-numeral text-base text-ink-subtle shrink-0">{n}</span>
      <div>
        <p className="text-[11px] uppercase tracking-widest font-medium text-ink mb-1">{title}</p>
        <p className="text-xs text-ink-muted leading-relaxed">{description}</p>
      </div>
    </div>
  );
}
