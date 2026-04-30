import Link from "next/link";

export default function TrazabilidadPage() {
  return (
    <>
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12 lg:pt-20 pb-16">
        <div className="grid grid-cols-12 gap-x-6 items-end gap-y-8">
          <div className="col-span-12 lg:col-span-8">
            <span className="eyebrow mb-4 block">— Trazabilidad</span>
            <h1 className="font-display text-display-1 leading-[0.95] text-balance">
              <span className="font-light">Una</span>{" "}
              <span className="italic font-normal">cadena de custodia,</span>{" "}
              <span className="font-light">documentada.</span>
            </h1>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:pb-4">
            <p className="text-base text-ink-muted leading-relaxed">
              Cada gramo y cada gota tienen un origen documentado. Aquí explicamos cómo registramos
              el ciclo completo y cómo puedes consultarlo si ya eres paciente nuestro.
            </p>
          </div>
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-32">
        <div className="grid grid-cols-12 gap-x-6 gap-y-12">
          <div className="col-span-12 lg:col-span-4">
            <div className="lg:sticky lg:top-32">
              <p className="eyebrow mb-4">— El ciclo de un lote</p>
              <h2 className="font-display text-display-3 leading-[1.05] text-balance">
                <span className="font-light">De la</span>{" "}
                <span className="italic font-normal">semilla</span>{" "}
                <span className="font-light">a tu receta.</span>
              </h2>
            </div>
          </div>

          <ol className="col-span-12 lg:col-span-8 space-y-0">
            {[
              { n: "01", t: "Semilla", d: "Genética verificada, registrada con el breeder de origen. Cada lote inicia con un código único." },
              { n: "02", t: "Vegetación", d: "Fase de crecimiento bajo condiciones controladas: luz, temperatura, humedad y nutrientes registrados a diario." },
              { n: "03", t: "Floración", d: "Período de formación de flores y desarrollo de cannabinoides, controlado bajo estándares GMP." },
              { n: "04", t: "Cosecha", d: "Manual y selectiva. Peso fresco, fecha y responsable registrados al gramo." },
              { n: "05", t: "Secado y curado", d: "Secado lento en cámaras controladas. Curado de 4 a 8 semanas para óptimo desarrollo aromático." },
              { n: "06", t: "Laboratorio", d: "Análisis independiente: cannabinoides, terpenos, contaminantes (pesticidas, metales pesados, microbiología). COA disponible." },
              { n: "07", t: "Envasado", d: "Etiquetado clínico, número de lote, fecha de vencimiento, presentación hermética." },
              { n: "08", t: "Inventario", d: "Ingreso al dispensario con QR único. Trazabilidad continua hasta el momento de la dispensación." },
              { n: "09", t: "Dispensación", d: "Receta verificada, paciente identificado, lote asignado y registrado en su historial." },
              { n: "10", t: "Despacho", d: "Pickup o courier privado con código de seguimiento. Cada hito notificado por WhatsApp." },
            ].map((step) => (
              <li key={step.n} className="grid grid-cols-12 gap-4 items-baseline pb-7 border-b border-rule group">
                <span className="col-span-2 lg:col-span-1 editorial-numeral text-xl text-ink-subtle group-hover:text-brass transition-colors">{step.n}</span>
                <div className="col-span-10 lg:col-span-11 pt-7">
                  <h3 className="font-display text-2xl lg:text-3xl mb-1.5 group-hover:italic transition-all">{step.t}</h3>
                  <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">{step.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-paper-dim border-t border-rule">
        <div className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-28 grid grid-cols-12 gap-x-6 gap-y-8 items-end">
          <div className="col-span-12 lg:col-span-7">
            <h2 className="font-display text-display-3 leading-[1.05] text-balance">
              <span className="font-light">¿Eres paciente?</span>{" "}
              <span className="italic font-normal">Consulta el</span>{" "}
              <span className="font-light">lote de tu receta.</span>
            </h2>
          </div>
          <div className="col-span-12 lg:col-span-3 lg:col-start-10 lg:pb-3">
            <Link href="/mi-cuenta/pedidos" className="btn-brass w-full">Ver mis pedidos</Link>
          </div>
        </div>
      </section>
    </>
  );
}
