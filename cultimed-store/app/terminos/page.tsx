export default function TerminosPage() {
  return (
    <article className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24">
      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        <header className="col-span-12 lg:col-span-3 lg:sticky lg:top-32 self-start">
          <span className="eyebrow mb-3 block">— Documento legal</span>
          <h1 className="font-display text-3xl lg:text-4xl leading-tight text-balance">
            <span className="font-light">Términos</span>{" "}
            <span className="italic font-normal">de uso</span>
          </h1>
        </header>
        <div className="col-span-12 lg:col-span-8 lg:col-start-5 prose-editorial space-y-7 text-base leading-[1.7] text-ink-muted text-pretty">
          <p>
            El uso de este sitio implica la aceptación expresa de los presentes términos.
            Si no está de acuerdo con alguno de ellos, le solicitamos no utilizar el servicio.
          </p>
          <h2 className="font-display text-2xl text-ink mt-10 mb-2">— I · Naturaleza del servicio</h2>
          <p>
            Cultimed opera como dispensario de cannabis medicinal autorizado en Chile.
            Los productos comercializados requieren prescripción médica vigente y supervisión
            profesional, conforme a la Ley 20.850 y el D.S. Nº 345/2016.
          </p>
          <h2 className="font-display text-2xl text-ink mt-10 mb-2">— II · Requisitos de acceso</h2>
          <ul className="space-y-2 list-none pl-0">
            <li>· Ser mayor de 18 años.</li>
            <li>· Contar con receta médica vigente.</li>
            <li>· Aceptar la verificación de identidad y validación de receta por parte del personal de Cultimed.</li>
          </ul>
          <h2 className="font-display text-2xl text-ink mt-10 mb-2">— III · No constituye asesoría médica</h2>
          <p>
            La información publicada en este sitio tiene fines exclusivamente informativos. No
            constituye asesoría médica ni reemplaza la evaluación de un profesional habilitado.
            No automedicarse.
          </p>
          <h2 className="font-display text-2xl text-ink mt-10 mb-2">— IV · Pagos y reembolsos</h2>
          <p>
            Los pagos se realizan vía transferencia bancaria. Los pedidos se preparan una vez
            confirmado el pago por nuestro equipo. No procesamos reembolsos por productos ya
            dispensados, salvo defectos verificados o discrepancias atribuibles a Cultimed.
          </p>
          <h2 className="font-display text-2xl text-ink mt-10 mb-2">— V · Propiedad intelectual</h2>
          <p>
            Todo el contenido del sitio (textos, imágenes, gráficos, marca) es propiedad de
            Cultimed SpA y está protegido por la legislación chilena vigente.
          </p>
        </div>
      </div>
    </article>
  );
}
