import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatCLP, formatDate, formatDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

interface OrderRow {
  id: number; folio: string; status: string; total: number; created_at: string;
  item_count: number;
}

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  pending_payment:    { label: "Pago pendiente",      tone: "brass" },
  proof_uploaded:     { label: "Verificando pago",    tone: "brass" },
  payment_confirmed:  { label: "Pago confirmado",     tone: "forest" },
  preparing:          { label: "En preparación",      tone: "forest" },
  shipped:            { label: "Despachado",          tone: "forest" },
  delivered:          { label: "Entregado",           tone: "forest" },
  cancelled:          { label: "Cancelado",           tone: "sangria" },
};

const RX_STATUS: Record<string, { label: string; tone: string }> = {
  none:      { label: "Sin receta cargada",      tone: "sangria" },
  pending:   { label: "En revisión por QF",      tone: "brass" },
  aprobada:  { label: "Receta aprobada",         tone: "forest" },
  rechazada: { label: "Receta rechazada",        tone: "sangria" },
  expired:   { label: "Receta vencida",          tone: "sangria" },
};

export default async function AccountPage() {
  const customer = await requireCustomer();

  const orders = await all<OrderRow>(
    `SELECT o.id, o.folio, o.status, o.total, o.created_at,
       (SELECT COUNT(*) FROM customer_order_items i WHERE i.order_id = o.id) as item_count
     FROM customer_orders o
     WHERE customer_account_id = ?
     ORDER BY o.created_at DESC LIMIT 20`,
    customer.id
  );

  const rx = RX_STATUS[customer.prescription_status] || RX_STATUS.none;
  const firstName = customer.full_name?.split(" ")[0] || customer.email.split("@")[0];

  return (
    <>
      {/* Hero band */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12 lg:pt-20 pb-12">
        <div className="grid grid-cols-12 gap-x-6 items-end">
          <div className="col-span-12 lg:col-span-9">
            <span className="eyebrow mb-4 block">— Mi cuenta · {customer.email}</span>
            <h1 className="font-display text-display-2 leading-[0.98] text-balance">
              <span className="font-light">Hola,</span>{" "}
              <span className="italic font-normal">{firstName}</span>
              <span className="font-light">.</span>
            </h1>
          </div>
          <div className="col-span-12 lg:col-span-3 lg:pb-3 flex flex-col gap-2">
            <Link href="/mi-cuenta/cambiar-contrasena" className="btn-link text-ink-muted">
              Cambiar contraseña →
            </Link>
            <form action="/api/auth/logout" method="POST">
              <button type="submit" className="btn-link text-ink-muted">Cerrar sesión →</button>
            </form>
          </div>
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      {/* Banner Embajador — solo para invitados (is_ambassador=1), independiente del estado de receta */}
      {customer.is_ambassador === 1 && (
        <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12">
          <div className="border border-brass bg-brass/5 p-6 lg:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="flex-1">
              <p className="eyebrow text-brass-dim mb-2">— Programa de embajadores · Activo</p>
              <h3 className="font-display text-2xl leading-tight text-balance">
                <span className="font-light">Eres</span>{" "}
                <span className="italic font-normal">embajador</span>{" "}
                <span className="font-light">de Cultimed.</span>
              </h3>
              <p className="text-sm text-ink-muted mt-2">
                Tu código personal y dashboard de comisiones están listos.
              </p>
            </div>
            <Link href="/mi-cuenta/embajador" className="btn-brass shrink-0">
              Ir a mi panel →
            </Link>
          </div>
        </section>
      )}

      {/* Two columns */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24 grid grid-cols-12 gap-x-6 gap-y-16">
        {/* LEFT — Receta status */}
        <aside className="col-span-12 lg:col-span-5 lg:sticky lg:top-32 self-start">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— I</span>
            <span className="eyebrow">Estado de receta</span>
          </div>

          <div className={
            "p-7 lg:p-8 border " +
            (rx.tone === "forest" ? "border-forest bg-forest/5"
             : rx.tone === "brass" ? "border-brass bg-brass/5"
             : "border-sangria bg-sangria/5")
          }>
            <p className={
              "eyebrow mb-3 " +
              (rx.tone === "forest" ? "text-forest"
               : rx.tone === "brass" ? "text-brass-dim"
               : "text-sangria")
            }>— {rx.label}</p>

            {customer.prescription_status === "none" && (
              <>
                <h2 className="font-display text-3xl leading-tight mb-4 text-balance">
                  <span className="font-light">Carga tu</span>{" "}
                  <span className="italic font-normal">receta médica</span>{" "}
                  <span className="font-light">para activar tu cuenta.</span>
                </h2>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                  Para ver precios, comprar y recibir productos requerimos validar tu receta.
                  Acepta PDF, JPG o PNG. Una vez subida, nuestro químico farmacéutico la
                  revisa en menos de 24 horas hábiles.
                </p>
                <Link href="/mi-cuenta/recetas" className="btn-brass w-full">
                  Cargar receta médica
                </Link>
              </>
            )}

            {customer.prescription_status === "pending" && (
              <>
                <h2 className="font-display text-3xl leading-tight mb-4 text-balance">
                  <span className="font-light">Revisando tu</span>{" "}
                  <span className="italic font-normal">receta médica.</span>
                </h2>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                  Recibimos tu documento. Nuestro QF la está validando. Te avisaremos
                  por email y WhatsApp cuando esté lista.
                </p>
                <Link href="/mi-cuenta/recetas" className="btn-link">Ver detalle →</Link>
              </>
            )}

            {customer.prescription_status === "aprobada" && (
              <>
                <h2 className="font-display text-3xl leading-tight mb-4 text-balance">
                  <span className="font-light">Tu receta está</span>{" "}
                  <span className="italic font-normal">aprobada.</span>
                </h2>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                  Tienes acceso completo al catálogo, precios y disponibilidad. Puedes
                  hacer pedidos cuando quieras.
                </p>
                <Link href="/productos" className="btn-brass w-full">Explorar catálogo →</Link>
                {/* Panel embajador: visible en banner superior si is_ambassador=1 */}
              </>
            )}

            {(customer.prescription_status === "rechazada" || customer.prescription_status === "expired") && (
              <>
                <h2 className="font-display text-3xl leading-tight mb-4 text-balance">
                  {customer.prescription_status === "expired" ? (
                    <><span className="font-light">Tu receta</span> <span className="italic font-normal">venció</span><span className="font-light">.</span></>
                  ) : (
                    <><span className="font-light">Tu receta fue</span> <span className="italic font-normal">rechazada</span><span className="font-light">.</span></>
                  )}
                </h2>
                <p className="text-sm text-ink-muted leading-relaxed mb-6">
                  Para seguir comprando carga una receta vigente o agenda una consulta
                  con nuestros médicos.
                </p>
                <div className="flex flex-col gap-3">
                  <Link href="/mi-cuenta/recetas" className="btn-brass w-full">Cargar nueva receta</Link>
                  <Link href="/consulta" className="btn-link justify-center">Agendar consulta médica →</Link>
                </div>
              </>
            )}
          </div>

          <div className="mt-8 space-y-1 text-xs font-mono text-ink-muted">
            <div className="flex justify-between border-b border-rule-soft pb-2">
              <span>Cuenta creada</span>
              <span className="text-ink">{formatDate(customer.age_gate_accepted_at)}</span>
            </div>
            <div className="flex justify-between border-b border-rule-soft pb-2 pt-2">
              <span>RUT</span>
              <span className="text-ink nums-lining">{customer.rut || "—"}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span>Teléfono</span>
              <span className="text-ink nums-lining">{customer.phone || "—"}</span>
            </div>
          </div>
        </aside>

        {/* RIGHT — Orders */}
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— II</span>
            <span className="eyebrow">Mis pedidos</span>
          </div>

          {orders.length === 0 ? (
            <div className="p-12 lg:p-16 border border-rule bg-paper-bright text-center">
              <p className="font-display text-3xl italic text-ink-muted mb-4">
                Aún no has dispensado.
              </p>
              <p className="text-sm text-ink-muted mb-8 max-w-sm mx-auto">
                Cuando hagas tu primer pedido aparecerá aquí, junto con su trazabilidad y
                comprobantes.
              </p>
              <Link href="/productos" className="btn-link">Explorar catálogo →</Link>
            </div>
          ) : (
            <ul className="divide-y divide-rule border-y border-rule">
              {orders.map((o) => {
                const status = STATUS_LABEL[o.status] || { label: o.status, tone: "neutral" };
                const toneClass =
                  status.tone === "forest" ? "text-forest border-forest"
                  : status.tone === "brass" ? "text-brass-dim border-brass"
                  : status.tone === "sangria" ? "text-sangria border-sangria"
                  : "text-ink-muted border-rule";
                return (
                  <li key={o.id}>
                    <Link
                      href={`/mi-cuenta/pedidos/${o.id}`}
                      className="grid grid-cols-12 gap-4 py-6 lg:py-8 group hover:bg-paper-bright/40 transition-colors px-2 -mx-2"
                    >
                      <div className="col-span-12 sm:col-span-3">
                        <p className="font-mono text-xs uppercase tracking-widest text-ink-subtle nums-lining">{o.folio}</p>
                        <p className="text-xs text-ink-muted mt-1">{formatDateTime(o.created_at)}</p>
                      </div>
                      <div className="col-span-7 sm:col-span-4">
                        <p className="font-display text-xl group-hover:italic transition-all">
                          {o.item_count} producto{o.item_count !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="col-span-5 sm:col-span-3">
                        <span className={`pill-editorial ${toneClass}`}>{status.label}</span>
                      </div>
                      <div className="col-span-12 sm:col-span-2 sm:text-right">
                        <p className="font-mono text-base nums-lining tabular-nums">{formatCLP(o.total)}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
