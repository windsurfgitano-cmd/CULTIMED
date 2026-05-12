// Editar datos de pedido web (admin/superadmin).
// Solo cambia: dirección de despacho, teléfono, método de envío, notas internas, tracking.
// NO cambia items/precios (eso requiere refund logic). Para eso: cancelar + crear pedido nuevo.
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff, isAdminOrAbove } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { formatDateTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface OrderRow {
  id: number;
  folio: string;
  status: string;
  customer_name: string;
  customer_email: string;
  shipping_address: string | null;
  shipping_city: string | null;
  shipping_region: string | null;
  shipping_phone: string | null;
  shipping_method: string;
  shipping_tracking: string | null;
  notes: string | null;
  created_at: string;
}

async function updateOrderAction(formData: FormData) {
  "use server";
  const staff = await requireStaff();
  if (!isAdminOrAbove(staff)) redirect("/web-orders");

  const id = Number(formData.get("id"));
  if (!id) redirect("/web-orders");

  const address = String(formData.get("shipping_address") || "").trim() || null;
  const city = String(formData.get("shipping_city") || "").trim() || null;
  const region = String(formData.get("shipping_region") || "").trim() || null;
  const phone = String(formData.get("shipping_phone") || "").trim() || null;
  const method = String(formData.get("shipping_method") || "courier");
  const tracking = String(formData.get("shipping_tracking") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  await run(
    `UPDATE customer_orders
     SET shipping_address = ?, shipping_city = ?, shipping_region = ?,
         shipping_phone = ?, shipping_method = ?, shipping_tracking = ?,
         notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    address, city, region, phone, method, tracking, notes, id
  );

  await run(
    `INSERT INTO customer_order_events (order_id, event_type, message, staff_id)
     VALUES (?, 'order_edited', ?, ?)`,
    id, `Datos de pedido editados por ${staff.full_name}`, staff.id
  );

  await logAudit({
    staffId: staff.id,
    action: "order_edited",
    entityType: "customer_order",
    entityId: id,
    details: { fields: ["shipping_address", "shipping_phone", "shipping_method", "shipping_tracking", "notes"] },
  });

  redirect(`/web-orders/${id}?ok=edited`);
}

export default async function EditWebOrderPage({
  params,
}: {
  params: { id: string };
}) {
  const staff = await requireStaff();
  if (!isAdminOrAbove(staff)) redirect("/web-orders");

  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const order = await get<OrderRow>(
    `SELECT o.id, o.folio, o.status, o.shipping_address, o.shipping_city,
       o.shipping_region, o.shipping_phone, o.shipping_method, o.shipping_tracking,
       o.notes, o.created_at,
       c.full_name as customer_name, c.email as customer_email
     FROM customer_orders o
     JOIN customer_accounts c ON c.id = o.customer_account_id
     WHERE o.id = ?`,
    id
  );
  if (!order) notFound();

  const lockedStatuses = ["delivered", "cancelled"];
  const isLocked = lockedStatuses.includes(order.status);

  return (
    <>
      <PageHeader
        title={`Editar pedido ${order.folio}`}
        subtitle={`${order.customer_name} · ${order.customer_email} · creado ${formatDateTime(order.created_at)}`}
        actions={
          <Link href={`/web-orders/${id}`} className="btn-secondary">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Volver al pedido
          </Link>
        }
      />

      {isLocked && (
        <div className="mb-5 px-4 py-3 bg-warning/10 border-l-4 border-warning rounded-r-lg">
          <p className="text-sm">
            Este pedido está <strong>{order.status}</strong>. Cambios cosméticos permitidos pero el estado no se puede revertir desde aquí.
          </p>
        </div>
      )}

      <p className="mb-6 text-[12px] text-on-surface-variant leading-relaxed max-w-3xl">
        Edita datos de envío, tracking y notas internas. Para cambiar items/precios,
        cancela este pedido y crea uno nuevo (mantiene trazabilidad limpia).
      </p>

      <form action={updateOrderAction} className="space-y-6 max-w-4xl">
        <input type="hidden" name="id" value={order.id} />

        <section className="clinical-card p-6">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">local_shipping</span>
            Dirección de despacho
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="input-label">Dirección</label>
              <input name="shipping_address" type="text" defaultValue={order.shipping_address || ""} className="input-field" />
            </div>
            <div>
              <label className="input-label">Comuna</label>
              <input name="shipping_city" type="text" defaultValue={order.shipping_city || ""} className="input-field" />
            </div>
            <div>
              <label className="input-label">Región</label>
              <input name="shipping_region" type="text" defaultValue={order.shipping_region || ""} className="input-field" />
            </div>
            <div>
              <label className="input-label">Teléfono / WhatsApp</label>
              <input name="shipping_phone" type="tel" defaultValue={order.shipping_phone || ""} className="input-field" />
            </div>
            <div>
              <label className="input-label">Método de envío</label>
              <select name="shipping_method" className="input-field" defaultValue={order.shipping_method}>
                <option value="courier">Courier privado</option>
                <option value="pickup">Retiro en farmacia</option>
              </select>
            </div>
          </div>
        </section>

        <section className="clinical-card p-6">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">local_post_office</span>
            Tracking de envío
          </h2>
          <div>
            <label className="input-label">Número de seguimiento (opcional)</label>
            <input name="shipping_tracking" type="text" defaultValue={order.shipping_tracking || ""} className="input-field font-mono" placeholder="Ej: STARKEN-12345678" />
            <p className="mt-1 text-[11px] text-on-surface-variant">Al ingresar tracking, considera transicionar el pedido a "Despachado" desde la pantalla principal.</p>
          </div>
        </section>

        <section className="clinical-card p-6">
          <label className="input-label" htmlFor="notes">Notas internas</label>
          <textarea
            id="notes"
            name="notes"
            rows={4}
            defaultValue={order.notes || ""}
            className="input-field"
            placeholder="Notas visibles solo al staff."
          />
        </section>

        <div className="flex justify-end gap-3">
          <Link href={`/web-orders/${id}`} className="btn-secondary">Cancelar</Link>
          <button type="submit" className="btn-primary">
            <span className="material-symbols-outlined text-base">save</span>
            Guardar cambios
          </button>
        </div>
      </form>
    </>
  );
}
