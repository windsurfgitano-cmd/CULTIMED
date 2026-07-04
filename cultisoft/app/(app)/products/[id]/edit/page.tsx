import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole, requireOpsRole } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { parsePriceTiers, type PriceTier } from "@/lib/pricing";
import PageHeader from "@/components/PageHeader";

interface ProductFull {
  id: number;
  sku: string;
  name: string;
  category: string;
  presentation: string | null;
  active_ingredient: string | null;
  concentration: string | null;
  thc_percentage: number | null;
  cbd_percentage: number | null;
  unit: string;
  requires_prescription: number;
  is_controlled: number;
  default_price: number | null;
  description: string | null;
  vendor: string | null;
  is_house_brand: number;
  is_preorder: number;
  shopify_status: string | null;
  is_active: number;
  image_url: string | null;
  strain_key: string | null;
  price_tiers: unknown;
}

const CATEGORY_OPTIONS = [
  { v: "flores", l: "Flor" },
  { v: "aceite_cbd", l: "Aceite" },
  { v: "capsulas", l: "Cápsulas" },
  { v: "topico", l: "Tópico" },
  { v: "farmaceutico", l: "Farmacéutico" },
  { v: "otro", l: "Otro" },
];

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) || "").trim();
  return value || null;
}

function optionalNumber(formData: FormData, key: string) {
  const raw = String(formData.get(key) || "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function readPriceTiersFromForm(formData: FormData): PriceTier[] | null {
  const tiers: PriceTier[] = [];
  for (let i = 1; i <= 4; i++) {
    const desde = optionalNumber(formData, `tier_desde_${i}`);
    const precio = optionalNumber(formData, `tier_precio_${i}`);
    if (desde !== null && precio !== null) tiers.push({ desde_g: desde, precio_g: precio });
  }
  if (tiers.length === 0) return null;
  tiers.sort((a, b) => a.desde_g - b.desde_g);
  return tiers;
}

async function updateProduct(formData: FormData) {
  "use server";
  const staff = await requireOpsRole();
  const id = Number(formData.get("id"));
  const sku = String(formData.get("sku") || "").trim().toUpperCase();
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "otro");
  const defaultPrice = optionalNumber(formData, "default_price");
  const strainKey = optionalString(formData, "strain_key");
  const isActive = formData.get("is_active") === "1" ? 1 : 0;
  const shopifyStatus = isActive ? "active" : "archived";
  const priceTiers = readPriceTiersFromForm(formData);

  if (!id || !sku || !name || !category || !defaultPrice || !strainKey) redirect(`/products/${id}/edit?e=incomplete`);
  if (priceTiers && priceTiers.length < 4) redirect(`/products/${id}/edit?e=incomplete_tiers`);
  if (priceTiers && priceTiers.some((t) => t.precio_g <= 0 || t.desde_g <= 0)) {
    redirect(`/products/${id}/edit?e=invalid_tiers`);
  }

  const effectiveDefaultPrice = priceTiers ? priceTiers[0].precio_g : defaultPrice;

  try {
    await run(
      `UPDATE products SET sku = ?, name = ?, category = ?, presentation = ?, active_ingredient = ?,
        concentration = ?, thc_percentage = ?, cbd_percentage = ?, unit = ?, requires_prescription = ?,
        is_controlled = ?, default_price = ?, description = ?, vendor = ?, is_house_brand = ?,
        is_preorder = ?, shopify_status = ?, is_active = ?, image_url = ?, strain_key = ?, price_tiers = ?
       WHERE id = ?`,
      sku,
      name,
      category,
      optionalString(formData, "presentation"),
      optionalString(formData, "active_ingredient"),
      optionalString(formData, "concentration"),
      optionalNumber(formData, "thc_percentage"),
      optionalNumber(formData, "cbd_percentage"),
      String(formData.get("unit") || "unidad").trim() || "unidad",
      formData.get("requires_prescription") === "1" ? 1 : 0,
      formData.get("is_controlled") === "1" ? 1 : 0,
      effectiveDefaultPrice,
      optionalString(formData, "description"),
      optionalString(formData, "vendor"),
      formData.get("is_house_brand") === "1" ? 1 : 0,
      formData.get("is_preorder") === "1" ? 1 : 0,
      shopifyStatus,
      isActive,
      optionalString(formData, "image_url"),
      strainKey,
      priceTiers ? JSON.stringify(priceTiers) : null,
      id
    );
    await logAudit({ staffId: staff.id, action: "product_updated", entityType: "product", entityId: id, details: { sku, name, strainKey, isActive, priceTiers } });
    redirect("/products?updated=1");
  } catch (err: any) {
    if (String(err).includes("UNIQUE")) redirect(`/products/${id}/edit?e=duplicate`);
    throw err;
  }
}

const ERR: Record<string, string> = {
  incomplete: "SKU, nombre, categoría, precio y strain key son obligatorios.",
  duplicate: "Ya existe otro producto con ese SKU.",
  incomplete_tiers: "Completa los 4 tramos de precio, o dejalos todos en blanco.",
  invalid_tiers: "Los tramos de precio deben ser valores positivos.",
};

