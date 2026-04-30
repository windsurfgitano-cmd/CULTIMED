import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { all, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import PageHeader from "@/components/PageHeader";

interface ProductOption { id: number; sku: string; name: string; }

async function createBatch(formData: FormData) {
  "use server";
  const staff = requireStaff();
  const productId = Number(formData.get("product_id"));
  const batchNumber = String(formData.get("batch_number") || "").trim();
  const qty = Number(formData.get("quantity"));
  const cost = Number(formData.get("cost_per_unit") || 0);
  const price = Number(formData.get("price_per_unit") || 0);
  const mfg = String(formData.get("manufacture_date") || "") || null;
  const exp = String(formData.get("expiry_date") || "") || null;
  const supplier = String(formData.get("supplier") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!productId || !batchNumber || qty <= 0 || price <= 0) {
    redirect("/inventory/new?e=incomplete");
  }

  try {
    const r = run(
      `INSERT INTO batches (product_id, batch_number, quantity_initial, quantity_current,
         cost_per_unit, price_per_unit, manufacture_date, expiry_date, supplier, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)`,
      productId, batchNumber, qty, qty, cost || null, price, mfg, exp, supplier, notes
    );
    const id = Number(r.lastInsertRowid);
    run(
      `INSERT INTO inventory_movements (batch_id, movement_type, quantity, reference_type, staff_id, reason)
       VALUES (?, 'in', ?, 'purchase', ?, ?)`,
      id, qty, staff.id, `Ingreso lote ${batchNumber}${supplier ? ` de ${supplier}` : ""}`
    );
    logAudit({ staffId: staff.id, action: "batch_created", entityType: "batch", entityId: id, details: { qty, supplier } });
    redirect(`/inventory/${id}`);
  } catch (e: any) {
    if (String(e).includes("UNIQUE")) redirect("/inventory/new?e=duplicate");
    throw e;
  }
}

const ERR: Record<string, string> = {
  incomplete: "Faltan campos obligatorios.",
  duplicate: "Ya existe un lote con ese número para este producto.",
};

export default function NewBatchPage({ searchParams }: { searchParams: { e?: string; product?: string } }) {
  requireStaff();
  const products = all<ProductOption>(`SELECT id, sku, name FROM products WHERE is_active = 1 ORDER BY name`);
  const error = searchParams.e ? ERR[searchParams.e] : null;
  const preselectId = searchParams.product ? Number(searchParams.product) : undefined;

  return (
    <>
      <PageHeader
        title="Ingresar nuevo lote"
        subtitle="Asocia inventario nuevo a un producto existente del catálogo."
        actions={<Link href="/inventory" className="btn-secondary">Volver</Link>}
      />

      {error && (
        <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg flex gap-2 items-start">
          <span className="material-symbols-outlined ms-fill text-error mt-0.5">error</span>
          <p className="text-sm text-on-error-container">{error}</p>
        </div>
      )}

      <form action={createBatch} className="clinical-card p-6 grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
        <div className="md:col-span-2">
          <label className="input-label">Producto *</label>
          <select name="product_id" required defaultValue={preselectId} className="input-field">
            <option value="">— Selecciona un producto —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="input-label">Número de lote *</label>
          <input name="batch_number" required className="input-field" placeholder="Ej: B992-CBD5-2026" />
        </div>
        <div>
          <label className="input-label">Cantidad recibida *</label>
          <input name="quantity" type="number" min="1" step="1" required className="input-field" />
        </div>
        <div>
          <label className="input-label">Precio por unidad (CLP) *</label>
          <input name="price_per_unit" type="number" min="0" step="100" required className="input-field" />
        </div>
        <div>
          <label className="input-label">Costo por unidad (CLP)</label>
          <input name="cost_per_unit" type="number" min="0" step="100" className="input-field" />
        </div>
        <div>
          <label className="input-label">Fecha fabricación</label>
          <input name="manufacture_date" type="date" className="input-field" />
        </div>
        <div>
          <label className="input-label">Fecha vencimiento</label>
          <input name="expiry_date" type="date" className="input-field" />
        </div>
        <div className="md:col-span-2">
          <label className="input-label">Proveedor</label>
          <input name="supplier" className="input-field" placeholder="Nombre del proveedor / breeder" />
        </div>
        <div className="md:col-span-2">
          <label className="input-label">Notas</label>
          <textarea name="notes" rows={2} className="input-field" placeholder="Observaciones del lote, COA, calidad..." />
        </div>

        <div className="md:col-span-2 flex justify-end gap-3 pt-2 border-t border-outline-variant/30 mt-2">
          <Link href="/inventory" className="btn-secondary">Cancelar</Link>
          <button type="submit" className="btn-primary">
            <span className="material-symbols-outlined text-base">save</span>
            Registrar lote
          </button>
        </div>
      </form>
    </>
  );
}
