// Crear pedido manual (admin/superadmin). Caso: cliente llama por teléfono,
// presencial en consulta, etc. Admin selecciona customer + productos + total.
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff, isAdminOrAbove } from "@/lib/auth";
import { all, get, run, transaction } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { formatCLP } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import ManualOrderRowsClient from "./ManualOrderRowsClient";

export const dynamic = "force-dynamic";

interface CustomerOption {
  id: number;
  email: string;
  full_name: string;
  rut: string | null;
  phone: string | null;
  prescription_status: string;
}

interface ProductOption {
  id: number;
  sku: string;
  name: string;
  default_price: number;
  category: string;
  total_stock: number;
}

async function createOrderAction(formData: FormData) {
  "use server";
  const staff = await requireStaff();
  if (!isAdminOrAbove(staff)) redirect("/web-orders/new?e=forbidden");

  const customerAccountId = Number(formData.get("customer_account_id"));
  if (!customerAccountId) redirect("/web-orders/new?e=no_customer");

  // Items: arrays paralelos product_id[] + quantity[]
  const productIds = formData.getAll("item_product_id").map((v) => Number(v)).filter(Boolean);
  const qtys = formData.getAll("item_quantity").map((v) => Number(v));
  if (productIds.length === 0) redirect("/web-orders/new?e=no_items");

  const shippingAddress = String(formData.get("shipping_address") || "").trim() || null;
  const shippingCity = String(formData.get("shipping_city") || "").trim() || null;
  const shippingRegion = String(formData.get("shipping_region") || "").trim() || null;
  const shippingPhone = String(formData.get("shipping_phone") || "").trim() || null;
  const shippingMethod = String(formData.get("shipping_method") || "courier");
  const paymentMethod = String(formData.get("payment_method") || "transfer");
  const initialStatus = String(formData.get("initial_status") || "pending_payment");
  const notes = String(formData.get("notes") || "").trim() || null;

  // Compute totals server-side
  const items: Array<{ product_id: number; quantity: number; unit_price: number; total: number }> = [];
  for (let i = 0; i < productIds.length; i++) {
    if (!productIds[i] || qtys[i] <= 0) continue;
    const p = await get<{ default_price: number }>(
      `SELECT default_price FROM products WHERE id = ? AND is_active = 1`,
      productIds[i]
    );
    if (!p) continue;
    items.push({
      product_id: productIds[i],
      quantity: qtys[i],
      unit_price: p.default_price,
      total: p.default_price * qtys[i],
    });
  }
  if (items.length === 0) redirect("/web-orders/new?e=no_valid_items");

  const subtotal = items.reduce((s, it) => s + it.total, 0);
  const total = subtotal;

  const folio = `CM-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase().slice(-6)}-M`;

  let newId = 0;
  await transaction(async (tx) => {
    const r = await tx.run(
      `INSERT INTO customer_orders
         (folio, customer_account_id, status, subtotal, total,
          shipping_address, shipping_city, shipping_region, shipping_phone,
          shipping_method, payment_method, notes,
          referral_discount_amount, payment_discount_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`,
      folio, customerAccountId, initialStatus, subtotal, total,
      shippingAddress, shippingCity, shippingRegion, shippingPhone,
      shippingMethod, paymentMethod, notes
    );
    newId = Number(r.lastInsertRowid);
    for (const it of items) {
      await tx.run(
        `INSERT INTO customer_order_items (order_id, product_id, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?)`,
        newId, it.product_id, it.quantity, it.unit_price, it.total
      );
    }
    await tx.run(
      `INSERT INTO customer_order_events (order_id, event_type, message, staff_id)
       VALUES (?, 'order_created_manually', ?, ?)`,
      newId, `Pedido manual creado por ${staff.full_name} (${items.length} items, ${formatCLP(total)})`, staff.id
    );
  });

  await logAudit({
    staffId: staff.id,
    action: "order_created_manually",
    entityType: "customer_order",
    entityId: newId,
    details: { folio, customer_id: customerAccountId, items_count: items.length, total },
  });

  redirect(`/web-orders/${newId}?ok=created`);
}

const ERR_MSG: Record<string, string> = {
  no_customer: "Selecciona un cliente.",
  no_items: "Agrega al menos un producto.",
  no_valid_items: "Ningún producto válido. Verifica IDs.",
  forbidden: "Solo administradores pueden crear pedidos manuales.",
};

