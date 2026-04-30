import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { formatCLP, formatDateTime, formatNumber } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import {
  getLeaderboard,
  createPayoutForAmbassador,
  MIN_PAYOUT_AMOUNT,
  MONTHLY_CAP_PER_AMBASSADOR,
} from "@/lib/referrals";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

interface PendingPayout {
  id: number;
  ambassador_account_id: number;
  ambassador_name: string | null;
  ambassador_email: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

async function createPayoutAction(formData: FormData) {
  "use server";
  const staff = requireStaff();
  const ambassadorId = Number(formData.get("ambassador_id"));
  if (!ambassadorId) return;

  const result = createPayoutForAmbassador(ambassadorId, staff.id);
  if (result) {
    logAudit({
      staffId: staff.id,
      action: "ambassador_payout_created",
      entityType: "customer_account",
      entityId: ambassadorId,
      details: { payout_id: result.id, total: result.total },
    });
    redirect(`/ambassadors?ok=created&total=${result.total}`);
  }
  redirect(`/ambassadors?e=below_min`);
}

export default function AmbassadorsAdminPage({
  searchParams,
}: {
  searchParams: { ok?: string; e?: string; total?: string };
}) {
  requireStaff();

  const board = getLeaderboard();
  const pendingPayouts = all<PendingPayout>(
    `SELECT p.id, p.ambassador_account_id, p.period_start, p.period_end, p.total_amount,
       p.status, p.paid_at, p.created_at,
       ca.full_name as ambassador_name, ca.email as ambassador_email
     FROM referral_payouts p
     JOIN customer_accounts ca ON ca.id = p.ambassador_account_id
     WHERE p.status = 'pending'
     ORDER BY p.created_at DESC`
  );

  const totals = get<{ pending: number; paid: number; voided: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0) as pending,
       COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END), 0) as paid,
       COALESCE(SUM(CASE WHEN status = 'voided' THEN amount END), 0) as voided
     FROM referral_commissions`
  ) || { pending: 0, paid: 0, voided: 0 };

  const conversions = get<{ total: number; converted: number; pending_count: number }>(
    `SELECT
       COUNT(*) as total,
       COUNT(CASE WHEN status = 'converted' THEN 1 END) as converted,
       COUNT(CASE WHEN status IN ('pending','active') THEN 1 END) as pending_count
     FROM referral_conversions`
  ) || { total: 0, converted: 0, pending_count: 0 };

  return (
    <>
      <PageHeader
        numeral="09"
        eyebrow="Programa de Embajadores"
        title="Embajadores"
        subtitle={`${formatNumber(board.length)} ${board.length === 1 ? "embajador activo" : "embajadores activos"} · ${formatNumber(conversions.total)} invitados totales · ${formatNumber(conversions.converted)} con primera compra confirmada.`}
        actions={
          <Link href="/ambassadors/payouts" className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass">
            Ver historial de payouts →
          </Link>
        }
      />

      {/* Confirmation banners */}
      {searchParams.ok === "created" && (
        <div className="mb-6 p-4 border-l-2 border-forest bg-forest/5">
          <p className="text-sm text-ink">
            Payout creado por <strong>{formatCLP(Number(searchParams.total) || 0)}</strong>. Procésalo en la sección "Payouts pendientes" abajo.
          </p>
        </div>
      )}
      {searchParams.e === "below_min" && (
        <div className="mb-6 p-4 border-l-2 border-sangria bg-sangria/5">
          <p className="text-sm text-ink">
            Saldo pendiente del embajador es menor al mínimo de {formatCLP(MIN_PAYOUT_AMOUNT)}. No se generó payout.
          </p>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <Stat label="Comisión pendiente" value={formatCLP(totals.pending)} sub="por pagar" tone="brass" />
        <Stat label="Comisión pagada" value={formatCLP(totals.paid)} sub="histórico" tone="forest" />
        <Stat label="Comisión anulada" value={formatCLP(totals.voided)} sub="por antifraude / cancelación" tone="sangria" />
        <Stat label="Conversiones activas" value={formatNumber(conversions.pending_count)} sub="esperando 1ra compra" tone="neutral" />
      </div>

      {/* Pending payouts */}
      <section className="mb-12">
        <div className="flex items-baseline gap-3 mb-4">
          <span className="editorial-numeral text-base text-ink-subtle">— I</span>
          <span className="eyebrow">Payouts pendientes de transferir</span>
        </div>

        {pendingPayouts.length === 0 ? (
          <EmptyState
            title="Sin payouts pendientes"
            message="Cuando un embajador acumule más de $20.000 en comisiones, podrás generar su payout y dejarlo pendiente de transferencia."
          />
        ) : (
          <div className="border border-rule bg-paper-bright overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule bg-paper-dim/40">
                  <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Embajador</th>
                  <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Período</th>
                  <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Monto</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {pendingPayouts.map((p) => (
                  <tr key={p.id} className="border-b border-rule-soft">
                    <td className="px-5 py-4">
                      <div className="font-display italic text-base text-ink">{p.ambassador_name}</div>
                      <div className="text-[11px] text-ink-subtle font-mono mt-0.5">{p.ambassador_email}</div>
                    </td>
                    <td className="px-5 py-4 text-[11px] font-mono text-ink-muted">
                      {formatDateTime(p.period_start)} → {formatDateTime(p.period_end)}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums font-mono text-[14px] text-ink">
                      {formatCLP(p.total_amount)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/ambassadors/payouts/${p.id}`}
                        className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass"
                      >
                        Procesar →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Leaderboard */}
      <section>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="editorial-numeral text-base text-ink-subtle">— II</span>
          <span className="eyebrow">Leaderboard · embajadores activos</span>
        </div>

        {board.length === 0 ? (
          <EmptyState
            title="Sin embajadores aún"
            message="Cualquier paciente con receta aprobada puede entrar a /mi-cuenta/embajador en el sitio público y obtener su enlace único. Aparecerán acá automáticamente al recibir su primera comisión."
          />
        ) : (
          <div className="border border-rule bg-paper-bright overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule bg-paper-dim/40">
                  <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Embajador</th>
                  <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Código</th>
                  <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Invitados</th>
                  <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Convertidos</th>
                  <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Mes</th>
                  <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Pendiente</th>
                  <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Pagado</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {board.map((row) => {
                  const overCap = row.this_month_commission > MONTHLY_CAP_PER_AMBASSADOR;
                  const canPayout = row.pending_commission >= MIN_PAYOUT_AMOUNT;
                  return (
                    <tr key={row.ambassador_account_id} className="border-b border-rule-soft hover:bg-paper-dim/30 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-baseline gap-2">
                          <Link
                            href={`/ambassadors/${row.ambassador_account_id}`}
                            className="font-display italic text-base text-ink hover:text-brass"
                          >
                            {row.ambassador_name}
                          </Link>
                          {!row.has_bank_info && (
                            <span title="Sin datos bancarios" className="text-[9px] uppercase tracking-widest font-mono text-sangria">
                              ⚠ sin banco
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-subtle font-mono mt-0.5">{row.ambassador_email}</div>
                      </td>
                      <td className="px-5 py-4 font-mono text-[12px] tracking-wider">{row.code}</td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono text-[12px]">{row.invited}</td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono text-[12px]">{row.converted}</td>
                      <td className={"px-5 py-4 text-right tabular-nums font-mono text-[12px] " + (overCap ? "text-sangria" : "text-ink-muted")}>
                        {formatCLP(row.this_month_commission)}
                        {overCap && <div className="text-[9px] uppercase tracking-widest">⚠ sobre cap</div>}
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono text-[12px] text-ink">
                        {formatCLP(row.pending_commission)}
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono text-[12px] text-ink-muted">
                        {formatCLP(row.paid_commission)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {canPayout && row.has_bank_info ? (
                          <form action={createPayoutAction}>
                            <input type="hidden" name="ambassador_id" value={row.ambassador_account_id} />
                            <button
                              type="submit"
                              className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass"
                              title={`Generar payout por ${formatCLP(row.pending_commission)}`}
                            >
                              Generar payout →
                            </button>
                          </form>
                        ) : (
                          <span className="text-[11px] text-ink-subtle font-mono">
                            {!row.has_bank_info ? "Sin banco" : `< ${formatCLP(MIN_PAYOUT_AMOUNT)}`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] font-mono text-ink-subtle mt-3">
          Cap mensual sugerido por embajador: {formatCLP(MONTHLY_CAP_PER_AMBASSADOR)}. Casos sobre el cap se marcan ⚠ — auditar antes de pagar.
        </p>
      </section>
    </>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "brass" | "forest" | "sangria" | "neutral" }) {
  const cls =
    tone === "brass"   ? "border-brass bg-brass/5 text-brass-dim"
    : tone === "forest"? "border-forest bg-forest/5 text-forest"
    : tone === "sangria"? "border-sangria bg-sangria/5 text-sangria"
    : "border-rule bg-paper-bright text-ink";
  return (
    <div className={"border p-5 " + cls}>
      <p className="eyebrow text-ink-subtle mb-2">— {label}</p>
      <p className="font-display text-3xl nums-lining tabular-nums">{value}</p>
      <p className="text-[11px] font-mono text-ink-muted mt-1">{sub}</p>
    </div>
  );
}
