// CatalogGate: pantalla mostrada cuando un visitante anónimo o un usuario sin
// receta aprobada intenta acceder al catálogo. Compliance SANNA estricto.

import Link from "next/link";

export default function CatalogGate({
  status,
}: {
  status: "anonymous" | "none" | "pending" | "rechazada" | "expired";
}) {
  const meta: Record<typeof status, { eyebrow: string; titleA: string; titleI: string; titleC: string; body: string; cta: { label: string; href: string }; secondary?: { label: string; href: string } }> = {
    anonymous: {
      eyebrow: "Acceso restringido",
      titleA: "Nuestro",
      titleI: "catálogo",
      titleC: "es solo para pacientes registrados.",
      body: "Por norma SANNA y Ley 20.850, sólo dispensamos productos de cannabis medicinal a pacientes con receta médica vigente y validada por nuestro químico farmacéutico. Crea tu cuenta y carga tu receta para acceder.",
      cta: { label: "Crear cuenta", href: "/registro?next=/productos" },
      secondary: { label: "Ya tengo cuenta · Ingresar", href: "/ingresar?next=/productos" },
    },
    none: {
      eyebrow: "Receta pendiente",
      titleA: "Carga tu",
      titleI: "receta médica",
      titleC: "para ver nuestro catálogo.",
      body: "Aceptamos PDF, JPG o PNG. Una vez cargada, nuestro químico farmacéutico la revisa en 24 horas hábiles. Mientras tanto, no podemos mostrarte productos por norma sanitaria.",
      cta: { label: "Cargar receta médica", href: "/mi-cuenta/recetas" },
      secondary: { label: "Agendar consulta médica", href: "/consulta" },
    },
    pending: {
      eyebrow: "En revisión",
      titleA: "Tu receta",
      titleI: "está siendo",
      titleC: "validada por nuestro QF.",
      body: "Recibimos tu documento. Cuando esté validado podrás ver el catálogo, los precios y dispensar. Te avisaremos por email y WhatsApp en cuanto esté listo (24h hábiles).",
      cta: { label: "Ver detalle de mi receta", href: "/mi-cuenta/recetas" },
    },
    rechazada: {
      eyebrow: "Receta rechazada",
      titleA: "Necesitamos",
      titleI: "que cargues",
      titleC: "una nueva receta.",
      body: "La receta anterior no pudo ser validada. Carga una nueva o agenda una consulta con nuestros médicos para obtener una receta vigente.",
      cta: { label: "Cargar nueva receta", href: "/mi-cuenta/recetas" },
      secondary: { label: "Agendar consulta médica", href: "/consulta" },
    },
    expired: {
      eyebrow: "Receta vencida",
      titleA: "Tu receta",
      titleI: "vigente",
      titleC: "ya no está activa.",
      body: "Las recetas tienen 6 meses de vigencia. Carga una receta actualizada o agenda una consulta para renovarla.",
      cta: { label: "Cargar nueva receta", href: "/mi-cuenta/recetas" },
      secondary: { label: "Agendar consulta médica", href: "/consulta" },
    },
  };
  const m = meta[status];

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-32 min-h-[80vh]">
      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        {/* Left — Editorial copy */}
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— SANNA · Ley 20.850</span>
            <span className="eyebrow">{m.eyebrow}</span>
          </div>
          <h1 className="font-display text-display-1 leading-[0.95] mb-8 text-balance">
            <span className="font-light">{m.titleA}</span>{" "}
            <span className="italic font-normal">{m.titleI}</span>{" "}
            <span className="font-light">{m.titleC}</span>
          </h1>
          <p className="text-base leading-relaxed text-ink-muted mb-10 max-w-xl">
            {m.body}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 max-w-md">
            <Link href={m.cta.href} className="btn-brass flex-1 text-center">
              {m.cta.label}
            </Link>
            {m.secondary && (
              <Link href={m.secondary.href} className="btn-link justify-center">
                {m.secondary.label} →
              </Link>
            )}
          </div>
        </div>

        {/* Right — Compliance pillars */}
        <aside className="col-span-12 lg:col-span-4 lg:col-start-9 lg:sticky lg:top-32 self-start">
          <div className="border border-rule bg-paper-bright p-7 lg:p-8">
            <p className="eyebrow text-ink-subtle mb-5">— Por qué pedimos receta</p>
            <div className="space-y-5 text-sm leading-relaxed">
              <div>
                <p className="font-display italic text-base mb-1">SANNA · ISP</p>
                <p className="text-ink-muted">
                  Dispensario regulado bajo el Sistema Nacional de Farmacovigilancia y autorizado por el Instituto de Salud Pública.
                </p>
              </div>
              <div className="hairline" />
              <div>
                <p className="font-display italic text-base mb-1">Ley 20.850</p>
                <p className="text-ink-muted">
                  Toda comercialización de cannabis medicinal en Chile requiere receta médica vigente. No es una recomendación, es ley.
                </p>
              </div>
              <div className="hairline" />
              <div>
                <p className="font-display italic text-base mb-1">Ley 19.628</p>
                <p className="text-ink-muted">
                  Tus datos clínicos son sensibles. Solo nuestro QF de turno y tu médico tratante pueden verlos.
                </p>
              </div>
            </div>
          </div>
          <Link href="/compliance" className="block mt-6 text-sm text-ink-muted hover:text-ink underline-offset-4 hover:underline decoration-ink-muted/40">
            Conocer la normativa completa →
          </Link>
        </aside>
      </div>
    </section>
  );
}
