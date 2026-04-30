import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { formatCLP, formatDate, formatDateTime, daysUntil } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

interface BatchFull {
  id: number; batch_number: string; quantity_initial: number; quantity_current: number;
  cost_per_unit: number | null; price_per_unit: number; manufacture_date: string | null;
  expiry_date: string | null; supplier: string | null; status: string; notes: string | null;
  coa_url: string | null; created_at: string;
  product_id: number; product_sku: string; product_name: string; category: string;
  presentation: string | null; thc_percentage: number | null; cbd_percentage: number | null;
  active_ingredient: string | null; concentration: string | null;
  is_controlled: number; requires_prescription: number;
}

interface Movement {
  id: number; movement_type: string; quantity: number; reason: string | null;
  reference_type: string | null; reference_id: number | null;
  staff_name: string | null; created_at: string;
}

async function adjust(formData: FormData) {
  "use server";
  const staff = await requireStaff();
  const id = Number(formData.get("id"));
  const delta = Number(formData.get("delta"));
  const reason = String(formData.get("reason") || "").trim() || "Ajuste manual";
  if (!id || !Number.isFinite(delta) || delta === 0) redirect(`/inventory/${id}`);

  await transaction(async (tx) => {
    const batch = await tx.get<{ quantity_current: number }>(`SELECT quantity_current FROM batches WHERE id = ?`, id);
    if (!batch) return;
    const newQty = batch.quantity_current + delta;
    if (newQty < 0) return;
    await tx.run(
      `UPDATE batches SET quantity_current = ?,
         status = CASE WHEN ? <= 0 THEN 'depleted' ELSE 'available' END
       WHERE id = ?`,
      newQty, newQty, id
    );
    await tx.run(
      `INSERT INTO inventory_movements (batch_id, movement_type, quantity, reference_type, staff_id, reason)
       VALUES (?, ?, ?, 'manual', ?, ?)`,
      id, delta > 0 ? "in" : "adjustment", delta, staff.id, reason
    );
  });
  await logAudit({
    staffId: staff.id, action: "inventory_adjusted",
    entityType: "batch", entityId: id, details: { delta, reason },
  });
  redirect(`/inventory/${id}`);
}

