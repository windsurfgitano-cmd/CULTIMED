# Venta de flores por gramo + limpieza de abandonados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate Bourbon Street and Gaslight Purple Ghost from 3 fixed-size SKUs each (5g/10g/20g) into 1 SKU per variety sold by the gram with 4-tier price breaks, and fix 3 data-hygiene gaps found during a full purchase-flow review (abandoned pending-payment orders not flagged, only 1 of 5 patient documents re-uploadable, 2 missing outreach segments).

**Architecture:** A shared `lib/pricing.ts` (identical in both `cultisoft` and `cultimed-store`) holds the `PriceTier` type and the single source of truth for tier-price math (`calcularPrecioGramos`). The customer-facing product page swaps its fixed-format picker for a gram stepper when a product has `price_tiers`; the cart stores tiers on the line item and recomputes totals live; the checkout API re-fetches `price_tiers` server-side and computes the real charge itself (extending the existing server-authoritative pricing pattern, never trusting client-sent prices). A one-off Node script migrates the 6 existing product/batch rows into 2 consolidated rows, archiving (not deleting) the originals. Three small, independent admin-side fixes round out the plan: price-tier editing on the product form, an "abandoned orders" split on the Dashboard, and 2 new segments on the outreach page.

**Tech Stack:** Next.js 14 App Router (Server Actions + Route Handlers), Postgres via `postgres-js` (`lib/db.ts`'s `get`/`all`/`run`/`transaction` helpers using `?` placeholders), plain Node scripts for one-off data migrations (no ts-node), TypeScript strict mode, Tailwind.

---

## Important background (read before starting)

- **`gram-utils.ts` gotcha (cultisoft-only, do not skip):** `cultisoft/lib/gram-utils.ts`'s `parseGramsPerUnit()` is used by `dispensation-guard.ts` and `patient-compliance.ts` to compute the SANNA monthly-gram compliance limit. It detects "this is a flower sold by weight" two ways: (1) a `\d+g` pattern in the product's `presentation`+`name` text, or (2) a fallback regex for the literal word `flor`/`flores`/`flower`/`cannabis` in that same text. **Neither checks the `category` column.** The current 5g/10g/20g products match via rule (1) because their `presentation` field literally contains "5g" etc. Once we consolidate to a single gram-priced product, `presentation` must NOT contain a `Ng` pattern (that would make `parseGramsPerUnit` multiply, e.g., "7g flower text" × quantity instead of just returning quantity). Instead, `presentation` will be set to the literal string `"Flor a granel"` — this contains the whole word "flor", satisfies rule (2), and does **not** match the `\d+g` regex, so `parseGramsPerUnit` correctly falls through to `return qty` (quantity IS grams directly). This is why the migration script below hardcodes that exact presentation string — do not change it to something else without re-checking `gram-utils.ts`.
- **`cultimed-store` has no `gram-utils.ts` of its own** — the monthly-gram compliance check only runs in `cultisoft` (staff-side). No changes needed there beyond the presentation-string detail above.
- **`cultisoft/app/(app)/inventory/new/page.tsx` needs NO code change.** The design spec asks for gram-based lot entry for the 2 consolidated products; the existing "Ingresar lote" form already has a plain, unit-agnostic "Cantidad recibida" integer field tied to whichever `product_id` is selected. Once Task 3 consolidates each variety into a single gram-based product, restocking through this same existing form naturally means entering grams — no unit-specific branching exists to update. Confirmed by reading the file in full before writing this plan; no task below touches it.
- **Checkout pricing is server-authoritative today and must stay that way.** `cultimed-store/app/api/checkout/route.ts` already ignores the `unitPrice` the client sends and recomputes `total = product.default_price * it.quantity` from a fresh DB read. We extend this exact line to branch on `price_tiers`, we do not replace the pattern.
- **Real confirmed data** (verified via a live read-only query against production before writing this plan):
  - Bourbon Street: old SKUs `BST-LIT-5G` ($44.990 total / $8.998 per g), `BST-LIT-10G` ($85.990 / $8.599 per g), `BST-LIT-20G` ($159.990 / $7.999,5 per g). `strain_key = bourbon-street-lit-farms`. Batches quantity_current: 48 + 27 + 15 = **90g total**.
  - Gaslight Purple Ghost: old SKUs `GASLIGHT-PURPLESATIVA-DOMINANTE-LIT-FARM-5g` ($44.990), `-10g` ($84.990 / $8.499 per g), `-20g` ($159.990). `strain_key = gaslight-purple-ghost-sativa-dominante-lit-farm`. Batches: 2 + 1 + 1 = **4g total**.
  - Confirmed 21g+ price for both: **$7.500/g fixed floor** (from user, not derivable from existing data).
  - Full 4-tier table (matches `docs/superpowers/specs/2026-07-04-venta-por-gramo-design.md` section B):

    | Gramos | Bourbon Street | Gaslight Purple Ghost |
    |---|---|---|
    | 1–5g   | $8.998/g   | $8.998/g   |
    | 6–10g  | $8.599/g   | $8.499/g   |
    | 11–20g | $7.999,5/g | $7.999,5/g |
    | 21g+   | $7.500/g   | $7.500/g   |

---

## Task 1: Shared pricing helper (cultisoft)

**Files:**
- Create: `cultisoft/lib/pricing.ts`

- [ ] **Step 1: Write the file**

```ts
// Escalera de precios por gramo — mismo código en cultisoft y cultimed-store.
// Ver docs/superpowers/specs/2026-07-04-venta-por-gramo-design.md sección B.

export interface PriceTier {
  desde_g: number;
  precio_g: number;
}

/**
 * Lee la columna jsonb `products.price_tiers`. postgres-js normalmente ya
 * la entrega como array parseado, pero por si llega como string (mismo caso
 * defensivo que patient-compliance.ts hace con prescription_ocr_data) lo
 * parseamos igual. Devuelve null si el producto no vende por tramos.
 */
export function parsePriceTiers(raw: unknown): PriceTier[] | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? (parsed as PriceTier[]) : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) return raw.length > 0 ? (raw as PriceTier[]) : null;
  return null;
}

/**
 * Precio total por comprar `gramos` gramos, según la tarifa del tramo más
 * alto alcanzado aplicada a TODA la compra (no marginal por tramo).
 * Ej: tiers = [1→8998, 6→8599, 11→7999.5, 21→7500], gramos=7 → 7 × 8599.
 */
export function calcularPrecioGramos(gramos: number, tiers: PriceTier[]): number {
  const ordenado = [...tiers].sort((a, b) => a.desde_g - b.desde_g).reverse();
  const tramo = ordenado.find((t) => gramos >= t.desde_g) ?? ordenado[ordenado.length - 1];
  return Math.round(gramos * tramo.precio_g);
}
```

- [ ] **Step 2: Type-check**

Run: `cd cultisoft && npx tsc --noEmit`
Expected: no new errors (existing baseline errors, if any, are pre-existing — only check that `lib/pricing.ts` itself reports clean).

- [ ] **Step 3: Commit**

```bash
git add cultisoft/lib/pricing.ts
git commit -m "Agrega calculo compartido de precio por tramos de gramos (cultisoft)"
```

---

## Task 2: Shared pricing helper (cultimed-store)

**Files:**
- Create: `cultimed-store/lib/pricing.ts`

- [ ] **Step 1: Write the file (identical content to Task 1)**

```ts
// Escalera de precios por gramo — mismo código en cultisoft y cultimed-store.
// Ver docs/superpowers/specs/2026-07-04-venta-por-gramo-design.md sección B.

export interface PriceTier {
  desde_g: number;
  precio_g: number;
}

/**
 * Lee la columna jsonb `products.price_tiers`. postgres-js normalmente ya
 * la entrega como array parseado, pero por si llega como string (mismo caso
 * defensivo que patient-compliance.ts hace con prescription_ocr_data) lo
 * parseamos igual. Devuelve null si el producto no vende por tramos.
 */
export function parsePriceTiers(raw: unknown): PriceTier[] | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? (parsed as PriceTier[]) : null;
    } catch {
      return null;
    }
  }
  if (Array.isArray(raw)) return raw.length > 0 ? (raw as PriceTier[]) : null;
  return null;
}

/**
 * Precio total por comprar `gramos` gramos, según la tarifa del tramo más
 * alto alcanzado aplicada a TODA la compra (no marginal por tramo).
 * Ej: tiers = [1→8998, 6→8599, 11→7999.5, 21→7500], gramos=7 → 7 × 8599.
 */
export function calcularPrecioGramos(gramos: number, tiers: PriceTier[]): number {
  const ordenado = [...tiers].sort((a, b) => a.desde_g - b.desde_g).reverse();
  const tramo = ordenado.find((t) => gramos >= t.desde_g) ?? ordenado[ordenado.length - 1];
  return Math.round(gramos * tramo.precio_g);
}
```

- [ ] **Step 2: Type-check**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add cultimed-store/lib/pricing.ts
git commit -m "Agrega calculo compartido de precio por tramos de gramos (cultimed-store)"
```

---

## Task 3: Data migration — consolidate products + batches

**Files:**
- Create: `cultisoft/scripts/migrate-gram-pricing.js`

This is a one-off Node script (plain JS, matches this repo's established convention for one-off DB scripts — no ts-node/esm). It is idempotent: if the new SKU already exists it skips that variety, so it's safe to re-run.

- [ ] **Step 1: Write the migration script**

```js
// scripts/migrate-gram-pricing.js
//
// Consolida Bourbon Street y Gaslight Purple Ghost de 3 SKUs fijos (5g/10g/20g)
// a 1 SKU por variedad con venta por gramo (columna products.price_tiers).
// Los 6 productos y 6 lotes viejos quedan archivados (is_active=0 / status=depleted),
// NUNCA se borran — preservan el historial de customer_order_items /
// dispensation_items que ya los referencian por product_id.
//
// Uso: node scripts/migrate-gram-pricing.js
// Seguro de re-ejecutar: si el SKU nuevo ya existe, salta esa variedad.

const fs = require("fs");
const path = require("path");
const postgres = require("postgres");

const envPath = path.join(__dirname, "..", ".env.local");
const envText = fs.readFileSync(envPath, "utf8");
const match = envText.match(/^DATABASE_URL=(.*)$/m);
if (!match) throw new Error("DATABASE_URL no encontrado en .env.local");
const DATABASE_URL = match[1].trim().replace(/^["']|["']$/g, "");

const sql = postgres(DATABASE_URL, { ssl: "require", prepare: false });

const VARIETIES = [
  {
    label: "Bourbon Street",
    oldSkus: ["BST-LIT-5G", "BST-LIT-10G", "BST-LIT-20G"],
    newSku: "BST-LIT-GRANEL",
    newName: "Bourbon Street – LIT Farms",
    batchPrefix: "BST-LIT-GRANEL-LOTE",
    tiers: [
      { desde_g: 1, precio_g: 8998 },
      { desde_g: 6, precio_g: 8599 },
      { desde_g: 11, precio_g: 7999.5 },
      { desde_g: 21, precio_g: 7500 },
    ],
  },
  {
    label: "Gaslight Purple Ghost",
    oldSkus: [
      "GASLIGHT-PURPLESATIVA-DOMINANTE-LIT-FARM-5g",
      "GASLIGHT-PURPLESATIVA-DOMINANTE-LIT-FARM-10g",
      "GASLIGHT-PURPLESATIVA-DOMINANTE-LIT-FARM-20g",
    ],
    newSku: "GASLIGHT-PURPLE-GRANEL",
    newName: "Gaslight PURPLE GHOST (Sativa Dominante) – LIT FARM",
    batchPrefix: "GASLIGHT-PURPLE-GRANEL-LOTE",
    tiers: [
      { desde_g: 1, precio_g: 8998 },
      { desde_g: 6, precio_g: 8499 },
      { desde_g: 11, precio_g: 7999.5 },
      { desde_g: 21, precio_g: 7500 },
    ],
  },
];

async function migrateVariety(v) {
  const existing = await sql`SELECT id FROM products WHERE sku = ${v.newSku}`;
  if (existing.length > 0) {
    console.log(`[skip] ${v.label}: ${v.newSku} ya existe (id ${existing[0].id}).`);
    return;
  }

  const oldProducts = await sql`
    SELECT id, sku, name, category, vendor, strain_key, description, image_url,
           is_house_brand, is_preorder, requires_prescription, is_controlled,
           thc_percentage, cbd_percentage
    FROM products WHERE sku IN ${sql(v.oldSkus)}
    ORDER BY default_price ASC
  `;
  if (oldProducts.length !== 3) {
    throw new Error(`${v.label}: esperaba 3 productos viejos, encontre ${oldProducts.length}.`);
  }
  const base = oldProducts[0];
  const oldIds = oldProducts.map((p) => p.id);

  const [batchSummary] = await sql`
    SELECT COALESCE(SUM(quantity_current), 0)::int AS total_g,
           MIN(expiry_date) AS min_expiry,
           MIN(manufacture_date) AS min_manufacture,
           MAX(supplier) AS supplier
    FROM batches WHERE product_id IN ${sql(oldIds)}
  `;
  const { total_g, min_expiry, min_manufacture, supplier } = batchSummary;
  if (total_g <= 0) {
    throw new Error(`${v.label}: stock total en 0g, revisa manualmente antes de migrar.`);
  }

  const notes = `Lote consolidado por migracion venta-por-gramo desde ${v.oldSkus.join(", ")}`;

  await sql.begin(async (tx) => {
    const [newProduct] = await tx`
      INSERT INTO products (
        sku, name, category, presentation, unit, default_price, price_tiers,
        vendor, strain_key, description, image_url,
        is_house_brand, is_preorder, requires_prescription, is_controlled,
        thc_percentage, cbd_percentage, is_active, shopify_status
      ) VALUES (
        ${v.newSku}, ${v.newName}, ${base.category}, 'Flor a granel', 'gramo',
        ${v.tiers[0].precio_g}, ${JSON.stringify(v.tiers)},
        ${base.vendor}, ${base.strain_key}, ${base.description}, ${base.image_url},
        ${base.is_house_brand}, ${base.is_preorder}, ${base.requires_prescription}, ${base.is_controlled},
        ${base.thc_percentage}, ${base.cbd_percentage}, 1, 'active'
      )
      RETURNING id
    `;

    await tx`
      INSERT INTO batches (
        product_id, batch_number, quantity_initial, quantity_current,
        price_per_unit, manufacture_date, expiry_date, supplier, status, notes
      ) VALUES (
        ${newProduct.id}, ${v.batchPrefix + "-" + Date.now()}, ${total_g}, ${total_g},
        ${v.tiers[0].precio_g}, ${min_manufacture}, ${min_expiry}, ${supplier}, 'available', ${notes}
      )
    `;

    await tx`UPDATE products SET is_active = 0, shopify_status = 'archived' WHERE id IN ${tx(oldIds)}`;
    await tx`UPDATE batches SET status = 'depleted' WHERE product_id IN ${tx(oldIds)} AND status = 'available'`;

    console.log(
      `[ok] ${v.label}: creado producto id=${newProduct.id} (${v.newSku}), lote de ${total_g}g. ` +
      `Archivados: ${oldProducts.map((p) => p.sku).join(", ")}.`
    );
  });
}

(async () => {
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS price_tiers jsonb`;
  for (const v of VARIETIES) {
    await migrateVariety(v);
  }
  await sql.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Run the migration**

Run: `cd cultisoft && node scripts/migrate-gram-pricing.js`
Expected output: two `[ok]` lines, one per variety, each reporting the new product id and a 90g / 4g batch respectively.

- [ ] **Step 3: Verify with a read-only query**

Run:
```bash
cd cultisoft && node -e "
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/^DATABASE_URL=(.*)$/m)[1].trim().replace(/^[\"']|[\"']\$/g, '');
const postgres = require('postgres');
const sql = postgres(url, { ssl: 'require', prepare: false });
(async () => {
  const rows = await sql\`SELECT id, sku, name, is_active, shopify_status, presentation, price_tiers FROM products WHERE sku IN ('BST-LIT-GRANEL','GASLIGHT-PURPLE-GRANEL','BST-LIT-5G','BST-LIT-10G','BST-LIT-20G','GASLIGHT-PURPLESATIVA-DOMINANTE-LIT-FARM-5g','GASLIGHT-PURPLESATIVA-DOMINANTE-LIT-FARM-10g','GASLIGHT-PURPLESATIVA-DOMINANTE-LIT-FARM-20g') ORDER BY sku\`;
  console.log(rows);
  await sql.end();
})();
"
```
Expected: the 2 new SKUs show `is_active=1, shopify_status='active', presentation='Flor a granel'`, with a populated `price_tiers` array; all 6 old SKUs show `is_active=0, shopify_status='archived'`.

- [ ] **Step 4: Commit**

```bash
git add cultisoft/scripts/migrate-gram-pricing.js
git commit -m "Migra Bourbon Street y Gaslight a venta por gramo (1 SKU + 1 lote por variedad)"
```

---

## Task 4: `GramPricePicker` component (cultimed-store)

**Files:**
- Create: `cultimed-store/components/GramPricePicker.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/lib/cart";
import { formatCLP } from "@/lib/format";
import { calcularPrecioGramos, type PriceTier } from "@/lib/pricing";

interface Props {
  productId: number;
  sku: string;
  productName: string;
  presentation: string | null;
  tiers: PriceTier[];
  totalStock: number;
}

export default function GramPricePicker({ productId, sku, productName, presentation, tiers, totalStock }: Props) {
  const router = useRouter();
  const { add } = useCart();
  const [grams, setGrams] = useState(1);
  const [added, setAdded] = useState(false);

  const sortedTiers = [...tiers].sort((a, b) => a.desde_g - b.desde_g);
  const activeTier = [...sortedTiers].reverse().find((t) => grams >= t.desde_g) ?? sortedTiers[0];
  const total = calcularPrecioGramos(grams, tiers);

  function handleAdd(goToCart: boolean) {
    if (totalStock <= 0) return;
    add({
      productId,
      sku,
      name: productName,
      presentation,
      unitPrice: activeTier.precio_g,
      quantity: grams,
      priceTiers: tiers,
    });
    setAdded(true);
    if (goToCart) {
      setTimeout(() => router.push("/carrito"), 300);
    } else {
      setTimeout(() => setAdded(false), 2000);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <span className="eyebrow">— Precio</span>
        {totalStock > 0 ? (
          <span className="pill-stock">En stock · {totalStock} g</span>
        ) : (
          <span className="pill-editorial text-ink-muted">Agotado</span>
        )}
      </div>
      <p className="font-display text-5xl font-light tabular-nums nums-lining -mt-3">
        {formatCLP(total)}
      </p>
      <p className="text-xs font-mono uppercase tracking-widest text-ink-muted">
        Tramo {activeTier.desde_g}g+ · {formatCLP(activeTier.precio_g)}/g
      </p>

      {totalStock > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center gap-4">
            <p className="eyebrow shrink-0">— Gramos</p>
            <div className="flex items-center border border-rule">
              <button
                type="button"
                onClick={() => setGrams((g) => Math.max(1, g - 1))}
                className="w-10 h-10 flex items-center justify-center hover:bg-paper-dim transition-colors"
                aria-label="Disminuir"
              >−</button>
              <span className="w-12 text-center font-mono nums-lining">{grams}g</span>
              <button
                type="button"
                onClick={() => setGrams((g) => Math.min(totalStock, g + 1))}
                className="w-10 h-10 flex items-center justify-center hover:bg-paper-dim transition-colors"
                aria-label="Aumentar"
              >+</button>
            </div>
            <span className="text-[11px] font-mono uppercase tracking-widest text-ink-muted ml-auto">
              máx. {totalStock}g
            </span>
          </div>
          <button type="button" onClick={() => handleAdd(false)} className="btn-brass w-full">
            {added ? "✓ Añadido al carrito" : `Añadir ${grams}g al carrito`}
          </button>
          <button type="button" onClick={() => handleAdd(true)} className="btn-link w-full justify-center">
            Comprar ahora →
          </button>

          <div className="pt-4 border-t border-rule-soft">
            <p className="text-[11px] font-mono uppercase tracking-widest text-ink-muted mb-2">
              — Escalera de precios
            </p>
            <ul className="text-xs font-mono text-ink-muted space-y-1">
              {sortedTiers.map((t, i) => {
                const next = sortedTiers[i + 1];
                const label = next ? `${t.desde_g}–${next.desde_g - 1}g` : `${t.desde_g}g+`;
                const isActive = t.desde_g === activeTier.desde_g;
                return (
                  <li key={t.desde_g} className={isActive ? "text-ink font-semibold" : ""}>
                    {label} · {formatCLP(t.precio_g)}/g
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: fails right now because `CartItem` (Task 6) doesn't have `priceTiers` yet — that's expected at this point in the plan; re-check after Task 6.

- [ ] **Step 3: Commit**

```bash
git add cultimed-store/components/GramPricePicker.tsx
git commit -m "Agrega selector de gramos con precio por tramos en vivo"
```

---

## Task 5: Wire `GramPricePicker` into the product detail page

**Files:**
- Modify: `cultimed-store/app/productos/[slug]/page.tsx`

- [ ] **Step 1: Add the import and the `price_tiers` field to `ProductFull`**

In `cultimed-store/app/productos/[slug]/page.tsx`, change:

```ts
import VariantPicker from "@/components/VariantPicker";
```

to:

```ts
import VariantPicker from "@/components/VariantPicker";
import GramPricePicker from "@/components/GramPricePicker";
import { parsePriceTiers } from "@/lib/pricing";
```

And add one field to the `ProductFull` interface (right after `strain_key: string | null;`):

```ts
interface ProductFull {
  id: number; sku: string; name: string; category: string; presentation: string | null;
  active_ingredient: string | null; concentration: string | null;
  thc_percentage: number | null; cbd_percentage: number | null;
  unit: string; requires_prescription: number; is_controlled: number;
  default_price: number; description: string | null; vendor: string | null;
  is_house_brand: number; is_preorder: number;
  image_url: string | null; strain_key: string | null;
  price_tiers: unknown;
}
```

- [ ] **Step 2: Compute `tiers` right after `totalStock`/`showPrice`**

Change:

```ts
  const totalStock = batches.reduce((s, b) => s + b.quantity_current, 0);
  const showPrice = canPurchase(customer);
```

to:

```ts
  const totalStock = batches.reduce((s, b) => s + b.quantity_current, 0);
  const showPrice = canPurchase(customer);
  const tiers = parsePriceTiers(product.price_tiers);
```

- [ ] **Step 3: Branch the picker**

Change:

```tsx
                {showPrice ? (
                  <VariantPicker
                    productName={cleanName}
                    category={product.category}
                    variants={siblingVariants}
                    initialVariantId={product.id}
                  />
                ) : customer ? (
```

to:

```tsx
                {showPrice ? (
                  tiers ? (
                    <GramPricePicker
                      productId={product.id}
                      sku={product.sku}
                      productName={cleanName}
                      presentation={product.presentation}
                      tiers={tiers}
                      totalStock={totalStock}
                    />
                  ) : (
                    <VariantPicker
                      productName={cleanName}
                      category={product.category}
                      variants={siblingVariants}
                      initialVariantId={product.id}
                    />
                  )
                ) : customer ? (
```

- [ ] **Step 4: Type-check**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: same pre-existing `CartItem.priceTiers` error as Task 4 until Task 6 lands; no other new errors in this file.

- [ ] **Step 5: Commit**

```bash
git add cultimed-store/app/productos/[slug]/page.tsx
git commit -m "Muestra selector de gramos en la ficha de producto para variedades con tramos"
```

---

## Task 6: `lib/cart.ts` — priceTiers + lineTotal

**Files:**
- Modify: `cultimed-store/lib/cart.ts`

- [ ] **Step 1: Add the import, extend `CartItem`, add `lineTotal`, use it in `subtotal`**

Change the top of the file:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

export interface CartItem {
  productId: number;
  sku: string;
  name: string;
  presentation: string | null;
  unitPrice: number;
  quantity: number;
  imageUrl?: string | null;
}
```

to:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { calcularPrecioGramos, type PriceTier } from "./pricing";

export interface CartItem {
  productId: number;
  sku: string;
  name: string;
  presentation: string | null;
  unitPrice: number;
  quantity: number;
  imageUrl?: string | null;
  priceTiers?: PriceTier[];
}

/**
 * Total de una línea del carrito. Si el item tiene price_tiers (venta por
 * gramo), el precio real se recalcula del tramo vigente para la cantidad
 * actual — así nunca queda desincronizado si el usuario sube/baja los
 * gramos. Para items sin tramos, es la multiplicación simple de siempre.
 */
export function lineTotal(item: CartItem): number {
  if (item.priceTiers && item.priceTiers.length > 0) {
    return calcularPrecioGramos(item.quantity, item.priceTiers);
  }
  return item.unitPrice * item.quantity;
}
```

Then change the `subtotal` line inside `useCart()`:

```ts
  const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
```

to:

```ts
  const subtotal = items.reduce((s, i) => s + lineTotal(i), 0);
```

- [ ] **Step 2: Type-check**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: the `CartItem.priceTiers` errors from Tasks 4–5 are now gone. No new errors.

- [ ] **Step 3: Commit**

```bash
git add cultimed-store/lib/cart.ts
git commit -m "Carrito calcula el total por linea via tramos de gramos cuando aplica"
```

---

## Task 7: Cart page uses `lineTotal`

**Files:**
- Modify: `cultimed-store/app/carrito/page.tsx`

- [ ] **Step 1: Import `lineTotal` and use it for the per-row price**

Change:

```ts
import { useCart } from "@/lib/cart";
```

to:

```ts
import { useCart, lineTotal } from "@/lib/cart";
```

Change:

```tsx
                  <div className="col-span-6 sm:col-span-2 sm:text-right mt-3 sm:mt-0">
                    <p className="font-mono text-base nums-lining tabular-nums">{formatCLP(it.unitPrice * it.quantity)}</p>
                  </div>
```

to:

```tsx
                  <div className="col-span-6 sm:col-span-2 sm:text-right mt-3 sm:mt-0">
                    <p className="font-mono text-base nums-lining tabular-nums">{formatCLP(lineTotal(it))}</p>
                  </div>
```

- [ ] **Step 2: Type-check**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add cultimed-store/app/carrito/page.tsx
git commit -m "Carrito: muestra total por linea correcto para productos por gramo"
```

---

## Task 8: Checkout summary uses `lineTotal`

**Files:**
- Modify: `cultimed-store/app/checkout/CheckoutClient.tsx`

- [ ] **Step 1: Import `lineTotal` and use it in the order summary list**

Change:

```ts
import { useCart } from "@/lib/cart";
```

to:

```ts
import { useCart, lineTotal } from "@/lib/cart";
```

Change:

```tsx
                    <span className="text-sm font-mono nums-lining tabular-nums shrink-0">
                      {formatCLP(it.unitPrice * it.quantity)}
                    </span>
```

to:

```tsx
                    <span className="text-sm font-mono nums-lining tabular-nums shrink-0">
                      {formatCLP(lineTotal(it))}
                    </span>
```

- [ ] **Step 2: Type-check**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add cultimed-store/app/checkout/CheckoutClient.tsx
git commit -m "Checkout: muestra total por linea correcto para productos por gramo"
```

---

## Task 9: Checkout API computes real total from `price_tiers`

**Files:**
- Modify: `cultimed-store/app/api/checkout/route.ts`

- [ ] **Step 1: Import the pricing helper**

Change:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentCustomer, canPurchase } from "@/lib/auth";
import { transaction, get } from "@/lib/db";
import { getActiveConversionForReferred, REFERRED_DISCOUNT_BPS } from "@/lib/referrals";
import { calcPaymentDiscount } from "@/lib/payments";
import { calcShippingFee } from "@/lib/shipping";
```

to:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentCustomer, canPurchase } from "@/lib/auth";
import { transaction, get } from "@/lib/db";
import { getActiveConversionForReferred, REFERRED_DISCOUNT_BPS } from "@/lib/referrals";
import { calcPaymentDiscount } from "@/lib/payments";
import { calcShippingFee } from "@/lib/shipping";
import { calcularPrecioGramos, parsePriceTiers } from "@/lib/pricing";
```

- [ ] **Step 2: Fetch `price_tiers` and branch the total calculation**

Change:

```ts
  for (const it of body.items) {
    const product = await get<{ default_price: number; name: string }>(
      `SELECT default_price, name FROM products WHERE id = ? AND is_active = 1 AND shopify_status = 'active'`,
      it.productId
    );
    if (!product) continue;
    if (it.quantity <= 0) continue;

    const stockRow = await get<{ available: number }>(
      `SELECT COALESCE(SUM(quantity_current), 0)::int AS available
       FROM batches WHERE product_id = ? AND status = 'available'`,
      it.productId
    );
    const available = stockRow?.available ?? 0;
    if (available < it.quantity) {
      outOfStock.push(`${product.name} — disponible: ${available}, pediste: ${it.quantity}`);
      continue;
    }

    const total = product.default_price * it.quantity;
    subtotal += total;
    validatedItems.push({
      productId: it.productId,
      qty: it.quantity,
      unitPrice: product.default_price,
      total,
      name: product.name,
    });
  }
```

to:

```ts
  for (const it of body.items) {
    const product = await get<{ default_price: number; name: string; price_tiers: unknown }>(
      `SELECT default_price, name, price_tiers FROM products WHERE id = ? AND is_active = 1 AND shopify_status = 'active'`,
      it.productId
    );
    if (!product) continue;
    if (it.quantity <= 0) continue;

    const stockRow = await get<{ available: number }>(
      `SELECT COALESCE(SUM(quantity_current), 0)::int AS available
       FROM batches WHERE product_id = ? AND status = 'available'`,
      it.productId
    );
    const available = stockRow?.available ?? 0;
    if (available < it.quantity) {
      outOfStock.push(`${product.name} — disponible: ${available}, pediste: ${it.quantity}`);
      continue;
    }

    const tiers = parsePriceTiers(product.price_tiers);
    const total = tiers ? calcularPrecioGramos(it.quantity, tiers) : product.default_price * it.quantity;
    const unitPrice = tiers ? Math.round(total / it.quantity) : product.default_price;
    subtotal += total;
    validatedItems.push({
      productId: it.productId,
      qty: it.quantity,
      unitPrice,
      total,
      name: product.name,
    });
  }
```

- [ ] **Step 2: Type-check**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add cultimed-store/app/api/checkout/route.ts
git commit -m "Checkout API calcula el cobro real via tramos de gramos server-side"
```

---

## Task 10: Catalog cards show "/g" instead of a flat price

**Files:**
- Modify: `cultimed-store/components/ProductCard.tsx`
- Modify: `cultimed-store/app/productos/page.tsx`
- Modify: `cultimed-store/app/productos/[slug]/page.tsx`

Without this fix, a gram-priced product would show its catalog card price as e.g. `$8.998` with no unit — reading exactly like the full price of the product, when it's actually the per-gram starting price. This task adds a `pricePerGram` flag so the card can label it correctly.

- [ ] **Step 1: Add `pricePerGram` prop to `ProductCard`**

In `cultimed-store/components/ProductCard.tsx`, change the props destructuring:

```tsx
export default function ProductCard({
  product: p,
  index = 0,
  showPrice = false,
  variants,
  aggregateStock,
  unavailable = false,
}: {
  product: ProductLite;
  index?: number;
  showPrice?: boolean;
  variants?: VariantLite[];
  aggregateStock?: number;
  unavailable?: boolean;
}) {
```

to:

```tsx
export default function ProductCard({
  product: p,
  index = 0,
  showPrice = false,
  variants,
  aggregateStock,
  unavailable = false,
  pricePerGram = false,
}: {
  product: ProductLite;
  index?: number;
  showPrice?: boolean;
  variants?: VariantLite[];
  aggregateStock?: number;
  unavailable?: boolean;
  pricePerGram?: boolean;
}) {
```

Then change the price row:

```tsx
        ) : showPrice ? (
          <span className="font-mono text-sm text-ink nums-lining">
            {hasVariants && minPrice !== maxPrice ? (
              <>desde {formatCLP(minPrice)}</>
            ) : (
              formatCLP(p.default_price)
            )}
          </span>
        ) : (
```

to:

```tsx
        ) : showPrice ? (
          <span className="font-mono text-sm text-ink nums-lining">
            {hasVariants && minPrice !== maxPrice ? (
              <>desde {formatCLP(minPrice)}</>
            ) : pricePerGram ? (
              <>desde {formatCLP(p.default_price)}/g</>
            ) : (
              formatCLP(p.default_price)
            )}
          </span>
        ) : (
```

- [ ] **Step 2: Pass `price_tiers` through the catalog page and thread `pricePerGram`**

In `cultimed-store/app/productos/page.tsx`, add `price_tiers: unknown;` to the `CatalogProduct` interface (right after `total_stock: number;`):

```ts
interface CatalogProduct {
  id: number;
  sku: string;
  name: string;
  category: string;
  presentation: string | null;
  default_price: number;
  thc_percentage: number | null;
  cbd_percentage: number | null;
  vendor: string | null;
  is_house_brand: number;
  description: string | null;
  image_url: string | null;
  strain_key: string | null;
  is_active: number;
  shopify_status: string | null;
  total_stock: number;
  price_tiers: unknown;
}
```

Add `p.price_tiers` to the SELECT:

```ts
  const products = await all<CatalogProduct>(
    `SELECT p.id, p.sku, p.name, p.category, p.presentation, p.default_price,
       p.thc_percentage, p.cbd_percentage, p.vendor, p.is_house_brand, p.description,
       p.image_url, p.strain_key, p.is_active, p.shopify_status, p.price_tiers,
       COALESCE((SELECT SUM(quantity_current) FROM batches b WHERE b.product_id = p.id AND b.status = 'available'), 0) as total_stock
     FROM products p
     WHERE ${where.join(" AND ")}
     ORDER BY ${order}
     LIMIT 200`,
    ...params
  );
```

And pass the prop at the render site:

```tsx
              <ProductCard
                key={s.head.id}
                product={{ ...s.head, slug: s.head.sku.toLowerCase() }}
                index={i}
                showPrice={showPrice}
                variants={s.variants}
                aggregateStock={s.total_stock}
                unavailable={!(s.head.is_active === 1 && s.head.shopify_status === "active")}
                pricePerGram={Boolean(s.head.price_tiers)}
              />
```

- [ ] **Step 3: Same passthrough for the "related products" carousel**

In `cultimed-store/app/productos/[slug]/page.tsx`, add `p.price_tiers` to the `related` query:

```ts
  const related = await all<any>(
    `SELECT DISTINCT ON (p.strain_key) p.id, p.sku, p.name, p.category, p.presentation, p.default_price,
       p.thc_percentage, p.cbd_percentage, p.vendor, p.is_house_brand, p.description, p.image_url, p.strain_key,
       p.price_tiers
     FROM products p
     WHERE p.category = ?
       AND p.strain_key != ?
       AND p.is_active = 1
       AND p.shopify_status = 'active'
     ORDER BY p.strain_key, p.default_price ASC
     LIMIT 6`,
    product.category, product.strain_key || ""
  );
```

And pass the prop at the render site:

```tsx
            {related.map((p, i) => (
              <ProductCard
                key={p.id}
                product={{ ...p, slug: p.sku.toLowerCase() }}
                index={i}
                showPrice={showPrice}
                pricePerGram={Boolean(p.price_tiers)}
              />
            ))}
```

- [ ] **Step 4: Type-check**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add cultimed-store/components/ProductCard.tsx cultimed-store/app/productos/page.tsx cultimed-store/app/productos/[slug]/page.tsx
git commit -m "Catalogo: aclara que el precio de flores por gramo es por gramo, no total"
```

---

## Task 11: Let patients re-upload any of the 5 documents from Perfil

**Files:**
- Create: `cultimed-store/components/DocumentUpload.tsx`
- Modify: `cultimed-store/app/mi-cuenta/perfil/page.tsx`

Today only the prescription has a re-upload path (`/mi-cuenta/recetas`); the other 4 documents (`id_front`, `id_back`, `criminal_record`, `rights_assignment`) can only be fixed by staff editing the DB directly. The upload plumbing (`/api/uploads/sign` + `/api/uploads/attach` + `uploadAndAttach()`) already supports all 5 targets — this task is UI-only.

- [ ] **Step 1: Create the generic upload control**

```tsx
"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadAndAttach, UploadError, type UploadTarget } from "@/lib/client-upload";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

export default function DocumentUpload({
  target,
  label,
  uploaded,
}: {
  target: Exclude<UploadTarget, "payment_proof">;
  label: string;
  uploaded: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("El archivo supera 8 MB.");
      return;
    }
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
      setError("Formato no aceptado. Sube PDF, JPG o PNG.");
      return;
    }
    setPending(true);
    try {
      await uploadAndAttach(target, file);
      router.refresh();
    } catch (err) {
      setError(err instanceof UploadError ? err.message : "No pudimos subir el archivo. Intenta de nuevo.");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="py-3 border-b border-rule-soft">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-ink">{label}</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-xs font-mono ${uploaded ? "text-forest" : "text-ink-subtle"}`}>
            {uploaded ? "Subido" : "Falta"}
          </span>
          <label className="text-[11px] uppercase tracking-widest font-mono text-ink-muted hover:text-ink border-b border-ink/20 hover:border-ink pb-0.5 cursor-pointer transition-colors">
            {pending ? "Subiendo…" : uploaded ? "Reemplazar" : "Subir"}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              onChange={onChange}
              disabled={pending}
              className="sr-only"
            />
          </label>
        </div>
      </div>
      {error && <p className="text-xs text-sangria mt-1.5">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the Perfil page's document list**

In `cultimed-store/app/mi-cuenta/perfil/page.tsx`, add the import and a target map right after the existing imports/interfaces:

```ts
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { get, run } from "@/lib/db";
import DocumentUpload from "@/components/DocumentUpload";
import type { UploadTarget } from "@/lib/client-upload";
```

Right after the `DOC_LABELS` array, add:

```ts
const DOC_TARGET_MAP: Record<(typeof DOC_LABELS)[number]["key"], Exclude<UploadTarget, "payment_proof">> = {
  id_front_url: "id_front",
  id_back_url: "id_back",
  criminal_record_url: "criminal_record",
  prescription_url: "prescription",
  rights_assignment_url: "rights_assignment",
};
```

Replace the static row-rendering block:

```tsx
          <div className="space-y-3">
            {DOC_LABELS.map((d) => {
              const uploaded = Boolean(docs[d.key]);
              return (
                <div key={d.key} className="flex items-center justify-between py-3 border-b border-rule-soft">
                  <span className="text-sm text-ink">{d.label}</span>
                  <span className={`text-xs font-mono ${uploaded ? "text-forest" : "text-ink-subtle"}`}>
                    {uploaded ? "Subido" : "Falta"}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-ink-muted mt-6 leading-relaxed">
            Si falta algún documento, súbelo desde{" "}
            <Link href="/mi-cuenta/recetas" className="underline underline-offset-4 hover:text-ink">
              Mis recetas
            </Link>
            . La documentación completa es necesaria para acceder al catálogo.
          </p>
```

with:

```tsx
          <div className="space-y-0">
            {DOC_LABELS.map((d) => (
              <DocumentUpload
                key={d.key}
                target={DOC_TARGET_MAP[d.key]}
                label={d.label}
                uploaded={Boolean(docs[d.key])}
              />
            ))}
          </div>

          <p className="text-xs text-ink-muted mt-6 leading-relaxed">
            Puedes subir o reemplazar cualquier documento directamente aquí. La documentación
            completa es necesaria para acceder al catálogo; una receta reemplazada vuelve a
            quedar pendiente de revisión por nuestro QF.
          </p>
```

- [ ] **Step 3: Type-check**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add cultimed-store/components/DocumentUpload.tsx cultimed-store/app/mi-cuenta/perfil/page.tsx
git commit -m "Permite resubir cualquiera de los 5 documentos desde el perfil del paciente"
```

---

## Task 12: Price-tier editing on the product form (cultisoft)

**Files:**
- Modify: `cultisoft/app/(app)/products/[id]/edit/page.tsx`

- [ ] **Step 1: Import the pricing helper and add `price_tiers` to `ProductFull`**

Change:

```ts
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole, requireOpsRole } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
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
}
```

to:

```ts
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
```

- [ ] **Step 2: Parse submitted tiers and save them in `updateProduct`**

Add this helper function right after `optionalNumber` (before `updateProduct`):

```ts
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
```

Change the `updateProduct` body:

```ts
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

  if (!id || !sku || !name || !category || !defaultPrice || !strainKey) redirect(`/products/${id}/edit?e=incomplete`);

  try {
    await run(
      `UPDATE products SET sku = ?, name = ?, category = ?, presentation = ?, active_ingredient = ?,
        concentration = ?, thc_percentage = ?, cbd_percentage = ?, unit = ?, requires_prescription = ?,
        is_controlled = ?, default_price = ?, description = ?, vendor = ?, is_house_brand = ?,
        is_preorder = ?, shopify_status = ?, is_active = ?, image_url = ?, strain_key = ?
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
      defaultPrice,
      optionalString(formData, "description"),
      optionalString(formData, "vendor"),
      formData.get("is_house_brand") === "1" ? 1 : 0,
      formData.get("is_preorder") === "1" ? 1 : 0,
      shopifyStatus,
      isActive,
      optionalString(formData, "image_url"),
      strainKey,
      id
    );
    await logAudit({ staffId: staff.id, action: "product_updated", entityType: "product", entityId: id, details: { sku, name, strainKey, isActive } });
    redirect("/products?updated=1");
  } catch (err: any) {
    if (String(err).includes("UNIQUE")) redirect(`/products/${id}/edit?e=duplicate`);
    throw err;
  }
}
```

to:

```ts
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
      defaultPrice,
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
```

- [ ] **Step 3: Add the form section**

In `ProductForm`, add a new `Section` right after the "Datos clínicos" section and before "Web y cumplimiento":

```tsx
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
          Deja los 4 tramos en blanco si este producto usa precio fijo normal.
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
```

- [ ] **Step 4: Type-check**

Run: `cd cultisoft && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "cultisoft/app/(app)/products/[id]/edit/page.tsx"
git commit -m "Agrega edicion de tramos de precio por gramo en ficha de producto"
```

---

## Task 13: Dashboard splits out abandoned orders

**Files:**
- Modify: `cultisoft/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Add `abandonedWebOrders` to `Counts` and compute it**

Change:

```ts
interface Counts {
  patients: number;
  patientsActive: number;
  newPatientsThisMonth: number;
  todayWebOrders: number;
  todayWebRevenue: number;
  pendingWebOrders: number;
  pendingRx: number;
  totalLowStock: number;
  totalExpiringSoon: number;
  pendingWebRx: number;
}
```

to:

```ts
interface Counts {
  patients: number;
  patientsActive: number;
  newPatientsThisMonth: number;
  todayWebOrders: number;
  todayWebRevenue: number;
  pendingWebOrders: number;
  abandonedWebOrders: number;
  pendingRx: number;
  totalLowStock: number;
  totalExpiringSoon: number;
  pendingWebRx: number;
}
```

Change:

```ts
    pendingWebOrders: (await get<{ c: number }>(`SELECT COUNT(*) as c FROM customer_orders WHERE status IN ('pending_payment','proof_uploaded','preparing')`))?.c ?? 0,
```

to:

```ts
    pendingWebOrders: (await get<{ c: number }>(`SELECT COUNT(*) as c FROM customer_orders WHERE status IN ('proof_uploaded','preparing') OR (status = 'pending_payment' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')`))?.c ?? 0,
    abandonedWebOrders: (await get<{ c: number }>(`SELECT COUNT(*) as c FROM customer_orders WHERE status = 'pending_payment' AND created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'`))?.c ?? 0,
```

- [ ] **Step 2: Add the alert section right after the existing "Pedidos web por gestionar" block**

Change:

```tsx
      {/* ─── Web orders ─── */}
      {counts.pendingWebOrders > 0 && (
        <section className="mb-10">
          <Link
            href="/web-orders"
            className="group flex items-center gap-4 p-5 bg-forest/10 border-l-2 border-forest hover:bg-forest/15 transition-colors"
          >
            <span className="editorial-numeral text-base text-forest/60 shrink-0">— WEB</span>
            <div className="flex-1 min-w-0">
              <p className="eyebrow text-forest">Pedidos web por gestionar</p>
              <p className="font-display text-xl mt-1 leading-tight">
                <span className="font-light">{counts.pendingWebOrders}</span>{" "}
                <span className="italic text-base text-ink-muted">
                  {counts.pendingWebOrders === 1 ? "pedido esperando pago, preparación o envío" : "pedidos esperando pago, preparación o envío"}
                </span>
              </p>
            </div>
            <span className="text-ink-muted group-hover:translate-x-1 transition-transform shrink-0" aria-hidden>→</span>
          </Link>
        </section>
      )}
```

to:

```tsx
      {/* ─── Web orders ─── */}
      {counts.pendingWebOrders > 0 && (
        <section className="mb-10">
          <Link
            href="/web-orders"
            className="group flex items-center gap-4 p-5 bg-forest/10 border-l-2 border-forest hover:bg-forest/15 transition-colors"
          >
            <span className="editorial-numeral text-base text-forest/60 shrink-0">— WEB</span>
            <div className="flex-1 min-w-0">
              <p className="eyebrow text-forest">Pedidos web por gestionar</p>
              <p className="font-display text-xl mt-1 leading-tight">
                <span className="font-light">{counts.pendingWebOrders}</span>{" "}
                <span className="italic text-base text-ink-muted">
                  {counts.pendingWebOrders === 1 ? "pedido esperando pago, preparación o envío" : "pedidos esperando pago, preparación o envío"}
                </span>
              </p>
            </div>
            <span className="text-ink-muted group-hover:translate-x-1 transition-transform shrink-0" aria-hidden>→</span>
          </Link>
        </section>
      )}

      {/* ─── Abandoned orders ─── */}
      {counts.abandonedWebOrders > 0 && (
        <section className="mb-10">
          <Link
            href="/web-orders?status=pending_payment"
            className="group flex items-center gap-4 p-5 bg-paper-dim border-l-2 border-ink-subtle hover:bg-paper-bright transition-colors"
          >
            <span className="editorial-numeral text-base text-ink-subtle/60 shrink-0">— ABD</span>
            <div className="flex-1 min-w-0">
              <p className="eyebrow text-ink-muted">Pedidos abandonados</p>
              <p className="font-display text-xl mt-1 leading-tight">
                <span className="font-light">{counts.abandonedWebOrders}</span>{" "}
                <span className="italic text-base text-ink-muted">
                  {counts.abandonedWebOrders === 1 ? "pedido sin pago hace más de 7 días" : "pedidos sin pago hace más de 7 días"}
                </span>
              </p>
            </div>
            <span className="text-ink-muted group-hover:translate-x-1 transition-transform shrink-0" aria-hidden>→</span>
          </Link>
        </section>
      )}
```

- [ ] **Step 3: Type-check**

Run: `cd cultisoft && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "cultisoft/app/(app)/dashboard/page.tsx"
git commit -m "Dashboard separa pedidos abandonados (+7 dias sin pago) de los pendientes activos"
```

---

## Task 14: Outreach page adds 2 segments

**Files:**
- Modify: `cultisoft/app/(app)/patients/outreach/page.tsx`

- [ ] **Step 1: Add `prescription_reviewed_at` to `AccountRow` and its SELECT**

Change:

```ts
interface AccountRow {
  id: number;
  email: string;
  full_name: string | null;
  rut: string | null;
  patient_id: number | null;
  prescription_status: string;
  prescription_url: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  criminal_record_url: string | null;
  rights_assignment_url: string | null;
  created_at: string;
  matched_patient_id: number;
}
```

to:

```ts
interface AccountRow {
  id: number;
  email: string;
  full_name: string | null;
  rut: string | null;
  patient_id: number | null;
  prescription_status: string;
  prescription_url: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  criminal_record_url: string | null;
  rights_assignment_url: string | null;
  prescription_reviewed_at: string | null;
  created_at: string;
  matched_patient_id: number;
}
```

Change the `accounts` query's SELECT list:

```ts
  const accounts = await all<AccountRow>(
    `SELECT
       c.id,
       c.email,
       c.full_name,
       c.rut,
       c.patient_id,
       c.prescription_status,
       c.prescription_url,
       c.id_front_url,
       c.id_back_url,
       c.criminal_record_url,
       c.rights_assignment_url,
       c.created_at,
       p.id AS matched_patient_id
     FROM customer_accounts c
```

to:

```ts
  const accounts = await all<AccountRow>(
    `SELECT
       c.id,
       c.email,
       c.full_name,
       c.rut,
       c.patient_id,
       c.prescription_status,
       c.prescription_url,
       c.id_front_url,
       c.id_back_url,
       c.criminal_record_url,
       c.rights_assignment_url,
       c.prescription_reviewed_at,
       c.created_at,
       p.id AS matched_patient_id
     FROM customer_accounts c
```

- [ ] **Step 2: Add the 2 new derived lists right after `incompleteDocs.sort(...)`**

Change:

```ts
  incompleteDocs.sort((a, b) => a.docs_uploaded - b.docs_uploaded);

  const missingData: MissingDataRow[] = patients
```

to:

```ts
  incompleteDocs.sort((a, b) => a.docs_uploaded - b.docs_uploaded);

  const zeroDocs = incompleteDocs.filter((r) => r.docs_uploaded === 0);

  interface RejectedRxRow {
    id: number;
    full_name: string;
    rut: string | null;
    account_id: number;
    reviewed_at: string | null;
  }

  const rejectedRx: RejectedRxRow[] = [];
  for (const p of patients) {
    const linked = accountsByPatient.get(p.id) || [];
    const rejected = linked.find((a) => a.prescription_status === "rechazada");
    if (!rejected) continue;
    rejectedRx.push({
      id: p.id,
      full_name: p.full_name,
      rut: p.rut,
      account_id: rejected.id,
      reviewed_at: rejected.prescription_reviewed_at,
    });
  }
  rejectedRx.sort((a, b) => new Date(b.reviewed_at || 0).getTime() - new Date(a.reviewed_at || 0).getTime());

  const missingData: MissingDataRow[] = patients
```

- [ ] **Step 3: Add 2 KPI tiles to the existing grid**

Change:

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
        <KpiCard
          numeral="I"
          label="Sin receta válida"
          value={formatNumber(noValidRx.length)}
          tone="error"
        />
        <KpiCard
          numeral="II"
          label="Docs incompletos"
          value={formatNumber(incompleteDocs.length)}
          tone="warning"
        />
        <KpiCard
          numeral="III"
          label="Datos faltantes"
          value={formatNumber(missingData.length)}
          tone="warning"
        />
        <KpiCard
          numeral="IV"
          label="Cuentas sin vincular"
          value={formatNumber(unlinkedCount)}
          tone="neutral"
        />
      </div>
```

to:

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
        <KpiCard
          numeral="I"
          label="Sin receta válida"
          value={formatNumber(noValidRx.length)}
          tone="error"
        />
        <KpiCard
          numeral="II"
          label="Docs incompletos"
          value={formatNumber(incompleteDocs.length)}
          tone="warning"
        />
        <KpiCard
          numeral="III"
          label="Datos faltantes"
          value={formatNumber(missingData.length)}
          tone="warning"
        />
        <KpiCard
          numeral="IV"
          label="Cuentas sin vincular"
          value={formatNumber(unlinkedCount)}
          tone="neutral"
        />
        <KpiCard
          numeral="V"
          label="Sin ningún documento"
          value={formatNumber(zeroDocs.length)}
          tone="warning"
        />
        <KpiCard
          numeral="VI"
          label="Receta rechazada sin resubir"
          value={formatNumber(rejectedRx.length)}
          tone="error"
        />
      </div>
```

- [ ] **Step 4: Add the 2 new tables right after the "Cuentas web sin vincular" `OutreachTable`, before the closing "Criterios de segmentación" block**

Change:

```tsx
      </OutreachTable>

      <div className="p-4 bg-paper-dim/30 border border-rule-soft">
```

to:

```tsx
      </OutreachTable>

      <OutreachTable title="Sin ningún documento subido" numeral="V" count={zeroDocs.length}>
        {zeroDocs.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Todas las cuentas vinculadas subieron al menos 1 documento.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>RUT</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {zeroDocs.slice(0, TOP_N).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/patients/${r.id}`} className="font-semibold text-on-surface hover:text-primary">
                        {r.full_name}
                      </Link>
                    </td>
                    <td className="font-mono text-[12px] text-on-surface-variant">{r.rut || "—"}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-3 text-xs">
                        <Link href={`/patients/${r.id}`} className="font-semibold text-primary hover:underline">
                          Ficha
                        </Link>
                        <Link href={`/web-prescriptions/${r.account_id}`} className="font-semibold text-primary hover:underline">
                          Receta web
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutreachTable>

      <OutreachTable title="Receta rechazada sin resubir" numeral="VI" count={rejectedRx.length}>
        {rejectedRx.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            No hay cuentas con receta rechazada pendiente de resubida.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>RUT</th>
                  <th>Rechazada</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rejectedRx.slice(0, TOP_N).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/patients/${r.id}`} className="font-semibold text-on-surface hover:text-primary">
                        {r.full_name}
                      </Link>
                    </td>
                    <td className="font-mono text-[12px] text-on-surface-variant">{r.rut || "—"}</td>
                    <td className="text-on-surface-variant text-xs">
                      {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString("es-CL") : "—"}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-3 text-xs">
                        <Link href={`/patients/${r.id}`} className="font-semibold text-primary hover:underline">
                          Ficha
                        </Link>
                        <Link href={`/web-prescriptions/${r.account_id}`} className="font-semibold text-primary hover:underline">
                          Receta web
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutreachTable>

      <div className="p-4 bg-paper-dim/30 border border-rule-soft">
```

Then, in the "Criterios de segmentación" bullet list at the very end, change:

```tsx
          <li>
            <strong className="text-ink">Cuentas sin vincular:</strong> cuenta web detectada por RUT/email sin{" "}
            <code className="font-mono text-[12px] bg-paper-bright px-1 py-0.5">patient_id</code> asignado.
          </li>
        </ul>
```

to:

```tsx
          <li>
            <strong className="text-ink">Cuentas sin vincular:</strong> cuenta web detectada por RUT/email sin{" "}
            <code className="font-mono text-[12px] bg-paper-bright px-1 py-0.5">patient_id</code> asignado.
          </li>
          <li>
            <strong className="text-ink">Sin ningún documento:</strong> cuenta vinculada con 0 de 5 documentos cargados.
          </li>
          <li>
            <strong className="text-ink">Receta rechazada sin resubir:</strong> cuenta cuya receta web está actualmente en estado rechazada.
          </li>
        </ul>
```

- [ ] **Step 5: Type-check**

Run: `cd cultisoft && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add "cultisoft/app/(app)/patients/outreach/page.tsx"
git commit -m "Campana datos: agrega segmentos de 0 documentos y receta rechazada sin resubir"
```

---

## Task 15: Full builds

**Files:** none (verification only)

- [ ] **Step 1: Build cultisoft**

Run: `cd cultisoft && npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 2: Build cultimed-store**

Run: `cd cultimed-store && npm run build`
Expected: build succeeds with no type errors.

---

## Task 16: End-to-end manual test (disposable test account)

No automated e2e framework exists in this repo — this repeats the same disposable-account methodology already used earlier in this session (create test data → exercise it → delete everything, including Supabase Storage objects and any inventory decrement).

- [ ] **Step 1: Start both dev servers** (via the Claude_Preview tool, not raw `npm run dev` in a terminal) using the existing `cultisoft-dev` (port 3030) and `cultimed-store-dev` (port 3000) launch configs.

- [ ] **Step 2: Register a new disposable test patient** on `cultimed-store` (unique test email, valid-format test RUT), upload placeholder files for all 5 required documents.

- [ ] **Step 3: In cultisoft, approve the test patient's prescription** as QF (`/web-prescriptions`), so `prescription_status = 'aprobada'` and the storefront catalog unlocks.

- [ ] **Step 4: On the storefront, open the Bourbon Street product page** (`/productos/bst-lit-granel`). Verify:
  - No "Formato" pill row is shown (single consolidated product, no siblings).
  - The gram stepper defaults to 1g, price shows `$8.998` and "Tramo 1g+ · $8.998/g".
  - Step up to 7g: price recalculates to `7 × $8.599 = $60.193` and the label switches to "Tramo 6g+ · $8.599/g" — the 6–10g row in the price-ladder list should be bold/highlighted.
  - Step to 22g: price is `22 × $7.500 = $165.000`, tier label "Tramo 21g+ · $7.500/g".

- [ ] **Step 5: Add 7g to cart, go to `/carrito`.** Verify the line total shows `$60.193` (not `unitPrice × quantity` using a stale per-gram value), and the cart's quantity +/- steppers correctly recompute the line total live when nudging quantity across a tier boundary (e.g. from 10g to 11g should visibly drop the per-gram rate).

- [ ] **Step 6: Proceed to `/checkout`.** Verify the order summary line matches the cart's total, complete the order, and confirm the created order's `customer_order_items.total_price` in the DB equals `calcularPrecioGramos(7, tiers)` exactly (query via a disposable node script, same pattern as this session's earlier ultra-test).

- [ ] **Step 7: In cultisoft's `/web-orders/[id]`,** verify the item row shows quantity `7`, a sensible unit price (~$8.599), and the correct total.

- [ ] **Step 8: On the test patient's `/mi-cuenta/perfil`,** click "Reemplazar" next to "Carnet por delante" (a non-prescription document), upload a new placeholder file, and verify the page refreshes showing "Subido" without a full navigation (and without resetting `prescription_status`, since that column is untouched for non-prescription targets).

- [ ] **Step 9: In cultisoft's `/dashboard`,** confirm the new "Pedidos abandonados" section only appears if there is a real `pending_payment` order older than 7 days (the 8 real abandoned orders found earlier this session should now show there), and that the test order just created (which is NOT abandoned) is correctly excluded from that count while still counted in "Pedidos web por gestionar" until it's paid/cancelled.

- [ ] **Step 10: In cultisoft's `/patients/outreach`,** confirm the 2 new KPI tiles ("Sin ningún documento", "Receta rechazada sin resubir") render with sane counts and their tables list real, previously-identified patients (the 18 zero-document registrations and 3 rejected-never-resubmitted accounts found during this session's earlier audit).

- [ ] **Step 11: Clean up.** Delete the disposable test patient, test account, test order, and any Supabase Storage objects created in steps 2–8. Restore the Bourbon Street batch's `quantity_current` by the 7g consumed in step 6 (add 7 back). Verify via a final SELECT that no test rows remain.
