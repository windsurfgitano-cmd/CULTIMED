import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { formatCLP, formatDateTime } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { cancelConversion, MIN_PAYOUT_AMOUNT } from "@/lib/referrals";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface AmbassadorDetail {
  ambassador_account_id: number;
  full_name: string | null;
  email: string;
  rut: string | null;
  phone: string | null;
  prescription_status: string;
  code: string;
  bank_name: string | null;
  account_type: string | null;
  account_number: string | null;
  account_holder_name: string | null;
  account_holder_rut: string | null;
  contact_email: string | null;
  bank_updated_at: string | null;
  total_pending: number;
  total_paid: number;
  total_voided: number;
}

interface ConvDetail {
  id: number;
  referred_account_id: number;
  referred_email: string;
  referred_name: string | null;
  registered_at: string;
  prescription_approved_at: string | null;
  first_order_id: number | null;
  first_order_paid_at: string | null;
  expires_at: string | null;
  status: string;
  cancelled_reason: string | null;
  total_commission: number;
  order_count: number;
}

async function cancelConvAction(formData: FormData) {
  "use server";
  const staff = requireStaff();
  const id = Number(formData.get("conv_id"));
  const ambId = Number(formData.get("amb_id"));
  const reason = String(formData.get("reason") || "Cancelado por administrador").trim();
  if (!id) return;
  cancelConversion(id, reason);
  logAudit({
    staffId: staff.id,
    action: "ambassador_conversion_cancelled",
    entityType: "referral_conversion",
    entityId: id,
    details: { reason },
  });
  redirect(`/ambassadors/${ambId}`);
}

