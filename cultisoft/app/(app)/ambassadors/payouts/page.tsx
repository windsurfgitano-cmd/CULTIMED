import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatCLP, formatDateTime, formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

interface PayoutRow {
  id: number;
  ambassador_account_id: number;
  ambassador_name: string | null;
  ambassador_email: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  bank_reference: string | null;
  status: string;
  paid_at: string | null;
  paid_by_name: string | null;
  created_at: string;
  commission_count: number;
}

export default function PayoutsHistoryPage() {
  requireStaff();

  const payouts = all<PayoutRow>(
    `SELECT p.*, ca.full_name AS ambassador_name, ca.email AS ambassador_email,
       s.full_name AS paid_by_name,
       (SELECT COUNT(*) FROM referral_commissions WHERE payout_id = p.id) AS commission_count
     FROM referral_payouts p
     JOIN customer_accounts ca ON ca.id = p.ambassador_account_id
     LEFT JOIN staff s ON s.id = p.paid_by
     ORDER BY p.created_at DESC`
  );

  return (
    <>
      <PageHeader
        numeral="09B"
        eyebrow="Programa de Embajadores"
        title="Historial de payouts"
        subtitle={`${formatNumber(payouts.length)} ${payouts.length === 1 ? "payout" : "payouts"} en total.`}
        actions={
          <Link href="/ambassadors" className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass">
            ← Volver
          </Link>
        }
      />

      {payouts.length === 0 ? (
        <EmptyState title="Sin payouts" message="Genera el primer payout desde la lista de embajadores activos." />
      ) : (
        <div className="border border-rule bg-paper-bright overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule bg-paper-dim/40">
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Embajador</th>
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Período</th>
                <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Items</th>
                <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Total</th>
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Estado</th>
                <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Pagado</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-b border-rule-soft">
                  <td className="px-5 py-4">
                    <div className="font-display italic text-base">{p.ambassador_name}</div>
                    <div className="text-[11px] text-ink-subtle font-mono">{p.ambassador_email}</div>
                  </td>
                  <td className="px-5 py-4 text-[11px] font-mono text-ink-muted">
                    {formatDateTime(p.period_start)}
                    <div>→ {formatDateTime(p.period_end)}</div>
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums font-mono text-[12px]">{p.commission_count}</td>
                  <td className="px-5 py-4 text-right tabular-nums font-mono text-[13px] text-ink">
                    {formatCLP(p.total_amount)}
                  </td>
                  <td className="px-5 py-4">
                    <span
                      className={
                        "inline-block px-2.5 py-1 border text-[10px] font-mono uppercase tracking-widest " +
                        (p.status === "paid"
                          ? "border-forest text-forest"
                          : p.status === "failed"
                          ? "border-sangria text-sangria"
                          : "border-brass text-brass-dim")
                      }
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-[11px] text-ink-muted font-mono">
                    {p.paid_at ? (
                      <>
                        {formatDateTime(p.paid_at)}
                        {p.paid_by_name && <div className="text-ink-subtle">por {p.paid_by_name}</div>}
                        {p.bank_reference && <div className="text-ink-subtle">ref: {p.bank_reference}</div>}
                      </>
                    ) : (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/ambassadors/payouts/${p.id}`}
                      className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass"
                    >
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
