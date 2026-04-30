import Link from "next/link";

export default function ConsultaPage() {
  const wa = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "56993177375";
  const consultaEmail = process.env.NEXT_PUBLIC_CONSULTA_EMAIL || "consulta@dispensariocultimed.cl";
  const msg = encodeURIComponent("Hola Cultimed, me gustaría agendar una consulta médica.");

  return (
    <>
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12 lg:pt-20 pb-16 lg:pb-24">
        <div className="grid grid-cols-12 gap-x-6 gap-y-12 items-end">
          <div className="col-span-12 lg:col-span-8">
            <span className="eyebrow mb-4 block">— Consulta médica online</span>
            <h1 className="font-display text-display-1 leading-[0.95] text-balance">
              <span className="font-light">Una consulta,</span>{" "}
              <span className="italic font-normal">una receta,</span>{" "}
              <span className="font-light">una pauta clínica.</span>
            </h1>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:pb-4">
            <p className="text-base text-ink-muted leading-relaxed mb-6">
              Si nunca has tomado cannabis medicinal, o si quieres ajustar tu tratamiento,
              partimos por una evaluación clínica con uno de nuestros médicos colegiados.
            </p>
            <a
              href={`https://wa.me/${wa}?text=${msg}`}
              target="_blank"
              rel="noopener"
              className="btn-brass w-full mb-3"
            >
              Agendar por WhatsApp
            </a>
            <a href={`mailto:${consultaEmail}`} className="btn-link justify-center w-full">
              Escribir a {consultaEmail} →
            </a>
          </div>
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-32">
        <div className="grid grid-cols-12 gap-x-6 gap-y-12">
          <div className="col-span-12 lg:col-span-4">
            <div className="flex items-baseline gap-6 mb-6">
              <span className="editorial-numeral text-2xl text-ink-subtle">— I</span>
              <span className="eyebrow">Cómo funciona</span>
            </div>
            <h2 className="font-display text-display-3 leading-[1.05] text-balance">
              <span className="font-light">Treinta minutos.</span>{" "}
              <span className="italic font-normal">Una pauta clara.</span>
            </h2>
          </div>
          <ol className="col-span-12 lg:col-span-7 lg:col-start-6 space-y-6">
            {[
              { n: "01", t: "Agendamiento", d: "Eliges fecha y hora desde nuestro calendario online o vía WhatsApp." },
              { n: "02", t: "Consulta", d: "30 minutos por videollamada con tu médico tratante. Evaluación, anamnesis e historial." },
              { n: "03", t: "Receta digital", d: "Si corresponde, el médico emite receta digital firmada electrónicamente, válida en Chile." },
              { n: "04", t: "Plan de seguimiento", d: "Definimos titulación de dosis, controles mensuales y comunicación continua." },
            ].map((s) => (
              <li key={s.n} className="grid grid-cols-12 gap-4 items-baseline pb-6 border-b border-rule">
                <span className="col-span-2 lg:col-span-1 editorial-numeral text-lg text-ink-subtle">{s.n}</span>
                <div className="col-span-10 lg:col-span-11">
                  <h3 className="font-display text-2xl mb-1">{s.t}</h3>
                  <p className="text-sm text-ink-muted leading-relaxed">{s.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-forest text-paper py-20 lg:py-32 relative overflow-hidden">
        <div className="absolute inset-0 grain-overlay opacity-50" aria-hidden />
        <div className="relative max-w-[1440px] mx-auto px-6 lg:px-12 grid grid-cols-12 gap-x-6 gap-y-8 items-end">
          <div className="col-span-12 lg:col-span-7">
            <p className="eyebrow text-paper/60 mb-4">— Honorario médico</p>
            <h2 className="font-display text-display-2 leading-[1.0] text-balance">
              <span className="font-light">Consulta inicial</span>{" "}
              <span className="italic font-normal">desde</span>{" "}
              <span className="font-light">$25.000.</span>
            </h2>
            <p className="text-base text-paper/80 mt-6 max-w-md">
              El honorario se paga por transferencia previa a la consulta. Incluye 30 min de
              videollamada, evaluación clínica, receta digital y plan de seguimiento mensual
              durante 3 meses.
            </p>
          </div>
          <div className="col-span-12 lg:col-span-3 lg:col-start-10 lg:pb-3">
            <a
              href={`https://wa.me/${wa}?text=${msg}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center justify-center w-full px-8 py-3.5 bg-paper text-ink text-sm tracking-editorial font-medium hover:bg-brass-bright transition-colors duration-300"
            >
              Agendar consulta
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
