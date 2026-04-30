export default function PrivacidadPage() {
  return (
    <article className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24">
      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        <header className="col-span-12 lg:col-span-3 lg:sticky lg:top-32 self-start">
          <span className="eyebrow mb-3 block">— Documento legal</span>
          <h1 className="font-display text-3xl lg:text-4xl leading-tight text-balance">
            <span className="font-light">Política de</span>{" "}
            <span className="italic font-normal">privacidad</span>
          </h1>
          <p className="text-xs font-mono uppercase tracking-widest text-ink-muted mt-3">
            Ley Nº 19.628 · Versión 1.0
          </p>
        </header>
        <div className="col-span-12 lg:col-span-8 lg:col-start-5 prose-editorial space-y-7 text-base leading-[1.7] text-ink-muted text-pretty">
          <p>
            De conformidad con la <strong className="text-ink not-italic">Ley Nº 19.628 sobre Protección de la Vida Privada</strong>,
            Cultimed garantiza la confidencialidad de sus datos personales y sensibles
            (especialmente aquellos relativos a su salud y uso de cannabis medicinal).
          </p>

          <h2 className="font-display text-2xl text-ink mt-12 mb-2">— I · Datos que recopilamos</h2>
          <ul className="space-y-2 list-none pl-0">
            <li>· Identidad: nombre, RUT, fecha de nacimiento.</li>
            <li>· Contacto: email, teléfono, dirección de despacho.</li>
            <li>· Salud: receta médica, diagnóstico, dosis prescritas, evolución.</li>
            <li>· Transaccionales: pedidos, comprobantes de pago, lotes asignados.</li>
          </ul>

          <h2 className="font-display text-2xl text-ink mt-12 mb-2">— II · Finalidad del tratamiento</h2>
          <p>Sus datos serán utilizados <em>exclusivamente</em> para:</p>
          <ul className="space-y-2 list-none pl-0">
            <li>· Verificación de identidad y mayoría de edad.</li>
            <li>· Validación de recetas médicas vigentes.</li>
            <li>· Procesamiento de pedidos y trazabilidad de envíos.</li>
            <li>· Seguimiento clínico y comunicación relacionada con su tratamiento.</li>
          </ul>

          <h2 className="font-display text-2xl text-ink mt-12 mb-2">— III · Tratamiento de datos sensibles</h2>
          <p>
            Sus datos de salud están clasificados como <strong className="text-ink not-italic">sensibles</strong> según el
            artículo 11 de la Ley 19.628 y gozan de protección reforzada. Solo personal
            autorizado (químico farmacéutico, médico tratante) tiene acceso, y todo acceso queda
            registrado en bitácora de auditoría.
          </p>

          <h2 className="font-display text-2xl text-ink mt-12 mb-2">— IV · No compartimos con terceros</h2>
          <p>
            No compartiremos sus datos con terceros sin su consentimiento expreso, salvo
            obligación legal o requerimiento de autoridad competente (ISP, PDI, Ministerio de Salud).
          </p>

          <h2 className="font-display text-2xl text-ink mt-12 mb-2">— V · Sus derechos</h2>
          <p>
            Usted tiene derecho a acceder, rectificar, eliminar o solicitar la portabilidad de
            sus datos en cualquier momento. Para ejercerlos escriba a{" "}
            <a href="mailto:privacidad@dispensariocultimed.cl" className="text-ink underline underline-offset-4 decoration-ink/40">privacidad@dispensariocultimed.cl</a>.
          </p>

          <h2 className="font-display text-2xl text-ink mt-12 mb-2">— VI · Conservación</h2>
          <p>
            Conservamos sus datos clínicos durante el tiempo que dure su tratamiento más 5 años
            adicionales, conforme a la normativa sanitaria. Los datos transaccionales se conservan
            por 6 años para fines tributarios.
          </p>
        </div>
      </div>
    </article>
  );
}
