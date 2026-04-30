import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-forest text-paper relative overflow-hidden">
      <div className="absolute inset-0 grain-overlay opacity-30" aria-hidden="true" />
      <div className="relative max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-28">
        {/* Top mark */}
        <div className="mb-16 lg:mb-24 flex items-end justify-between gap-12 flex-wrap">
          <div className="max-w-2xl">
            <p className="eyebrow text-paper/60 mb-4">— Cannabis medicinal de precisión</p>
            <h2 className="font-display text-display-3 text-balance">
              <span className="font-light">Una farmacia</span>{" "}
              <span className="italic font-normal">de laboratorio</span>{" "}
              <span className="font-light">en cada gota.</span>
            </h2>
          </div>
          <Link
            href="/consulta"
            className="inline-flex items-center gap-3 text-sm tracking-editorial border-b border-paper/40 hover:border-paper pb-1 transition-colors duration-300"
          >
            Agenda tu consulta
            <span aria-hidden>→</span>
          </Link>
        </div>

        <div className="hairline bg-paper/20 mb-16" />

        <div className="grid grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-12 mb-16">
          <Column n="01" title="Productos" links={[
            { label: "Aceites sublinguales", href: "/productos?cat=aceite_cbd" },
            { label: "Flor medicinal", href: "/productos?cat=flores" },
            { label: "Cápsulas", href: "/productos?cat=capsulas" },
            { label: "Tópicos", href: "/productos?cat=topico" },
          ]} />
          <Column n="02" title="Atención" links={[
            { label: "Consulta médica online", href: "/consulta" },
            { label: "Validación de receta", href: "/mi-cuenta/recetas" },
            { label: "Seguimiento de pedidos", href: "/mi-cuenta/pedidos" },
            { label: "Trazabilidad de lotes", href: "/trazabilidad" },
          ]} />
          <Column n="03" title="Compliance" links={[
            { label: "Ley 20.850", href: "/compliance" },
            { label: "DS Nº 345/2016", href: "/compliance" },
            { label: "Política de privacidad (Ley 19.628)", href: "/privacidad" },
            { label: "Términos de uso", href: "/terminos" },
            { label: "Derechos del paciente", href: "/derechos-paciente" },
          ]} />
          <div className="col-span-2 lg:col-span-3">
            <p className="eyebrow text-paper/50 mb-3 flex items-baseline gap-3">
              <span className="editorial-numeral text-paper/40">04</span>
              <span>Contacto</span>
            </p>
            <ul className="space-y-2 text-sm font-mono nums-lining text-paper/80">
              <li>
                <a href="https://wa.me/56993177375" target="_blank" rel="noopener" className="hover:text-paper border-b border-transparent hover:border-paper/40 pb-0.5 transition-all">
                  +56 9 9317 7375
                </a>
              </li>
              <li>
                <a href="mailto:contacto@dispensariocultimed.cl" className="hover:text-paper border-b border-transparent hover:border-paper/40 pb-0.5 transition-all break-all">
                  contacto@dispensariocultimed.cl
                </a>
              </li>
              <li className="pt-2">Lun–Vie · 10:00–19:00</li>
              <li>Sáb · 10:00–14:00</li>
              <li className="pt-2 text-paper/60 text-[11px]">Envío 24–72h hábiles</li>
            </ul>
          </div>
        </div>

        <div className="hairline bg-paper/20 mb-12" />

        {/* Compliance / Legal microprint */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
          <div className="lg:col-span-7 max-w-3xl">
            <p className="eyebrow text-paper/50 mb-3">— Aviso legal</p>
            <p className="text-sm leading-relaxed text-paper/70 font-mono">
              Cultimed es un dispensario de cannabis medicinal autorizado en Chile.
              Los productos comercializados requieren prescripción médica vigente conforme
              a la Ley Nº 20.850 y el D.S. Nº 345/2016. Este sitio tiene fines exclusivamente
              informativos y no constituye asesoría médica. No automedicarse — consulte siempre
              a un profesional de salud habilitado. Los efectos terapéuticos pueden variar
              entre pacientes.
            </p>
          </div>
          <div className="lg:col-span-5">
            <p className="eyebrow text-paper/50 mb-3">— Certificaciones</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-mono uppercase tracking-widest text-paper/60">
              <span>· SANNA · autorizado</span>
              <span>· ISP · registrado</span>
              <span>· GMP · certificado</span>
              <span>· Ley 20.850</span>
              <span>· DS 345/2016</span>
              <span>· Ley 19.628</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between items-baseline flex-wrap gap-4 pt-8 border-t border-paper/20">
          <p className="text-xs font-mono tracking-widest text-paper/50 uppercase">
            © {year} Cultimed SpA · Todos los derechos reservados
          </p>
          <p className="text-xs font-mono tracking-widest text-paper/50 uppercase">
            Santiago de Chile
          </p>
        </div>
      </div>
    </footer>
  );
}

function Column({ n, title, links }: { n: string; title: string; links: { label: string; href: string }[] }) {
  return (
    <div className="col-span-2 lg:col-span-3">
      <p className="eyebrow text-paper/50 mb-3 flex items-baseline gap-3">
        <span className="editorial-numeral text-paper/40">{n}</span>
        <span>{title}</span>
      </p>
      <ul className="space-y-2 text-sm">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link
              href={l.href}
              className="text-paper/80 hover:text-paper border-b border-transparent hover:border-paper/40 pb-0.5 transition-all duration-300"
            >
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
