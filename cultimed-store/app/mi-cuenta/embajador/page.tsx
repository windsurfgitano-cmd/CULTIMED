// Dashboard de embajador — /mi-cuenta/embajador
// Solo accesible para pacientes con receta aprobada (D3).
// Genera/recupera código único, muestra link + QR, métricas, datos bancarios.

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { formatCLP, formatDateTime } from "@/lib/format";
import CopyButton from "./CopyButton";
import {
  getOrCreateReferralCode,
  getAmbassadorStats,
  getBankInfo,
  upsertBankInfo,
  REFERRED_DISCOUNT_BPS,
  FIRST_ORDER_RATE_BPS,
  HISTORICAL_RATE_BPS,
  RESIDUAL_WINDOW_DAYS,
  MIN_PAYOUT_AMOUNT,
  MONTHLY_CAP_PER_AMBASSADOR,
} from "@/lib/referrals";
import { isValidRut, formatRut, cleanRut } from "@/lib/rut";

export const dynamic = "force-dynamic";

const PUBLIC_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://dispensariocultimed.cl";

async function saveBankAction(formData: FormData) {
  "use server";
  const customer = await requireCustomer();
  if (customer.prescription_status !== "aprobada") return;

  const rutRaw = String(formData.get("account_holder_rut") || "").trim();
  if (rutRaw && !isValidRut(rutRaw)) {
    redirect("/mi-cuenta/embajador?bank_e=rut_invalid");
  }

  await upsertBankInfo({
    ambassador_account_id: customer.id,
    bank_name: String(formData.get("bank_name") || "").trim(),
    account_type: String(formData.get("account_type") || "corriente") as any,
    account_number: String(formData.get("account_number") || "").trim(),
    account_holder_name: String(formData.get("account_holder_name") || "").trim(),
    account_holder_rut: rutRaw ? formatRut(cleanRut(rutRaw)) : "",
    contact_email: String(formData.get("contact_email") || customer.email || "").trim() || null,
    updated_at: "",
  });

  redirect("/mi-cuenta/embajador?bank_ok=1");
}