export default async function NewWebOrderPage({
  searchParams,
}: {
  searchParams: { e?: string; customer?: string };
}) {
  const staff = await requireStaff();
  if (!isAdminOrAbove(staff)) {
    return (
      <div className="p-8 border-l-2 border-sangria bg-sangria/5">
        <p className="text-sm text-ink">Solo administradores pueden crear pedidos manuales.</p>
      </div>
    );
  }

  // Customers con receta aprobada (los únicos que pueden comprar)
  const customers = await all<CustomerOption>(
    `SELECT id, email, full_name, rut, phone, prescription_status
     FROM customer_accounts
     ORDER BY full_name ASC
     LIMIT 500`
  );

  // Productos activos con stock
  const products = await all<ProductOption>(
    `SELECT p.id, p.sku, p.name, p.default_price, p.category,
       COALESCE((SELECT SUM(quantity_current) FROM batches b WHERE b.product_id = p.id AND b.status='available'), 0)::int as total_stock
     FROM products p
     WHERE p.is_active = 1 AND p.shopify_status='active'
     ORDER BY p.is_house_brand DESC, p.name ASC`
  );

  const error = searchParams.e ? ERR_MSG[searchParams.e] : null;
  const preselectedCustomer = searchParams.customer ? Number(searchParams.customer) : null;

  return (
    <>
      <PageHeader
        title="Crear pedido manual"
        subtitle="Pedido en nombre del cliente — para órdenes telefónicas, presenciales o WhatsApp."
        actions={
          <Link href="/web-orders" className="btn-secondary">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Volver
          </Link>
        }
      />

      {error && (
        <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg flex gap-2 items-start">
          <span className="material-symbols-outlined ms-fill text-error mt-0.5">error</span>
          <p className="text-sm text-on-error-container">{error}</p>
        </div>
      )}

      <form action={createOrderAction} className="space-y-6">
        {/* Cliente */}
        <section className="clinical-card p-6">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">person</span>
            Cliente
          </h2>
          <div>
            <label htmlFor="customer_account_id" className="input-label">Cuenta del cliente *</label>
            <select
              id="customer_account_id"
              name="customer_account_id"
              required
              defaultValue={preselectedCustomer || ""}
              className="input-field"
            >
              <option value="">— Selecciona cliente —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} · {c.email} · {c.rut || "sin RUT"} · receta: {c.prescription_status}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px] text-on-surface-variant">
              Si el cliente no existe, créalo primero en <Link href="/patients/new" className="underline">Pacientes</Link> + cuenta en el storefront.
            </p>
          </div>
        </section>

        {/* Items */}
        <section className="clinical-card p-6">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">shopping_cart</span>
            Items del pedido
          </h2>

          <ManualOrderRowsClient products={products} />
        </section>

        {/* Despacho */}
        <section className="clinical-card p-6">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">local_shipping</span>
            Despacho
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="input-label">Dirección</label>
              <input name="shipping_address" type="text" className="input-field" placeholder="Av. Apoquindo 4500, Dpto 305" />
            </div>
            <div>
              <label className="input-label">Ciudad / Comuna</label>
              <input name="shipping_city" type="text" className="input-field" placeholder="Las Condes" />
            </div>
            <div>
              <label className="input-label">Región</label>
              <input name="shipping_region" type="text" className="input-field" placeholder="RM" />
            </div>
            <div>
              <label className="input-label">Teléfono / WhatsApp</label>
              <input name="shipping_phone" type="tel" className="input-field" placeholder="+56 9 XXXX XXXX" />
            </div>
            <div>
              <label className="input-label">Método de envío</label>
              <select name="shipping_method" className="input-field" defaultValue="courier">
                <option value="courier">Courier privado</option>
                <option value="pickup">Retiro en farmacia</option>
              </select>
            </div>
          </div>
        </section>

        {/* Pago */}
        <section className="clinical-card p-6">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">payments</span>
            Pago
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="input-label">Método de pago</label>
              <select name="payment_method" className="input-field" defaultValue="transfer">
                <option value="transfer">Transferencia bancaria</option>
                <option value="cash">Efectivo</option>
                <option value="mercadopago">MercadoPago</option>
                <option value="other">Otro</option>
              </select>
            </div>
            <div>
              <label className="input-label">Estado inicial</label>
              <select name="initial_status" className="input-field" defaultValue="pending_payment">
                <option value="pending_payment">Pendiente de pago</option>
                <option value="proof_uploaded">Comprobante recibido (sube luego)</option>
                <option value="paid">Pagado (ya pagó cash/transfer verificada)</option>
              </select>
              <p className="mt-1 text-[11px] text-on-surface-variant">Si ya pagó en efectivo presencial, marca "Pagado".</p>
            </div>
          </div>
        </section>

        {/* Notas */}
        <section className="clinical-card p-6">
          <label className="input-label" htmlFor="notes">Notas internas (opcional)</label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            placeholder="Ej: Pedido por teléfono · cliente pidió retiro mañana 4pm"
            className="input-field"
          />
        </section>

        <div className="flex justify-end gap-3">
          <Link href="/web-orders" className="btn-secondary">Cancelar</Link>
          <button type="submit" className="btn-primary">
            <span className="material-symbols-outlined text-base">add_shopping_cart</span>
            Crear pedido
          </button>
        </div>
      </form>
    </>
  );
}

