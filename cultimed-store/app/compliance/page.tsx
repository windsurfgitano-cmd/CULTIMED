import Link from "next/link";

export default function CompliancePage() {
  return (
    <>
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12 lg:pt-20 pb-16">
        <div className="grid grid-cols-12 gap-x-6 items-end">
          <div className="col-span-12 lg:col-span-9">
            <span className="eyebrow mb-4 block">— Compliance · Marco legal vigente</span>
            <h1 className="font-display text-display-2 leading-[0.98] text-balance">
              <span className="font-light">Operamos</span>{" "}
              <span className="italic font-normal">dentro</span>{" "}
              <span className="font-light">de la ley.</span>
            </h1>
          </div>
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24 grid grid-cols-12 gap-x-6 gap-y-12">
        <aside className="col-span-12 lg:col-span-3 lg:sticky lg:top-32 self-start">
          <p className="eyebrow mb-4">— En esta página</p>
          <ul className="space-y-3 text-sm">
            {[
              { id: "ley-20850", label: "Ley 20.850" },
              { id: "ds-345", label: "DS Nº 345/2016" },
              { id: "ley-19628", label: "Ley 19.628" },
              { id: "ley-20000", label: "Ley 20.000" },
              { id: "ley-21368", label: "Ley 21.368" },
              { id: "isp", label: "Registro ISP" },
            ].map((l) => (
              <li key={l.id}>
                <a href={`#${l.id}`} className="text-ink-muted hover:text-ink border-b border-transparent hover:border-ink/40 pb-0.5 transition-all">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </aside>

        <article className="col-span-12 lg:col-span-8 lg:col-start-5 prose-editorial space-y-16">
          <Block id="ley-20850" n="01" title="Ley Nº 20.850 — Ley Ricarte Soto">
            Establece un Sistema de Protección Financiera para Diagnósticos y Tratamientos de Alto Costo,
            que incluye terapias derivadas del cannabis para enfermedades específicas. Cultimed opera
            bajo el marco general de comercialización de fitofármacos y productos derivados conforme a
            esta normativa, con prescripción médica vigente como requisito ineludible.
          </Block>

          <Block id="ds-345" n="02" title="Decreto Supremo Nº 345/2016 (Ministerio de Salud)">
            Aprueba el reglamento del Sistema Nacional de Control de los Productos Farmacéuticos de
            Uso Humano. Establece los requisitos de registro, fabricación, importación, almacenamiento
            y dispensación. Cultimed cumple con los requisitos de dispensación bajo receta médica
            retenida cuando corresponde a productos con alto contenido de THC.
          </Block>

          <Block id="ley-19628" n="03" title="Ley Nº 19.628 — Protección de la Vida Privada">
            De conformidad con el artículo 11, sus datos relativos a la salud son considerados
            sensibles y gozan de protección reforzada. Cultimed garantiza:
            <ul className="mt-4 space-y-2 list-none">
              <li className="flex items-baseline gap-3">
                <span className="editorial-numeral text-ink-subtle w-8 shrink-0">01</span>
                <span>Confidencialidad de toda información clínica y de tratamiento.</span>
              </li>
              <li className="flex items-baseline gap-3">
                <span className="editorial-numeral text-ink-subtle w-8 shrink-0">02</span>
                <span>No compartir datos con terceros sin consentimiento expreso, salvo requerimiento legal.</span>
              </li>
              <li className="flex items-baseline gap-3">
                <span className="editorial-numeral text-ink-subtle w-8 shrink-0">03</span>
                <span>Acceso, rectificación y eliminación garantizados al titular en cualquier momento.</span>
              </li>
            </ul>
          </Block>

          <Block id="ley-20000" n="04" title="Ley Nº 20.000 — Tráfico de Estupefacientes">
            Regula y sanciona la comercialización no autorizada de cannabis. Cultimed opera
            estrictamente bajo el marco autorizado por las autoridades sanitarias chilenas (ISP, SEREMI).
            Cualquier dispensación realizada por Cultimed cuenta con registro, lote trazado y receta
            médica vigente del paciente.
          </Block>

          <Block id="ley-21368" n="05" title="Ley Nº 21.368 — Acceso a Información Sanitaria">
            Garantiza el derecho de los pacientes a acceder a su información clínica y a los
            certificados de análisis (COA) de los productos que reciben. Por cada lote dispensado,
            Cultimed entrega copia digital del COA y mantiene registro disponible.
          </Block>

          <Block id="isp" n="06" title="Registro ISP · Certificación GMP">
            Todos nuestros productos farmacéuticos están registrados ante el Instituto de Salud
            Pública (ISP). El cultivo y procesamiento se realiza bajo estándares de Buenas Prácticas
            de Manufactura (GMP). El número de registro sanitario aparece en cada ficha técnica de
            producto.
          </Block>
        </article>
      </section>

      <section className="bg-paper-dim border-y border-rule">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 grid grid-cols-12 gap-x-6 gap-y-8 items-end">
          <div className="col-span-12 lg:col-span-7">
            <h2 className="font-display text-display-3 leading-[1.05] text-balance">
              <span className="font-light">¿Tienes consultas</span>{" "}
              <span className="italic font-normal">legales</span>{" "}
              <span className="font-light">o regulatorias?</span>
            </h2>
          </div>
          <div className="col-span-12 lg:col-span-3 lg:col-start-10 lg:pb-3">
            <a href="mailto:legal@dispensariocultimed.cl" className="btn-brass w-full">Contactar legal</a>
          </div>
        </div>
      </section>
    </>
  );
}

function Block({ id, n, title, children }: { id: string; n: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-32">
      <p className="eyebrow mb-3 flex items-baseline gap-3">
        <span className="editorial-numeral text-base text-ink-subtle">— {n}</span>
        <span>{title}</span>
      </p>
      <h2 className="font-display text-3xl lg:text-4xl leading-tight mb-6 text-balance">{title}</h2>
      <div className="text-base lg:text-lg leading-[1.7] text-ink-muted text-pretty space-y-4">
        {children}
      </div>
    </section>
  );
}
