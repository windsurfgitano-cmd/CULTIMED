import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { formatCLP, formatDateTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import PrintButton from "@/components/PrintButton";

export const dynamic = "force-dynamic";

interface DispFull {
  id: number; folio: string; total_amount: number; payment_method: string | null;
  payment_status: string; status: string; notes: string | null; dispensed_at: string;
  patient_id: number; patient_name: string; patient_rut: string;
  prescription_id: number | null; prescription_folio: string | null;
  prescription_diagnosis: string | null;
  doctor_name: string | null;
  dispenser_name: string;
}

interface DispItem {
  id: number; quantity: number; price_per_unit: number; total_price: number;
  product_name: string; product_sku: string; presentation: string | null;
  batch_number: string; batch_id: number;
  is_controlled: number;
}

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

export default async function DispensationDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { success?: string };
}) {
  await requireStaff();
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const d = await get<DispFull>(
    `SELECT d.*, p.id as patient_id, p.full_name as patient_name, p.rut as patient_rut,
       r.folio as prescription_folio, r.diagnosis as prescription_diagnosis,
       doc.full_name as doctor_name,
       s.full_name as dispenser_name
     FROM dispensations d
     JOIN patients p ON p.id = d.patient_id
     LEFT JOIN prescriptions r ON r.id = d.prescription_id
     LEFT JOIN doctors doc ON doc.id = r.doctor_id
     JOIN staff s ON s.id = d.dispenser_id
     WHERE d.id = ?`,
    id
  );
  if (!d) notFound();

  const items = await all<DispItem>(
    `SELECT di.id, di.quantity, di.price_per_unit, di.total_price, di.batch_id,
       pr.name as product_name, pr.sku as product_sku, pr.presentation, pr.is_controlled,
       b.batch_number
     FROM dispensation_items di
     JOIN products pr ON pr.id = di.product_id
     JOIN batches b ON b.id = di.batch_id
     WHERE di.dispensation_id = ?
     ORDER BY di.id`,
    id
  );

  return (
    <>
      <PageHeader
        title={`Dispensación ${d.folio}`}
        subtitle={`${formatDateTime(d.dispensed_at)} · atendido por ${d.dispenser_name}`}
        actions={
          <>
            <Link href="/dispensations" className="btn-secondary">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Listado
            </Link>
            <PrintButton>Imprimir</PrintButton>
          </>
        }
      />

      {searchParams.success && (
        <div className="mb-6 p-4 bg-success-container/40 border-l-4 border-success rounded-r-lg flex items-start gap-2">
          <span className="material-symbols-outlined ms-fill text-success">check_circle</span>
          <div>
            <p className="font-bold text-success uppercase tracking-wider text-sm">Dispensación registrada</p>
            <p className="text-xs text-on-surface-variant mt-0.5">El stock fue actualizado y se generó un registro de movimiento.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 clinical-card p-6">
          <div className="flex justify-between items-start mb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">Folio</p>
              <p className="text-base font-mono text-on-surface mt-0.5">{d.folio}</p>
            </div>
            <StatusBadge status={d.status} />
          </div>

          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4 text-sm">
            <KV k="Paciente" v={
              <Link href={`/patients/${d.patient_id}`} className="text-primary hover:underline">{d.patient_name}</Link>
            } />
            <KV k="RUT" v={<span className="font-mono">{d.patient_rut}</span>} />
            <KV k="Atendido por" v={d.dispenser_name} />
            <KV k="Fecha" v={formatDateTime(d.dispensed_at)} />
            <KV k="Método de pago" v={d.payment_method ? PAYMENT_LABELS[d.payment_method] || d.payment_method : "—"} />
            <KV k="Estado pago" v={<StatusBadge status={d.payment_status} />} />
          </dl>

          {d.prescription_id && (
            <div className="mt-5 pt-5 border-t border-outline-variant/40">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Receta asociada</p>
              <Link href={`/prescriptions/${d.prescription_id}`} className="text-sm font-mono text-primary hover:underline">
                {d.prescription_folio}
              </Link>
              {d.prescription_diagnosis && (
                <p className="text-xs text-on-surface-variant mt-1">{d.prescription_diagnosis}</p>
              )}
              {d.doctor_name && (
                <p className="text-xs text-on-surface-variant mt-0.5">Médico: {d.doctor_name}</p>
              )}
            </div>
          )}

          {d.notes && (
            <div className="mt-5 pt-5 border-t border-outline-variant/40">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Notas</p>
              <p className="text-sm text-on-surface whitespace-pre-wrap">{d.notes}</p>
            </div>
          )}
        </div>

        <div className="clinical-card p-6">
          <h3 className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
            Total cobrado
          </h3>
          <p className="text-4xl font-bold text-primary tabular-nums font-mono">
            {formatCLP(d.total_amount)}
          </p>
          <div className="mt-4 pt-4 border-t border-outline-variant/40 space-y-2 text-xs text-on-surface-variant">
            <div className="flex justify-between"><span>Productos</span><span className="tabular-nums">{items.length}</span></div>
            <div className="flex justify-between"><span>Unidades totales</span><span className="tabular-nums">{items.reduce((s, it) => s + it.quantity, 0)}</span></div>
          </div>
        </div>
      </div>

      <h3 className="text-base font-bold text-on-surface mb-3">Productos dispensados</h3>
      <div className="clinical-card overflow-x-auto">
        <table className="table-clinical">
          <thead>
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th>Lote</th>
              <th className="text-right">Cantidad</th>
              <th className="text-right">Precio unitario</th>
              <th className="text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>
                  <p className="font-medium text-on-surface">{it.product_name}</p>
                  {it.is_controlled === 1 && (
                    <span className="text-[10px] text-error font-bold uppercase tracking-wider">Controlado</span>
                  )}
                </td>
                <td className="text-xs font-mono text-on-surface-variant">{it.product_sku}</td>
                <td>
                  <Link href={`/inventory/${it.batch_id}`} className="text-xs font-mono text-primary hover:underline">
                    {it.batch_number}
                  </Link>
                </td>
                <td className="text-right tabular-nums font-mono">{it.quantity}</td>
                <td className="text-right tabular-nums font-mono">{formatCLP(it.price_per_unit)}</td>
                <td className="text-right tabular-nums font-mono font-semibold">{formatCLP(it.total_price)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-surface-container-low">
              <td colSpan={5} className="text-right font-bold">Total</td>
              <td className="text-right font-mono tabular-nums font-bold text-lg">{formatCLP(d.total_amount)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">{k}</dt>
      <dd className="text-sm text-on-surface mt-0.5">{v}</dd>
    </div>
  );
}
