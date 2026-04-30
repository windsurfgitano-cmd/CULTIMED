// Página pública del Programa de Embajadores Cultimed.
// Explica el programa, requisitos, cómo funciona, FAQ.

import Link from "next/link";
import { getCurrentCustomer } from "@/lib/auth";
import {
  FIRST_ORDER_RATE_BPS,
  HISTORICAL_RATE_BPS,
  REFERRED_DISCOUNT_BPS,
  RESIDUAL_WINDOW_DAYS,
  MIN_PAYOUT_AMOUNT,
} from "@/lib/referrals";
import { formatCLP } from "@/lib/format";

export const metadata = {
  title: "Programa de Embajadores · Cultimed",
  description:
    "Invita a otros pacientes a Cultimed con tu enlace único. Gana comisión por cada nueva dispensación.",
};

export default function AmbassadorsPublicPage() {
  const c = getCurrentCustomer();
  const ctaHref = !c
    ? "/registro?next=/mi-cuenta/embajador"
    : c.prescription_status === "aprobada"
    ? "/mi-cuenta/embajador"
    : "/mi-cuenta/recetas";
  const ctaLabel = !c
    ? "Crear cuenta para empezar"
    : c.prescription_status === "aprobada"
    ? "Ir a mi panel de embajador →"
    : "Cargar mi receta para activar";

  return (
    <>
      {/* Hero */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-16 lg:pt-28 pb-16 lg:pb-24">
        <div className="grid grid-cols-12 gap-x-6 items-end">
          <div className="col-span-12 lg:col-span-8">
            <span className="eyebrow mb-6 block">— Programa de Embajadores</span>
            <h1 className="font-display text-display-1 leading-[0.95] text-balance">
              <span className="font-light">Invita a tu</span>{" "}
              <span className="italic font-normal">comunidad.</span>{" "}
              <span className="font-light">Gana por cada paciente que llegue gracias a ti.</span>
            </h1>
            <p className="text-lg text-ink-muted mt-8 max-w-2xl leading-relaxed">
              El cannabis medicinal todavía vive con muchos mitos. Si tu tratamiento te cambió la
              vida y conoces a alguien que podría beneficiarse, te damos un enlace único — y te
              compensamos cuando esa persona empieza a dispensar.
            </p>
          </div>
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      {/* Cómo funciona */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24">
        <div className="flex items-baseline gap-6 mb-12">
          <span className="editorial-numeral text-2xl text-ink-subtle">— I</span>
          <span className="eyebrow">Cómo funciona</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-x-8 gap-y-12">
          <Step
            n="01"
            title="Activa tu cuenta"
            body="Regístrate, sube tu receta médica y espera que nuestro QF la valide. Solo pacientes con receta aprobada pueden ser embajadores."
          />
          <Step
            n="02"
            title="Recibe tu enlace + QR"
            body="En tu panel de embajador encontrarás un enlace único como dispensariocultimed.cl/r/XXXX y un QR descargable para imprimir."
          />
          <Step
            n="03"
            title="Comparte"
            body="WhatsApp, Instagram, en consulta médica, eventos. Cada persona que se registre con tu enlace queda asociada por 60 días."
          />
          <Step
            n="04"
            title="Gana comisión"
            body={`${FIRST_ORDER_RATE_BPS / 100}% de su primera dispensación pagada + ${HISTORICAL_RATE_BPS / 100}% de cada compra siguiente durante ${RESIDUAL_WINDOW_DAYS / 365} año. Te transferimos cuando superes ${formatCLP(MIN_PAYOUT_AMOUNT)}.`}
          />
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      {/* Números destacados */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-12 gap-y-12">
          <Highlight
            n={`${FIRST_ORDER_RATE_BPS / 100}%`}
            label="Primera compra"
            body="Comisión sobre el valor neto del primer pedido pagado del paciente que invites."
          />
          <Highlight
            n={`${HISTORICAL_RATE_BPS / 100}%`}
            label="Histórico 12 meses"
            body="Comisión sobre cada compra adicional de tu invitado durante un año desde su primera dispensación."
          />
          <Highlight
            n={`${REFERRED_DISCOUNT_BPS / 100}%`}
            label="Off al invitado"
            body="Tu invitado recibe descuento automático en su primera compra al ingresar con tu enlace."
          />
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      {/* CTA */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24">
        <div className="grid grid-cols-12 gap-x-6 items-end">
          <div className="col-span-12 lg:col-span-7">
            <h2 className="font-display text-display-2 leading-[0.98] text-balance">
              <span className="font-light">¿Listo para</span>{" "}
              <span className="italic font-normal">empezar?</span>
            </h2>
            <p className="text-base text-ink-muted mt-5 max-w-xl leading-relaxed">
              Si ya tienes cuenta y receta aprobada, tu enlace único está esperándote.
              Si recién partes, créate una cuenta y empieza el proceso.
            </p>
          </div>
          <div className="col-span-12 lg:col-span-4 lg:col-start-9 mt-6 lg:mt-0">
            <Link href={ctaHref} className="btn-brass w-full">{ctaLabel}</Link>
          </div>
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      {/* FAQ */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24">
        <div className="flex items-baseline gap-6 mb-12">
          <span className="editorial-numeral text-2xl text-ink-subtle">— II</span>
          <span className="eyebrow">Preguntas frecuentes</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-10 max-w-5xl">
          <FAQ
            q="¿Quién puede ser embajador?"
            a="Cualquier paciente con cuenta activa en Cultimed y receta médica aprobada por nuestro QF. No es necesario haber comprado todavía — basta con tener tu receta validada."
          />
          <FAQ
            q="¿Cómo se paga la comisión?"
            a={`Por transferencia bancaria a la cuenta que registres en tu panel. Pagamos los primeros 5 días hábiles de cada mes cuando tu saldo pendiente supera ${formatCLP(MIN_PAYOUT_AMOUNT)}.`}
          />
          <FAQ
            q="¿Cuánto recibe el invitado?"
            a={`${REFERRED_DISCOUNT_BPS / 100}% de descuento aplicado automáticamente en su primera compra al ingresar con tu enlace. La cookie dura 60 días desde el primer click.`}
          />
          <FAQ
            q="¿Puedo invitar a alguien que ya está en Cultimed?"
            a="No. El programa aplica solo para pacientes nuevos que se registran usando tu enlace. Cuentas existentes no quedan asociadas retroactivamente."
          />
          <FAQ
            q="¿Qué pasa si mi invitado devuelve un pedido?"
            a="La comisión queda firme una vez confirmado el pago del pedido. Devoluciones posteriores no descuentan tu comisión, salvo casos de fraude detectado por nuestro equipo."
          />
          <FAQ
            q="¿Hay tope de comisiones?"
            a="No hay tope absoluto. Cuando un embajador supera $300.000 mensuales, Cultimed audita la actividad antes del payout para descartar patrones sospechosos."
          />
          <FAQ
            q="¿Puedo ser embajador y a la vez haber sido invitado por otro?"
            a="Sí. Puedes generar tus propias comisiones aunque tú llegaste con el enlace de otra persona. No existen cadenas multinivel — solo una capa."
          />
          <FAQ
            q="¿Aparezco como recomendador del paciente?"
            a="No públicamente. Cultimed mantiene la trazabilidad interna por compliance, pero ni el invitado ni terceros conocen tu identidad. En tu panel ves emails enmascarados."
          />
          <FAQ
            q="¿Puede caducar mi link?"
            a={`No. Tu link es permanente mientras tu cuenta esté activa y tu receta vigente. Las comisiones históricas (1%) sí caducan ${RESIDUAL_WINDOW_DAYS / 365} año después de la primera compra del invitado.`}
          />
          <FAQ
            q="¿Y los datos del invitado?"
            a="Cultimed protege todos los datos clínicos bajo Ley 19.628. Como embajador no accedes a información médica del invitado — solo a métricas anonimizadas (estado de conversión, monto de primera compra, fecha)."
          />
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      {/* Disclaimer legal */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-12 lg:py-16">
        <p className="text-xs font-mono text-ink-subtle leading-relaxed max-w-3xl">
          Este programa NO es esquema piramidal ni multinivel. Cultimed compensa la recomendación
          única, no recluta vendedores. La comisión se calcula sobre el valor neto del pedido
          (excluyendo despacho, IVA y ajustes manuales). Cultimed se reserva el derecho de auditar
          actividad sospechosa y anular comisiones generadas por fraude o auto-referidos.
          La participación en este programa no genera relación laboral con Cultimed. Las comisiones
          recibidas constituyen ingresos del embajador y deben declararse según corresponda al SII.
        </p>
      </section>
    </>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div>
      <span className="editorial-numeral text-3xl text-brass-dim block mb-4">{n}</span>
      <h3 className="font-display text-2xl italic mb-3">{title}</h3>
      <p className="text-sm text-ink-muted leading-relaxed">{body}</p>
    </div>
  );
}

function Highlight({ n, label, body }: { n: string; label: string; body: string }) {
  return (
    <div className="border-l-2 border-brass pl-6 py-4">
      <p className="font-display text-display-2 nums-lining text-ink leading-none mb-2">{n}</p>
      <p className="eyebrow text-ink-subtle mb-3">— {label}</p>
      <p className="text-sm text-ink-muted leading-relaxed">{body}</p>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <h3 className="font-display text-xl italic mb-2 text-balance">{q}</h3>
      <p className="text-sm text-ink-muted leading-relaxed">{a}</p>
    </div>
  );
}
