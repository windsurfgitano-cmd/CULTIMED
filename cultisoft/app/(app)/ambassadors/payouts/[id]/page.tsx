import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { formatCLP, formatDateTime } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { markPayoutPaid } from "@/lib/referrals";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface PayoutDetail {
  id: number;
  ambassador_account_id: number;
  ambassador_name: string | null;
  ambassador_email: string;
  period_start: string;
  period_end: string;
  total_amount: number;
  bank_reference: string | null;
  notes: string | null;
  status: string;
  paid_at: string | null;
  paid_by_name: string | null;
  created_at: string;
  bank_name: string | null;
  account_type: string | null;
  account_number: string | null;
  account_holder_name: string | null;
  account_holder_rut: string | null;
  contact_email: string | null;
}

interface CommissionRow {
  id: number;
  type: "first" | "historical";
  base_amount: number;
  amount: number;
  generated_at: string;
  order_folio: string;
  order_total: number;
  referred_email: string;
}

async function markPaidAction(formData: FormData) {
  "use server";
  const staff = await requireStaff();
  const id = Number(formData.get("id"));
  const bankReference = String(formData.get("bank_reference") || "").trim();
  const notes = String(formData.get("notes") || "").trim();
  if (!id) return;

  await markPayoutPaid({
    payoutId: id,
    staffId: staff.id,
    bankReference: bankReference || undefined,
    notes: notes || undefined,
  });

  await logAudit({
    staffId: staff.id,
    action: "ambassador_payout_paid",
    entityType: "referral_payout",
    entityId: id,
    details: { bank_reference: bankReference || null, notes: notes || null },
  });

  redirect(`/ambassadors/payouts/${id}`);
}