export default async function BatchDetailPage({ params }: { params: { id: string } }) {
  await requireStaff();
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const b = await get<BatchFull>(
    `SELECT b.*, pr.sku as product_sku, pr.name as product_name, pr.category, pr.presentation,
       pr.thc_percentage, pr.cbd_percentage, pr.active_ingredient, pr.concentration,
       pr.is_controlled, pr.requires_prescription
     FROM batches b JOIN products pr ON pr.id = b.product_id WHERE b.id = ?`,
    id
  );
  if (!b) notFound();

  const movements = await all<Movement>(
    `SELECT m.id, m.movement_type, m.quantity, m.reason, m.reference_type, m.reference_id,
       s.full_name as staff_name, m.created_at
     FROM inventory_movements m
     LEFT JOIN staff s ON s.id = m.staff_id
     WHERE m.batch_id = ?
     ORDER BY m.created_at DESC`,
    id
  );

  const days = daysUntil(b.expiry_date);
  const fillPct = b.quantity_initial > 0 ? Math.min(100, (b.quantity_current / b.quantity_initial) * 100) : 0;

  return (
    <>
      <PageHeader
        title={b.product_name}
        subtitle={`Lote ${b.batch_number}`}
        actions={
          <Link href="/inventory" className="btn-secondary">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Inventario
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 clinical-card p-6">
          <div className="flex justify-between items-start mb-5">
            <div>
              <h2 className="text-lg font-bold text-on-surface">{b.product_name}</h2>
              <p className="text-xs text-on-surface-variant mt-1 font-mono">SKU {b.product_sku}</p>
            </div>
            <StatusBadge status={b.status} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-5">
            <Stat label="Categoría" value={CATEGORY_LABELS[b.category] || b.category} />
            <Stat label="Presentación" value={b.presentation || "—"} />
            <Stat label="Principio activo" value={b.active_ingredient || "—"} />
            {b.thc_percentage !== null && <Stat label="THC" value={`${b.thc_percentage}%`} />}
            {b.cbd_percentage !== null && <Stat label="CBD" value={`${b.cbd_percentage}%`} />}
            <Stat label="Concentración" value={b.concentration || "—"} />
          </div>

          <div className="space-y-2">
            {b.is_controlled === 1 && (
              <div className="text-xs text-error flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">gpp_maybe</span>
                Producto controlado · receta retenida obligatoria
              </div>
            )}
            {b.requires_prescription === 1 && (
              <div className="text-xs text-on-surface-variant flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px]">prescription</span>
                Requiere receta médica
              </div>
            )}
          </div>
        </div>

        <div className="clinical-card p-6">
          <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">
            Stock del lote
          </h3>
          <p className="text-4xl font-light text-on-surface tabular-nums">
            {b.quantity_current}
            <span className="text-base text-on-surface-variant ml-2">/ {b.quantity_initial}</span>
          </p>
          <div className="mt-3 h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${fillPct}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Precio" value={formatCLP(b.price_per_unit)} />
            <Stat label="Costo" value={formatCLP(b.cost_per_unit)} />
            <Stat label="Fab." value={formatDate(b.manufacture_date)} />
            <Stat
              label="Vence"
              value={b.expiry_date ? `${formatDate(b.expiry_date)}${days !== null ? ` (${days >= 0 ? `${days}d` : `vencido`})` : ""}` : "—"}
              tone={days !== null && days < 0 ? "error" : days !== null && days <= 60 ? "warning" : "default"}
            />
          </div>
        </div>
      </div>

      {/* Adjust */}
      <div className="clinical-card p-6 mb-6">
        <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
          Ajustar stock
        </h3>
        <form action={adjust} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input type="hidden" name="id" value={b.id} />
          <div>
            <label className="input-label">Cantidad (+ ingreso, − salida)</label>
            <input type="number" name="delta" step="1" required className="input-field" placeholder="ej: -2 o +50" />
          </div>
          <div className="sm:col-span-2">
            <label className="input-label">Motivo</label>
            <input type="text" name="reason" className="input-field" placeholder="Ej: Inventario físico, Devolución, Reembarque" />
          </div>
          <div className="sm:col-span-3 flex justify-end">
            <button type="submit" className="btn-primary">
              <span className="material-symbols-outlined text-base">save</span>
              Aplicar ajuste
            </button>
          </div>
        </form>
      </div>

      {/* Movements */}
      <h3 className="text-base font-bold text-on-surface mb-3">Historial de movimientos</h3>
      {movements.length === 0 ? (
        <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
          Sin movimientos registrados.
        </div>
      ) : (
        <div className="clinical-card overflow-x-auto">
          <table className="table-clinical">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th className="text-right">Cantidad</th>
                <th>Motivo</th>
                <th>Operador</th>
                <th>Referencia</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td className="text-xs whitespace-nowrap text-on-surface-variant">{formatDateTime(m.created_at)}</td>
                  <td>
                    <span className={
                      m.movement_type === "in" ? "pill pill-success" :
                      m.movement_type === "out" ? "pill pill-neutral" :
                      m.movement_type === "adjustment" ? "pill pill-warning" :
                      "pill pill-tertiary"
                    }>{MOVEMENT_LABELS[m.movement_type] || m.movement_type}</span>
                  </td>
                  <td className={`text-right font-mono tabular-nums font-semibold ${m.quantity > 0 ? "text-success" : "text-on-surface"}`}>
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </td>
                  <td className="text-sm">{m.reason || "—"}</td>
                  <td className="text-xs text-on-surface-variant">{m.staff_name || "Sistema"}</td>
                  <td className="text-xs text-on-surface-variant">
                    {m.reference_type === "dispensation" && m.reference_id ? (
                      <Link href={`/dispensations/${m.reference_id}`} className="text-primary hover:underline">
                        Disp. #{m.reference_id}
                      </Link>
                    ) : m.reference_type || "—"}
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

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" | "error" }) {
  const cls = tone === "error" ? "text-error" : tone === "warning" ? "text-warning" : "text-on-surface";
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{label}</dt>
      <dd className={`text-sm font-medium mt-0.5 ${cls}`}>{value}</dd>
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  flores: "Flor de Cannabis",
  aceite_cbd: "Aceite CBD",
  capsulas: "Cápsulas",
  topico: "Tópico",
  farmaceutico: "Farmacéutico",
  otro: "Otro",
};
const MOVEMENT_LABELS: Record<string, string> = {
  in: "Ingreso",
  out: "Salida",
  adjustment: "Ajuste",
  return: "Devolución",
  recall: "Retiro",
};
