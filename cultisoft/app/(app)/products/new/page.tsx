import Link from "next/link";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import PageHeader from "@/components/PageHeader";

const CATEGORY_OPTIONS = [
  { v: "flores", l: "Flor" },
  { v: "aceite_cbd", l: "Aceite" },
  { v: "capsulas", l: "Cápsulas" },
  { v: "topico", l: "Tópico" },
  { v: "farmaceutico", l: "Farmacéutico" },
  { v: "otro", l: "Otro" },
];

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

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

async function createProduct(formData: FormData) {
  "use server";
  const staff = await requireRole("admin", "superadmin", "pharmacist");

  const sku = String(formData.get("sku") || "").trim().toUpperCase();
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "otro");
  const defaultPrice = optionalNumber(formData, "default_price");
  const strainKeyRaw = optionalString(formData, "strain_key");
  const strainKey = strainKeyRaw || slugify(name);
  const isActive = formData.get("is_active") === "1" ? 1 : 0;
  const shopifyStatus = isActive ? "active" : "archived";

  if (!sku || !name || !category || !defaultPrice || !strainKey) redirect("/products/new?e=incomplete");

  try {
    const r = await run(
      `INSERT INTO products (sku, name, category, presentation, active_ingredient, concentration,
        thc_percentage, cbd_percentage, unit, requires_prescription, is_controlled, default_price,
        description, vendor, is_house_brand, is_preorder, shopify_status, is_active, image_url, strain_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      defaultPrice,
      optionalString(formData, "description"),
      optionalString(formData, "vendor"),
      formData.get("is_house_brand") === "1" ? 1 : 0,
      formData.get("is_preorder") === "1" ? 1 : 0,
      shopifyStatus,
      isActive,
      optionalString(formData, "image_url"),
      strainKey
    );
    await logAudit({ staffId: staff.id, action: "product_created", entityType: "product", entityId: Number(r.lastInsertRowid), details: { sku, name, strainKey } });
    redirect(`/products?updated=1`);
  } catch (err: any) {
    if (String(err).includes("UNIQUE")) redirect("/products/new?e=duplicate");
    throw err;
  }
}

const ERR: Record<string, string> = {
  incomplete: "SKU, nombre, categoría, precio y strain key son obligatorios.",
  duplicate: "Ya existe un producto con ese SKU.",
};

export default async function NewProductPage({ searchParams }: { searchParams: { e?: string } }) {
  await requireRole("admin", "superadmin", "pharmacist");
  const error = searchParams.e ? ERR[searchParams.e] : null;

  return (
    <>
      <PageHeader
        title="Crear producto"
        subtitle="Define ficha comercial, datos clínicos y visibilidad web. El stock se ingresa después como lote."
        actions={<Link href="/products" className="btn-secondary">Volver</Link>}
      />

      {error && <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg text-sm text-on-error-container">{error}</div>}

      <form action={createProduct} className="space-y-6">
        <ProductForm />
        <div className="flex justify-end gap-3">
          <Link href="/products" className="btn-secondary">Cancelar</Link>
          <button type="submit" className="btn-primary">
            <span className="material-symbols-outlined text-base">save</span>
            Crear producto
          </button>
        </div>
      </form>
    </>
  );
}

function ProductForm() {
  return (
    <>
      <Section title="Ficha comercial" icon="sell">
        <Field label="SKU *" name="sku" required placeholder="GASLIGHT-5G" />
        <Field label="Nombre *" name="name" required colSpan={2} />
        <SelectField label="Categoría *" name="category" options={CATEGORY_OPTIONS} defaultValue="flores" />
        <Field label="Presentación" name="presentation" placeholder="5g / 10ML / 30ML" />
        <Field label="Precio web CLP *" name="default_price" type="number" required min="0" step="100" />
        <Field label="Proveedor / breeder" name="vendor" />
        <Field label="Strain key / familia *" name="strain_key" placeholder="gaslight-purple-ghost..." colSpan={2} />
        <Field label="Imagen URL" name="image_url" type="url" colSpan={2} />
        <TextArea label="Descripción" name="description" colSpan={2} />
      </Section>

      <Section title="Datos clínicos" icon="medical_information">
        <Field label="Principio activo" name="active_ingredient" />
        <Field label="Concentración" name="concentration" />
        <Field label="THC %" name="thc_percentage" type="number" min="0" step="0.01" />
        <Field label="CBD %" name="cbd_percentage" type="number" min="0" step="0.01" />
        <Field label="Unidad" name="unit" defaultValue="unidad" />
      </Section>

      <Section title="Web y cumplimiento" icon="storefront">
        <Checkbox label="Habilitado para compra web" name="is_active" defaultChecked />
        <Checkbox label="Requiere receta" name="requires_prescription" defaultChecked />
        <Checkbox label="Producto controlado" name="is_controlled" />
        <Checkbox label="Línea Cultimed" name="is_house_brand" />
        <Checkbox label="Preventa" name="is_preorder" />
      </Section>
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

function Field({ label, name, type = "text", required = false, placeholder, colSpan, defaultValue, min, step }: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; colSpan?: number; defaultValue?: string; min?: string; step?: string;
}) {
  return (
    <div className={colSpan === 2 ? "md:col-span-2" : ""}>
      <label className="input-label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue} min={min} step={step} className="input-field" />
    </div>
  );
}

function TextArea({ label, name, colSpan }: { label: string; name: string; colSpan?: number }) {
  return (
    <div className={colSpan === 2 ? "md:col-span-2" : ""}>
      <label className="input-label" htmlFor={name}>{label}</label>
      <textarea id={name} name={name} rows={3} className="input-field" />
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