export default async function AmbassadorDashboard({
  searchParams,
}: {
  searchParams: { bank_ok?: string; bank_e?: string };
}) {
  const customer = await requireCustomer();

  // Gate de acceso: solo recetas aprobadas pueden ser embajadores.
  if (customer.prescription_status !== "aprobada") {
    return <NoAccess status={customer.prescription_status} />;
  }

  const code = await getOrCreateReferralCode(customer.id);
  if (!code) return <NoAccess status="error" />;

  const stats = await getAmbassadorStats(customer.id);
  const bank = await getBankInfo(customer.id);
  const fullLink = `${PUBLIC_BASE}/r/${code.code}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=10&data=${encodeURIComponent(fullLink)}`;
  const qrUrlHighRes = `https://api.qrserver.com/v1/create-qr-code/?size=1024x1024&margin=20&data=${encodeURIComponent(fullLink)}`;

  return (
    <>
      {/* Hero */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 pt-12 lg:pt-20 pb-10">
        <div className="grid grid-cols-12 gap-x-6 items-end">
          <div className="col-span-12 lg:col-span-9">
            <span className="eyebrow mb-4 block">— Mi cuenta · Programa de Embajadores</span>
            <h1 className="font-display text-display-2 leading-[0.98] text-balance">
              <span className="font-light">Tu enlace</span>{" "}
              <span className="italic font-normal">único.</span>{" "}
              <span className="font-light">Tu comunidad.</span>
            </h1>
            <p className="text-base text-ink-muted mt-5 max-w-xl leading-relaxed">
              Cada paciente que se registra con tu enlace y completa su primera dispensación
              te genera <strong>{(FIRST_ORDER_RATE_BPS / 100)}%</strong> de comisión, más{" "}
              <strong>{(HISTORICAL_RATE_BPS / 100)}%</strong> de cada compra siguiente durante 12 meses.
              El paciente invitado parte con <strong>{REFERRED_DISCOUNT_BPS / 100}% off</strong> en su
              primera compra.
            </p>
          </div>
          <div className="col-span-12 lg:col-span-3 lg:pb-3">
            <Link href="/mi-cuenta" className="btn-link text-ink-muted">← Volver a mi cuenta</Link>
          </div>
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      {/* Bloque link + QR */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-14 lg:py-20 grid grid-cols-12 gap-x-6 gap-y-12">
        <div className="col-span-12 lg:col-span-7">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— I</span>
            <span className="eyebrow">Tu enlace de invitación</span>
          </div>

          <div className="border border-rule bg-paper-bright p-6 lg:p-8">
            <p className="eyebrow text-ink-subtle mb-2">— Código</p>
            <p className="font-display text-5xl tracking-wide nums-lining mb-6">{code.code}</p>

            <p className="eyebrow text-ink-subtle mb-2">— Enlace completo</p>
            <div className="mb-6">
              <CopyButton text={fullLink} />
            </div>

            <div className="space-y-3 text-xs font-mono text-ink-muted">
              <p>
                Comparte tu enlace en WhatsApp, Instagram, en persona. Cuando alguien se registre
                con él, queda asociado a tu cuenta por 60 días.
              </p>
              <p>
                Te pagamos por transferencia bancaria mensual cuando acumules al menos{" "}
                <strong>{formatCLP(MIN_PAYOUT_AMOUNT)}</strong> en comisiones pendientes.
              </p>
            </div>
          </div>

          {/* Plantillas de difusión */}
          <div className="mt-10">
            <p className="eyebrow text-ink-subtle mb-4">— Plantillas para invitar</p>
            <div className="space-y-3">
              <ShareTemplate
                title="WhatsApp"
                copy={`Hola 🌿 Te quería contar que estoy con Cultimed, dispensario chileno de cannabis medicinal con receta. Si te interesa, con mi enlace tienes 5% off en tu primera compra: ${fullLink}`}
              />
              <ShareTemplate
                title="Email a un paciente conocido"
                copy={`Asunto: Cultimed — me invitaron y te invito\n\nHola, te paso el enlace por si te sirve. Cultimed es un dispensario chileno regulado SANNA, atienden con receta y todo el catálogo se ve después de validar. Si entras con este enlace tienes 5% off en tu primera compra:\n\n${fullLink}\n\nCualquier duda me preguntas.`}
              />
              <ShareTemplate
                title="Bio Instagram / TikTok"
                copy={`Mi enlace Cultimed (5% off primera compra) → ${fullLink}`}
              />
            </div>
          </div>
        </div>

        {/* QR Card */}
        <aside className="col-span-12 lg:col-span-5 lg:col-start-8">
          <div className="lg:sticky lg:top-32">
            <div className="flex items-baseline gap-6 mb-6">
              <span className="editorial-numeral text-2xl text-ink-subtle">— II</span>
              <span className="eyebrow">QR para imprimir / compartir</span>
            </div>
            <div className="border border-rule bg-paper-bright p-7">
              <div className="aspect-square bg-paper-dim/40 mb-5 flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrUrl}
                  alt={`QR de invitación · código ${code.code}`}
                  width={420}
                  height={420}
                  className="w-full h-full object-contain"
                />
              </div>
              <a
                href={qrUrlHighRes}
                target="_blank"
                rel="noreferrer"
                download={`cultimed-qr-${code.code}.png`}
                className="btn-brass w-full"
              >
                Descargar QR alta resolución
              </a>
              <p className="text-[11px] font-mono text-ink-muted mt-4 leading-relaxed">
                Imprímelo y déjalo en consultas médicas, eventos, comunidad. Cada escaneo abre el
                registro en Cultimed con tu código activo.
              </p>
            </div>
          </div>
        </aside>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      {/* Stats */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-14 lg:py-20">
        <div className="flex items-baseline gap-6 mb-10">
          <span className="editorial-numeral text-2xl text-ink-subtle">— III</span>
          <span className="eyebrow">Tus métricas</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6">
          <Stat label="Invitados" value={stats.totalInvited.toString()} sub="cuentas con tu link" />
          <Stat label="Activos" value={stats.totalActive.toString()} sub="con receta aprobada" />
          <Stat label="Convertidos" value={stats.totalConverted.toString()} sub="con primera compra pagada" />
          <Stat label="Pendiente" value={formatCLP(stats.pendingAmount)} sub="por pagar" highlight />
          <Stat label="Pagado" value={formatCLP(stats.paidAmount)} sub="histórico" />
        </div>

        {/* Cap mensual warning */}
        {stats.monthCommissionAmount > MONTHLY_CAP_PER_AMBASSADOR && (
          <div className="mt-6 p-5 border-l-2 border-brass bg-brass/5">
            <p className="eyebrow text-brass-dim mb-1">— Aviso</p>
            <p className="text-sm text-ink">
              Este mes acumulaste <strong>{formatCLP(stats.monthCommissionAmount)}</strong> en
              comisiones, sobre el cap sugerido de <strong>{formatCLP(MONTHLY_CAP_PER_AMBASSADOR)}</strong>.
              Cultimed revisará tu actividad antes del payout.
            </p>
          </div>
        )}

        {/* Tabla de conversiones */}
        <div className="mt-10">
          <p className="eyebrow text-ink-subtle mb-4">— Tus invitados (anonimizado)</p>
          {stats.conversions.length === 0 ? (
            <div className="border border-rule bg-paper-bright p-12 text-center">
              <p className="font-display italic text-2xl text-ink-muted mb-2">Aún no tienes invitados.</p>
              <p className="text-sm text-ink-subtle">Comparte tu enlace y empieza a generar comisiones.</p>
            </div>
          ) : (
            <div className="border border-rule bg-paper-bright overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule bg-paper-dim/40">
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Paciente</th>
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Registrado</th>
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Estado</th>
                    <th className="text-right px-5 py-3 eyebrow text-ink-subtle">1ra compra</th>
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.conversions.map((c) => (
                    <tr key={c.id} className="border-b border-rule-soft">
                      <td className="px-5 py-4 font-mono text-[12px]">{c.referred_email_masked}</td>
                      <td className="px-5 py-4 text-[11px] text-ink-muted font-mono">
                        {formatDateTime(c.registered_at)}
                      </td>
                      <td className="px-5 py-4">
                        <ConvStatusPill status={c.status} />
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono text-[12px]">
                        {c.first_order_total ? formatCLP(c.first_order_total) : "—"}
                      </td>
                      <td className="px-5 py-4 text-[11px] font-mono text-ink-subtle">
                        {c.expires_at ? formatDateTime(c.expires_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[10px] font-mono text-ink-subtle mt-3">
            Los emails de tus invitados están enmascarados por privacidad. Cultimed mantiene la trazabilidad completa internamente.
          </p>
        </div>
      </section>

      <div className="hairline-thick max-w-[1440px] mx-auto" />

      {/* Datos bancarios */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-14 lg:py-20 grid grid-cols-12 gap-x-6 gap-y-10">
        <div className="col-span-12 lg:col-span-5">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— IV</span>
            <span className="eyebrow">Datos bancarios</span>
          </div>
          <p className="text-sm text-ink-muted leading-relaxed mb-6">
            Para pagarte tus comisiones por transferencia mensual necesitamos tus datos bancarios.
            Cultimed transfiere automáticamente cuando tu saldo pendiente supera{" "}
            <strong>{formatCLP(MIN_PAYOUT_AMOUNT)}</strong>.
          </p>
          <div className="space-y-2 text-[11px] font-mono text-ink-subtle">
            <p>· Datos protegidos bajo Ley 19.628.</p>
            <p>· Pagos los primeros 5 días hábiles de cada mes.</p>
            <p>· Recibirás comprobante por email tras cada transferencia.</p>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-7">
          {searchParams.bank_ok && (
            <div className="mb-6 p-5 border-l-2 border-forest bg-forest/5">
              <p className="text-sm text-ink">Datos bancarios actualizados ✓</p>
            </div>
          )}
          {searchParams.bank_e === "rut_invalid" && (
            <div className="mb-6 p-5 border-l-2 border-sangria bg-sangria/5">
              <p className="text-sm text-ink">RUT inválido. Verifica el dígito verificador.</p>
            </div>
          )}

          <form action={saveBankAction} className="border border-rule bg-paper-bright p-6 lg:p-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="bank_name" className="input-label">Banco *</label>
                <input
                  id="bank_name"
                  name="bank_name"
                  required
                  defaultValue={bank?.bank_name || ""}
                  className="input-editorial"
                  placeholder="BancoEstado, Santander..."
                />
              </div>
              <div>
                <label htmlFor="account_type" className="input-label">Tipo de cuenta *</label>
                <select
                  id="account_type"
                  name="account_type"
                  required
                  defaultValue={bank?.account_type || "corriente"}
                  className="input-editorial"
                >
                  <option value="corriente">Cuenta corriente</option>
                  <option value="vista">Cuenta vista</option>
                  <option value="rut">CuentaRUT</option>
                  <option value="ahorro">Cuenta ahorro</option>
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="account_number" className="input-label">N° de cuenta *</label>
              <input
                id="account_number"
                name="account_number"
                required
                defaultValue={bank?.account_number || ""}
                className="input-editorial nums-lining"
                placeholder="00012345678"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <label htmlFor="account_holder_name" className="input-label">Titular *</label>
                <input
                  id="account_holder_name"
                  name="account_holder_name"
                  required
                  defaultValue={bank?.account_holder_name || customer.full_name || ""}
                  className="input-editorial"
                  placeholder="Como aparece en la cartola"
                />
              </div>
              <div>
                <label htmlFor="account_holder_rut" className="input-label">RUT del titular *</label>
                <input
                  id="account_holder_rut"
                  name="account_holder_rut"
                  required
                  defaultValue={bank?.account_holder_rut || customer.rut || ""}
                  className="input-editorial nums-lining"
                  placeholder="12.345.678-9"
                />
              </div>
            </div>

            <div>
              <label htmlFor="contact_email" className="input-label">Email para comprobantes</label>
              <input
                id="contact_email"
                name="contact_email"
                type="email"
                defaultValue={bank?.contact_email || customer.email}
                className="input-editorial"
              />
            </div>

            <button type="submit" className="btn-brass w-full">
              {bank ? "Actualizar datos" : "Guardar datos bancarios"}
            </button>
          </form>
        </div>
      </section>

      {/* Reglas */}
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-14 lg:py-20 border-t border-rule-soft">
        <div className="flex items-baseline gap-6 mb-8">
          <span className="editorial-numeral text-2xl text-ink-subtle">— V</span>
          <span className="eyebrow">Reglas del programa</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-6 max-w-4xl">
          <Rule
            title="Comisión sobre primera compra"
            body={`${FIRST_ORDER_RATE_BPS / 100}% del valor neto del primer pedido pagado del invitado. Excluye despacho, IVA y ajustes manuales.`}
          />
          <Rule
            title="Comisión histórica"
            body={`${HISTORICAL_RATE_BPS / 100}% del valor neto de cada pedido posterior del invitado, durante ${RESIDUAL_WINDOW_DAYS} días desde su primera compra.`}
          />
          <Rule
            title="Descuento al invitado"
            body={`${REFERRED_DISCOUNT_BPS / 100}% off en la primera compra del invitado. Se aplica automáticamente al ingresar con tu enlace.`}
          />
          <Rule
            title="Pago al embajador"
            body={`Transferencia bancaria mensual cuando tu saldo pendiente supera ${formatCLP(MIN_PAYOUT_AMOUNT)}.`}
          />
          <Rule
            title="Cuándo se firma la comisión"
            body="Cuando el equipo Cultimed confirma el pago del pedido. Devoluciones posteriores no descuentan la comisión."
          />
          <Rule
            title="Antifraude"
            body="Sin auto-referidos, sin referidos cruzados, sin múltiples cuentas por persona. Cultimed audita actividad sospechosa y puede anular comisiones."
          />
        </div>
      </section>
    </>
  );
}

// ---- helpers UI ----------------------------------------------------------

function Stat({ label, value, sub, highlight = false }: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div className={"border p-5 " + (highlight ? "border-forest bg-forest/5" : "border-rule bg-paper-bright")}>
      <p className="eyebrow text-ink-subtle mb-2">— {label}</p>
      <p className={"font-display text-3xl nums-lining tabular-nums " + (highlight ? "text-forest" : "")}>{value}</p>
      <p className="text-[11px] font-mono text-ink-muted mt-1">{sub}</p>
    </div>
  );
}

function ConvStatusPill({ status }: { status: string }) {
  const META: Record<string, { label: string; cls: string }> = {
    pending:    { label: "Sin receta",    cls: "border-rule text-ink-muted" },
    active:     { label: "Receta OK",     cls: "border-brass text-brass-dim" },
    converted:  { label: "Convertido ✓",  cls: "border-forest text-forest" },
    expired:    { label: "Vencido",       cls: "border-rule text-ink-subtle" },
    cancelled:  { label: "Cancelado",     cls: "border-sangria text-sangria" },
  };
  const m = META[status] || META.pending;
  return (
    <span className={`inline-block px-2.5 py-1 border text-[10px] font-mono uppercase tracking-widest ${m.cls}`}>
      {m.label}
    </span>
  );
}

function ShareTemplate({ title, copy }: { title: string; copy: string }) {
  return (
    <details className="border border-rule bg-paper-bright">
      <summary className="px-5 py-3 cursor-pointer font-mono text-[11px] uppercase tracking-widest text-ink hover:bg-paper-dim/30 list-none flex items-center justify-between">
        <span>{title}</span>
        <span className="text-ink-subtle">Mostrar →</span>
      </summary>
      <div className="px-5 py-4 border-t border-rule-soft">
        <pre className="text-sm whitespace-pre-wrap font-sans text-ink leading-relaxed">{copy}</pre>
      </div>
    </details>
  );
}

function Rule({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="font-display text-xl italic mb-1">{title}</p>
      <p className="text-sm text-ink-muted leading-relaxed">{body}</p>
    </div>
  );
}

function NoAccess({ status }: { status: string }) {
  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-28">
      <div className="flex items-baseline gap-6 mb-6">
        <span className="editorial-numeral text-2xl text-ink-subtle">— Acceso pendiente</span>
      </div>
      <h1 className="font-display text-display-2 leading-[0.98] text-balance mb-6">
        <span className="font-light">El programa de</span>{" "}
        <span className="italic font-normal">embajadores</span>{" "}
        <span className="font-light">requiere receta aprobada.</span>
      </h1>
      <p className="text-base text-ink-muted leading-relaxed max-w-xl mb-8">
        {status === "none"
          ? "Aún no has cargado tu receta. Súbela y nuestro QF la valida en 24h hábiles. Después podrás invitar y ganar comisiones."
          : status === "pending"
          ? "Tu receta está en revisión. Te avisamos por WhatsApp y email cuando esté lista."
          : "Tu receta no está vigente. Carga una nueva o agenda una consulta para volver a habilitar el programa."}
      </p>
      <div className="flex gap-4">
        <Link href="/mi-cuenta/recetas" className="btn-brass">Cargar receta</Link>
        <Link href="/mi-cuenta" className="btn-link">← Volver</Link>
      </div>
    </section>
  );
}