export default async function PayoutDetailPage({ params }: { params: { id: string } }) {
  await requireStaff();
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const p = await get<PayoutDetail>(
    `SELECT p.*, ca.full_name AS ambassador_name, ca.email AS ambassador_email,
       s.full_name AS paid_by_name,
       b.bank_name, b.account_type, b.account_number, b.account_holder_name, b.account_holder_rut, b.contact_email
     FROM referral_payouts p
     JOIN customer_accounts ca ON ca.id = p.ambassador_account_id
     LEFT JOIN staff s ON s.id = p.paid_by
     LEFT JOIN ambassador_bank_info b ON b.ambassador_account_id = p.ambassador_account_id
     WHERE p.id = ?`,
    id
  );
  if (!p) notFound();

  const commissions = await all<CommissionRow>(
    `SELECT c.id, c.type, c.base_amount, c.amount, c.generated_at,
       o.folio AS order_folio, o.total AS order_total,
       ca.email AS referred_email
     FROM referral_commissions c
     JOIN customer_orders o ON o.id = c.order_id
     JOIN customer_accounts ca ON ca.id = o.customer_account_id
     WHERE c.payout_id = ?
     ORDER BY c.generated_at`,
    id
  );

  return (
    <>
      <PageHeader
        numeral="09C"
        eyebrow={`Payout · ${p.status === "paid" ? "Pagado" : "Pendiente"}`}
        title={p.ambassador_name || p.ambassador_email}
        subtitle={`Comisiones agrupadas: ${commissions.length} · Total ${formatCLP(p.total_amount)}`}
        actions={
          <Link href="/ambassadors/payouts" className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass">
            ← Historial
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: comisiones */}
        <div className="lg:col-span-2 space-y-8">
          <div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="editorial-numeral text-base text-ink-subtle">— I</span>
              <span className="eyebrow">Comisiones agrupadas</span>
            </div>
            <div className="border border-rule bg-paper-bright overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule bg-paper-dim/40">
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Tipo</th>
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Pedido</th>
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Paciente referido</th>
                    <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Base neta</th>
                    <th className="text-right px-5 py-3 eyebrow text-ink-subtle">Comisión</th>
                    <th className="text-left px-5 py-3 eyebrow text-ink-subtle">Generada</th>
                  </tr>
                </thead>
                <tbody>
                  {commissions.map((c) => (
                    <tr key={c.id} className="border-b border-rule-soft">
                      <td className="px-5 py-4">
                        <span className={
                          "inline-block px-2 py-0.5 border text-[10px] font-mono uppercase tracking-widest " +
                          (c.type === "first" ? "border-brass text-brass-dim" : "border-rule text-ink-muted")
                        }>
                          {c.type === "first" ? "10% primera" : "1% histórica"}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-mono text-[11px]">{c.order_folio}</td>
                      <td className="px-5 py-4 font-mono text-[11px] text-ink-muted">{c.referred_email}</td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono text-[12px]">{formatCLP(c.base_amount)}</td>
                      <td className="px-5 py-4 text-right tabular-nums font-mono text-[13px] text-ink font-semibold">{formatCLP(c.amount)}</td>
                      <td className="px-5 py-4 text-[10px] font-mono text-ink-subtle">{formatDateTime(c.generated_at)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-rule bg-paper-dim/40">
                    <td colSpan={4} className="px-5 py-3 eyebrow text-right text-ink-subtle">Total payout</td>
                    <td className="px-5 py-3 text-right tabular-nums font-display text-2xl">{formatCLP(p.total_amount)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Acción de pago */}
          {p.status === "pending" && (
            <div>
              <div className="flex items-baseline gap-3 mb-4">
                <span className="editorial-numeral text-base text-ink-subtle">— II</span>
                <span className="eyebrow">Marcar como pagado</span>
              </div>
              <form action={markPaidAction} className="border border-rule bg-paper-bright p-5 space-y-4">
                <input type="hidden" name="id" value={p.id} />
                <p className="text-sm text-ink-muted">
                  Confirma que ya transferiste <strong>{formatCLP(p.total_amount)}</strong> a la cuenta del embajador.
                  Esto marca todas las comisiones agrupadas como "paid".
                </p>
                <div>
                  <label className="input-label">Referencia bancaria</label>
                  <input
                    name="bank_reference"
                    className="input-field nums-lining"
                    placeholder="Ej: TR-2026-04-001234"
                  />
                </div>
                <div>
                  <label className="input-label">Notas (opcional)</label>
                  <input
                    name="notes"
                    className="input-field"
                    placeholder="Comentario interno..."
                  />
                </div>
                <button type="submit" className="btn-primary">Marcar pagado</button>
              </form>
            </div>
          )}

          {p.status === "paid" && (
            <div className="border border-forest bg-forest/5 p-5">
              <p className="eyebrow text-forest mb-2">— Pagado</p>
              <p className="text-sm text-ink">
                Pagado el {formatDateTime(p.paid_at!)}{" "}
                {p.paid_by_name && <>por <strong>{p.paid_by_name}</strong></>}.
              </p>
              {p.bank_reference && (
                <p className="text-xs text-ink-muted font-mono mt-2">Referencia: {p.bank_reference}</p>
              )}
              {p.notes && (
                <p className="text-xs text-ink-muted mt-2">Notas: {p.notes}</p>
              )}
            </div>
          )}
        </div>

        {/* Right: datos bancarios */}
        <aside>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="editorial-numeral text-base text-ink-subtle">— III</span>
            <span className="eyebrow">Datos bancarios</span>
          </div>
          {p.bank_name ? (
            <div className="border border-rule bg-paper-bright p-5 space-y-3">
              <KV k="Banco" v={p.bank_name} />
              <KV k="Tipo cuenta" v={p.account_type || "—"} />
              <KV k="N° cuenta" v={p.account_number || "—"} mono />
              <KV k="Titular" v={p.account_holder_name || "—"} />
              <KV k="RUT titular" v={p.account_holder_rut || "—"} mono />
              <KV k="Email comprobante" v={p.contact_email || p.ambassador_email} mono />
            </div>
          ) : (
            <div className="border border-sangria bg-sangria/5 p-5">
              <p className="eyebrow text-sangria mb-2">— Falta información bancaria</p>
              <p className="text-sm text-ink-muted">
                El embajador no ha registrado sus datos bancarios todavía. Coordina con él/ella antes de transferir.
              </p>
            </div>
          )}
        </aside>
      </div>
    </>
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