export default function AmbassadorDetailPage({ params }: { params: { id: string } }) {
  requireStaff();
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const a = get<AmbassadorDetail>(
    `SELECT
       rc.ambassador_account_id, ca.full_name, ca.email, ca.rut, ca.phone, ca.prescription_status,
       rc.code,
       b.bank_name, b.account_type, b.account_number, b.account_holder_name, b.account_holder_rut,
       b.contact_email, b.updated_at AS bank_updated_at,
       (SELECT COALESCE(SUM(amount),0) FROM referral_commissions
         WHERE ambassador_account_id = rc.ambassador_account_id AND status = 'pending') AS total_pending,
       (SELECT COALESCE(SUM(amount),0) FROM referral_commissions
         WHERE ambassador_account_id = rc.ambassador_account_id AND status = 'paid') AS total_paid,
       (SELECT COALESCE(SUM(amount),0) FROM referral_commissions
         WHERE ambassador_account_id = rc.ambassador_account_id AND status = 'voided') AS total_voided
     FROM referral_codes rc
     JOIN customer_accounts ca ON ca.id = rc.ambassador_account_id
     LEFT JOIN ambassador_bank_info b ON b.ambassador_account_id = rc.ambassador_account_id
     WHERE rc.ambassador_account_id = ?`,
    id
  );
  if (!a) notFound();

  const conversions = all<ConvDetail>(
    `SELECT rc.id, rc.referred_account_id, rc.registered_at, rc.prescription_approved_at,
       rc.first_order_id, rc.first_order_paid_at, rc.expires_at, rc.status, rc.cancelled_reason,
       ca.email AS referred_email, ca.full_name AS referred_name,
       (SELECT COALESCE(SUM(amount),0) FROM referral_commissions WHERE conversion_id = rc.id) AS total_commission,
       (SELECT COUNT(*) FROM referral_commissions WHERE conversion_id = rc.id) AS order_count
     FROM referral_conversions rc
     JOIN customer_accounts ca ON ca.id = rc.referred_account_id
     WHERE rc.ambassador_account_id = ?
     ORDER BY rc.registered_at DESC`,
    id
  );

  return (
    <>
      <PageHeader
        numeral="09D"
        eyebrow={`Embajador · ${a.code}`}
        title={a.full_name || a.email}
        subtitle={`${a.email} · receta ${a.prescription_status}`}
        actions={
          <Link href="/ambassadors" className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass">
            ← Embajadores
          </Link>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Stat label="Pendiente" value={formatCLP(a.total_pending)} sub={a.total_pending >= MIN_PAYOUT_AMOUNT ? "elegible payout" : `< ${formatCLP(MIN_PAYOUT_AMOUNT)}`} tone="brass" />
        <Stat label="Pagado" value={formatCLP(a.total_paid)} sub="histórico" tone="forest" />
        <Stat label="Anulado" value={formatCLP(a.total_voided)} sub="por antifraude / cancelación" tone="sangria" />
        <Stat label="Conversiones" value={conversions.length.toString()} sub="invitaciones totales" tone="neutral" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Conversions */}
        <div className="lg:col-span-2">
          <div className="flex items-baseline gap-3 mb-4">
            <span className="editorial-numeral text-base text-ink-subtle">— I</span>
            <span className="eyebrow">Pacientes invitados</span>
          </div>
          {conversions.length === 0 ? (
            <div className="border border-rule bg-paper-bright p-12 text-center">
              <p className="font-display italic text-2xl text-ink-muted">Aún sin invitados.</p>
            </div>
          ) : (
            <div className="border border-rule bg-paper-bright overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule bg-paper-dim/40">
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Paciente</th>
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Estado</th>
                    <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Pedidos</th>
                    <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Comisión</th>
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Vence</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {conversions.map((c) => (
                    <tr key={c.id} className="border-b border-rule-soft">
                      <td className="px-5 py-4">
                        <div className="font-display italic text-base text-ink">{c.referred_name || "—"}</div>
                        <div className="text-[11px] text-ink-subtle font-mono mt-0.5">{c.referred_email}</div>
                        {c.cancelled_reason && (
                          <div className="text-[10px] text-sangria mt-1">⚠ {c.cancelled_reason}</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <ConvStatusPill status={c.status} />
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono text-[12px]">{c.order_count}</td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono text-[12px] text-ink">
                        {formatCLP(c.total_commission)}
                      </td>
                      <td className="px-5 py-4 text-[11px] font-mono text-ink-subtle">
                        {c.expires_at ? formatDateTime(c.expires_at) : "—"}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {c.status !== "cancelled" && c.status !== "expired" && (
                          <form action={cancelConvAction}>
                            <input type="hidden" name="conv_id" value={c.id} />
                            <input type="hidden" name="amb_id" value={id} />
                            <input type="hidden" name="reason" value="Cancelado por antifraude" />
                            <button
                              type="submit"
                              className="font-mono text-[10px] uppercase tracking-widest text-ink-subtle hover:text-sangria"
                            >
                              Anular
                            </button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: datos */}
        <aside className="space-y-8">
          <div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="editorial-numeral text-base text-ink-subtle">— II</span>
              <span className="eyebrow">Datos del embajador</span>
            </div>
            <div className="border border-rule bg-paper-bright p-5 space-y-3">
              <KV k="Nombre" v={a.full_name || "—"} />
              <KV k="Email" v={a.email} mono />
              <KV k="RUT" v={a.rut || "—"} mono />
              <KV k="Teléfono" v={a.phone || "—"} mono />
              <KV k="Código" v={a.code} mono />
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="editorial-numeral text-base text-ink-subtle">— III</span>
              <span className="eyebrow">Datos bancarios</span>
            </div>
            {a.bank_name ? (
              <div className="border border-rule bg-paper-bright p-5 space-y-3">
                <KV k="Banco" v={a.bank_name} />
                <KV k="Tipo" v={a.account_type || "—"} />
                <KV k="N° cuenta" v={a.account_number || "—"} mono />
                <KV k="Titular" v={a.account_holder_name || "—"} />
                <KV k="RUT titular" v={a.account_holder_rut || "—"} mono />
                <KV k="Email" v={a.contact_email || a.email} mono />
                {a.bank_updated_at && (
                  <p className="text-[10px] text-ink-subtle font-mono pt-2 border-t border-rule-soft">
                    Actualizado {formatDateTime(a.bank_updated_at)}
                  </p>
                )}
              </div>
            ) : (
              <div className="border border-sangria bg-sangria/5 p-5">
                <p className="eyebrow text-sangria mb-1">— Sin datos bancarios</p>
                <p className="text-sm text-ink-muted">El embajador no ha registrado cuenta. No se puede generar payout.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "brass" | "forest" | "sangria" | "neutral" }) {
  const cls =
    tone === "brass"   ? "border-brass bg-brass/5"
    : tone === "forest"? "border-forest bg-forest/5"
    : tone === "sangria"? "border-sangria bg-sangria/5"
    : "border-rule bg-paper-bright";
  return (
    <div className={"border p-5 " + cls}>
      <p className="eyebrow text-ink-subtle mb-2">— {label}</p>
      <p className="font-display text-3xl nums-lining tabular-nums">{value}</p>
      <p className="text-[11px] font-mono text-ink-muted mt-1">{sub}</p>
    </div>
  );
}

function ConvStatusPill({ status }: { status: string }) {
  const META: Record<string, { label: string; cls: string }> = {
    pending:    { label: "Sin receta",   cls: "border-rule text-ink-muted" },
    active:     { label: "Receta OK",    cls: "border-brass text-brass-dim" },
    converted:  { label: "Convertido ✓", cls: "border-forest text-forest" },
    expired:    { label: "Vencido",      cls: "border-rule text-ink-subtle" },
    cancelled:  { label: "Cancelado",    cls: "border-sangria text-sangria" },
  };
  const m = META[status] || META.pending;
  return (
    <span className={`inline-block px-2.5 py-1 border text-[10px] font-mono uppercase tracking-widest ${m.cls}`}>
      {m.label}
    </span>
  );
}

function KV({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="eyebrow text-ink-subtle">{k}</dt>
      <dd className={"mt-0.5 text-sm text-ink " + (mono ? "font-mono break-all" : "")}>{v}</dd>
    </div>
  );
}
