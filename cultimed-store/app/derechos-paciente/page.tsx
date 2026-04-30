export default function DerechosPacientePage() {
  return (
    <article className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24">
      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        <header className="col-span-12 lg:col-span-3 lg:sticky lg:top-32 self-start">
          <span className="eyebrow mb-3 block">— Carta del paciente</span>
          <h1 className="font-display text-3xl lg:text-4xl leading-tight text-balance">
            <span className="font-light">Derechos</span>{" "}
            <span className="italic font-normal">del paciente</span>
          </h1>
          <p className="text-xs font-mono uppercase tracking-widest text-ink-muted mt-3">Ley 20.584</p>
        </header>
        <div className="col-span-12 lg:col-span-8 lg:col-start-5 prose-editorial space-y-7 text-base leading-[1.7] text-ink-muted text-pretty">
          <p>
            Conforme a la Ley Nº 20.584 sobre derechos y deberes que tienen las personas en
            relación con acciones vinculadas a su atención en salud, los pacientes de Cultimed
            tienen los siguientes derechos:
          </p>
          <ol className="space-y-4 list-none pl-0 mt-8">
            {[
              ["Trato digno y respetuoso", "Recibir atención respetuosa de su intimidad, privacidad y autonomía."],
              ["Información clara y oportuna", "Conocer en lenguaje accesible su diagnóstico, tratamiento y posibles efectos."],
              ["Consentimiento informado", "Aceptar o rechazar cualquier tratamiento, salvo casos de urgencia o salud pública."],
              ["Confidencialidad", "Que su ficha y registros médicos sean tratados como información sensible y confidencial."],
              ["Acceso a su información clínica", "Solicitar copia de su ficha clínica y certificados de análisis (COA) de productos dispensados."],
              ["Compañía y asistencia espiritual", "Recibir compañía durante la atención y apoyo espiritual si lo solicita."],
              ["Reclamos y sugerencias", "Presentar reclamos formales y recibir respuesta en plazos razonables."],
            ].map(([t, d], i) => (
              <li key={t} className="grid grid-cols-12 gap-4 items-baseline pb-5 border-b border-rule-soft">
                <span className="col-span-1 editorial-numeral text-base text-ink-subtle">{String(i + 1).padStart(2, "0")}</span>
                <div className="col-span-11">
                  <p className="font-display text-xl text-ink mb-1">{t}</p>
                  <p>{d}</p>
                </div>
              </li>
            ))}
          </ol>

          <h2 className="font-display text-2xl text-ink mt-12 mb-2">— Vías de reclamo</h2>
          <p>
            Si cree que sus derechos no han sido respetados, puede contactarnos por escrito a{" "}
            <a href="mailto:reclamos@dispensariocultimed.cl" className="text-ink underline underline-offset-4 decoration-ink/40">reclamos@dispensariocultimed.cl</a>{" "}
            o presentar reclamo formal ante la SEREMI de Salud de su Región.
          </p>
        </div>
      </div>
    </article>
  );
}
