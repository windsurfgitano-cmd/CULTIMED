import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOpsRole } from "@/lib/auth";
import { all, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { formatDateTime, formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";
import clsx from "clsx";

export const dynamic = "force-dynamic";

interface ReservationRow {
  id: number;
  status: string;
  quantity_grams: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
  product_id: number;
  product_name: string | null;
  product_sku: string | null;
  product_presentation: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  cumplida: "Cumplida",
  cancelada: "Cancelada",
};

const STATUS_CLS: Record<string, string> = {
  pendiente: "pill-warning",
  cumplida: "pill-success",
  cancelada: "pill-neutral",
};

/** Estados a los que el operador puede mover una reserva desde el panel. */
const ESTADOS_ACCIONABLES = ["cumplida", "cancelada"];

/**
 * Marca una reserva como cumplida o cancelada.
 * Una reserva no mueve plata ni stock: solo cambia el compromiso de estado,
 * por eso alcanza con el guard operativo y no hace falta tocar inventario.
 */
async function setReservationStatus(formData: FormData) {
  "use server";
  const staff = await requireOpsRole();

  const id = Number(formData.get("id"));
  const nuevo = String(formData.get("nuevo") || "");
  // Volvemos al mismo filtro que estaba mirando el operador.
  const filtro = String(formData.get("filtro") || "");
  const volverA = filtro ? `/reservations?status=${filtro}` : "/reservations";

  if (!id || !ESTADOS_ACCIONABLES.includes(nuevo)) redirect(volverA);

  await run(
    `UPDATE product_reservations SET status = ?, updated_at = now() WHERE id = ?`,
    nuevo,
    id
  );

  await logAudit({
    staffId: staff.id,
    action: nuevo === "cumplida" ? "reservation_fulfilled" : "reservation_cancelled",
    entityType: "product_reservation",
    entityId: id,
    details: { status: nuevo },
  });

  redirect(`${volverA}${filtro ? "&" : "?"}updated=${nuevo}`);
}

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: { status?: string; updated?: string };
}) {
  await requireOpsRole();

  // Whitelist del filtro contra el mapa de labels antes de meterlo al WHERE.
  const status =
    searchParams.status && STATUS_LABEL[searchParams.status] ? searchParams.status : "";
  const where = status ? `WHERE r.status = ?` : "";
  const params = status ? [status] : [];

  const rows = await all<ReservationRow>(
    `SELECT r.id, r.status, r.quantity_grams::float8 AS quantity_grams, r.note,
       r.created_at, r.updated_at, r.product_id,
       p.name AS product_name, p.sku AS product_sku, p.presentation AS product_presentation,
       c.full_name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
     FROM product_reservations r
     LEFT JOIN products p ON p.id = r.product_id
     LEFT JOIN customer_accounts c ON c.id = r.customer_account_id
     ${where}
     ORDER BY r.created_at DESC
     LIMIT 200`,
    ...params
  );

  const conteos = await all<{ status: string; total: number }>(
    `SELECT status, COUNT(*)::int AS total FROM product_reservations GROUP BY status`
  );
  const porEstado = Object.fromEntries(conteos.map((c) => [c.status, c.total]));
  const totalReservas = conteos.reduce((acc, c) => acc + c.total, 0);

  const updatedMsg =
    searchParams.updated === "cumplida"
      ? "Reserva marcada como cumplida."
      : searchParams.updated === "cancelada"
      ? "Reserva cancelada."
      : "";

  return (
    <div>
      <PageHeader
        numeral="02a"
        eyebrow="Preventa y predispensado"
        title="Reservas en firme"
        subtitle={
          totalReservas === 0
            ? "Compromisos de pacientes sobre productos en preventa. Una reserva no es una venta: no hay pago asociado."
            : `${formatNumber(porEstado.pendiente || 0)} pendientes · ${formatNumber(
                porEstado.cumplida || 0
              )} cumplidas · ${formatNumber(porEstado.cancelada || 0)} canceladas. Una reserva no es una venta: no hay pago asociado.`
        }
      />

      {updatedMsg && (
        <div className="mb-6 border-l-2 border-brass bg-paper-bright px-4 py-3 text-sm text-ink">
          {updatedMsg}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-8">
        <FilterChip active={!status} href="/reservations">
          Todas
        </FilterChip>
        {Object.entries(STATUS_LABEL).map(([k, label]) => (
          <FilterChip key={k} active={status === k} href={`/reservations?status=${k}`}>
            {label}
          </FilterChip>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={status ? `Sin reservas ${STATUS_LABEL[status].toLowerCase()}s` : "Todavía no hay reservas"}
          message={
            status
              ? "Probá con otro estado: puede que las reservas estén en la bandeja de pendientes."
              : "Cuando un paciente reserve un producto en preventa desde la tienda, va a aparecer acá para que lo gestiones."
          }
          action={
            status ? (
              <Link href="/reservations" className="btn-secondary">
                Ver todas las reservas
              </Link>
            ) : (
              <Link href="/products?status=all" className="btn-secondary">
                Ir a productos
              </Link>
            )
          }
        />
      ) : (
        <div className="overflow-x-auto border border-rule bg-paper-bright">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="px-4 py-3 eyebrow">Fecha</th>
                <th className="px-4 py-3 eyebrow">Producto</th>
                <th className="px-4 py-3 eyebrow">Paciente</th>
                <th className="px-4 py-3 eyebrow">Cantidad</th>
                <th className="px-4 py-3 eyebrow">Estado</th>
                <th className="px-4 py-3 eyebrow">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule-soft">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-xs nums-lining whitespace-nowrap align-top">
                    {formatDateTime(r.created_at)}
                    {r.status !== "pendiente" && r.updated_at !== r.created_at && (
                      <p className="mt-1 text-[11px] text-ink-subtle">
                        {STATUS_LABEL[r.status] || r.status}: {formatDateTime(r.updated_at)}
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    {r.product_name ? (
                      <Link
                        href={`/products/${r.product_id}/edit`}
                        className="text-ink hover:text-brass transition-colors"
                      >
                        {r.product_name}
                      </Link>
                    ) : (
                      <span className="text-ink-muted">Producto eliminado</span>
                    )}
                    {r.product_sku && (
                      <p className="mt-0.5 font-mono text-[11px] text-ink-subtle">{r.product_sku}</p>
                    )}
                    {r.product_presentation && (
                      <p className="text-[11px] text-ink-muted">{r.product_presentation}</p>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <p className="text-ink">{r.customer_name || "Sin nombre"}</p>
                    {r.customer_email && (
                      <a
                        href={`mailto:${r.customer_email}`}
                        className="block font-mono text-[11px] text-ink-muted hover:text-brass transition-colors"
                      >
                        {r.customer_email}
                      </a>
                    )}
                    <p className="font-mono text-[11px] text-ink-muted">
                      {r.customer_phone || "Sin teléfono"}
                    </p>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span className="font-mono text-xs nums-lining">
                      {r.quantity_grams != null ? `${formatNumber(r.quantity_grams)} g` : "—"}
                    </span>
                    {r.note && (
                      <p
                        className="mt-1 max-w-[220px] text-[11px] text-ink-muted leading-snug"
                        title={r.note}
                      >
                        {r.note}
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span className={clsx(STATUS_CLS[r.status] || "pill-neutral")}>
                      {STATUS_LABEL[r.status] || r.status}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top">
                    {r.status === "pendiente" ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={setReservationStatus}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="nuevo" value="cumplida" />
                          <input type="hidden" name="filtro" value={status} />
                          <button type="submit" className="btn-primary text-xs px-3 py-1.5">
                            Marcar cumplida
                          </button>
                        </form>
                        <form action={setReservationStatus}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="nuevo" value="cancelada" />
                          <input type="hidden" name="filtro" value={status} />
                          <button type="submit" className="btn-secondary text-xs px-3 py-1.5">
                            Cancelar
                          </button>
                        </form>
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink-subtle">Cerrada</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  href,
  children,
}: {
  active: boolean;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={clsx(
        "px-4 py-1.5 text-xs uppercase tracking-widest font-medium transition-all duration-200 border",
        active ? "bg-ink text-paper border-ink" : "bg-transparent text-ink border-rule hover:border-ink"
      )}
    >
      {children}
    </Link>
  );
}