export default async function EditProductPage({ params, searchParams }: { params: { id: string }; searchParams: { e?: string } }) {
  await requireOpsRole();
  const id = Number(params.id);
  if (!id) notFound();
  const product = await get<ProductFull>(`SELECT * FROM products WHERE id = ?`, id);
  if (!product) notFound();
  const error = searchParams.e ? ERR[searchParams.e] : null;

  return (
    <>
      <PageHeader
        title="Editar producto"
        subtitle={`${product.name} · ${product.sku}`}
        actions={<Link href="/products" className="btn-secondary">Volver</Link>}
      />

      {error && <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg text-sm text-on-error-container">{error}</div>}

      <form action={updateProduct} className="space-y-6">
        <input type="hidden" name="id" value={product.id} />
        <ProductForm product={product} />
        <div className="flex justify-end gap-3">
          <Link href="/products" className="btn-secondary">Cancelar</Link>
          <button type="submit" className="btn-primary">
            <span className="material-symbols-outlined text-base">save</span>
            Guardar cambios
          </button>
        </div>
      </form>
    </>
  );
}

function ProductForm({ product }: { product: ProductFull }) {
  const tiers = parsePriceTiers(product.price_tiers);
  return (
    <>
      <Section title="Ficha comercial" icon="sell">
        <Field label="SKU *" name="sku" required defaultValue={product.sku} />
        <Field label="Nombre *" name="name" required defaultValue={product.name} colSpan={2} />
        <SelectField label="Categoría *" name="category" options={CATEGORY_OPTIONS} defaultValue={product.category} />
        <Field label="Presentación" name="presentation" defaultValue={product.presentation || ""} />
        <Field label="Precio web CLP *" name="default_price" type="number" required min="0" step="100" defaultValue={String(product.default_price || "")} />
        <Field label="Proveedor / breeder" name="vendor" defaultValue={product.vendor || ""} />
        <Field label="Strain key / familia *" name="strain_key" defaultValue={product.strain_key || ""} colSpan={2} />
        <Field label="Imagen URL" name="image_url" type="url" defaultValue={product.image_url || ""} colSpan={2} />
        <TextArea label="Descripción" name="description" defaultValue={product.description || ""} colSpan={2} />
      </Section>

      <Section title="Datos clínicos" icon="medical_information">
        <Field label="Principio activo" name="active_ingredient" defaultValue={product.active_ingredient || ""} />
        <Field label="Concentración" name="concentration" defaultValue={product.concentration || ""} />
        <Field label="THC %" name="thc_percentage" type="number" min="0" step="0.01" defaultValue={product.thc_percentage !== null ? String(product.thc_percentage) : ""} />
        <Field label="CBD %" name="cbd_percentage" type="number" min="0" step="0.01" defaultValue={product.cbd_percentage !== null ? String(product.cbd_percentage) : ""} />
        <Field label="Unidad" name="unit" defaultValue={product.unit || "unidad"} />
      </Section>

      <Section title="Escalera de precios por gramo (opcional)" icon="stairs">
        <p className="md:col-span-2 text-xs text-on-surface-variant -mt-2 mb-1">
          Solo para productos que se venden por gramo con tramos de precio (ej. flores a granel).
          Completa los 4 tramos, o dejalos todos en blanco si este producto usa precio fijo normal.
        </p>
        {[0, 1, 2, 3].map((i) => (
          <PriceTierRow key={i} index={i + 1} desde={tiers?.[i]?.desde_g} precio={tiers?.[i]?.precio_g} />
        ))}
      </Section>

      <Section title="Web y cumplimiento" icon="storefront">
        <Checkbox label="Habilitado para compra web" name="is_active" defaultChecked={product.is_active === 1 && product.shopify_status === "active"} />
        <Checkbox label="Requiere receta" name="requires_prescription" defaultChecked={product.requires_prescription === 1} />
        <Checkbox label="Producto controlado" name="is_controlled" defaultChecked={product.is_controlled === 1} />
        <Checkbox label="Línea Cultimed" name="is_house_brand" defaultChecked={product.is_house_brand === 1} />
        <Checkbox label="Preventa" name="is_preorder" defaultChecked={product.is_preorder === 1} />
      </Section>
    </>
  );
}

function PriceTierRow({ index, desde, precio }: { index: number; desde?: number; precio?: number }) {
  return (
    <>
      <div>
        <label className="input-label" htmlFor={`tier_desde_${index}`}>Tramo {index} · desde (g)</label>
        <input id={`tier_desde_${index}`} name={`tier_desde_${index}`} type="number" min="1" step="1" defaultValue={desde ?? ""} className="input-field" />
      </div>
      <div>
        <label className="input-label" htmlFor={`tier_precio_${index}`}>Tramo {index} · precio/g (CLP)</label>
        <input id={`tier_precio_${index}`} name={`tier_precio_${index}`} type="number" min="0" step="0.5" defaultValue={precio ?? ""} className="input-field" />
      </div>
    </>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="clinical-card p-6">
      <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-5 pb-3 border-b border-outline-variant/40">
        <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
        {title}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">{children}</div>
    </div>
  );
}

function Field({ label, name, type = "text", required = false, colSpan, defaultValue, min, step }: {
  label: string; name: string; type?: string; required?: boolean; colSpan?: number; defaultValue?: string; min?: string; step?: string;
}) {
  return (
    <div className={colSpan === 2 ? "md:col-span-2" : ""}>
      <label className="input-label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required} defaultValue={defaultValue} min={min} step={step} className="input-field" />
    </div>
  );
}

function TextArea({ label, name, defaultValue, colSpan }: { label: string; name: string; defaultValue?: string; colSpan?: number }) {
  return (
    <div className={colSpan === 2 ? "md:col-span-2" : ""}>
      <label className="input-label" htmlFor={name}>{label}</label>
      <textarea id={name} name={name} rows={3} defaultValue={defaultValue} className="input-field" />
    </div>
  );
}

function SelectField({ label, name, defaultValue, options }: { label: string; name: string; defaultValue?: string; options: Array<{ v: string; l: string }> }) {
  return (
    <div>
      <label className="input-label" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={defaultValue} className="input-field">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

function Checkbox({ label, name, defaultChecked = false }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-on-surface">
      <input type="checkbox" name={name} value="1" defaultChecked={defaultChecked} className="h-4 w-4 accent-primary" />
      {label}
    </label>
  );
}
