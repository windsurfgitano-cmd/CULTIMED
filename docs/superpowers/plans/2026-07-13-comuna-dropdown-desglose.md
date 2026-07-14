# Comuna con buscador (RM) + desglose del pedido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el campo de comuna de texto libre por un buscador de las 52 comunas de la RM (clasificación de despacho sin errores de tipeo) y mostrar el desglose del cobro (subtotal, descuentos, despacho, total) en las 3 vistas de pedido.

**Architecture:** Un dataset único `comunas-rm.ts` es la fuente de verdad; `shipping.ts` deriva de él. Un `ComunaCombobox` controlado reemplaza el input libre en el checkout. Un helper puro `computeOrderBreakdown` deriva el despacho de columnas ya guardadas (sin migración) y alimenta el desglose en las 3 vistas. Spec: `docs/superpowers/specs/2026-07-13-comuna-dropdown-desglose-design.md`.

**Tech Stack:** Next.js 14 App Router, React client components, tsx para tests de funciones puras. Cero librerías nuevas.

## Global Constraints

- Worktree: crear con superpowers:using-git-worktrees, rama `feature/comuna-desglose`; copiar a mano `cultimed-store/.env.local` y `cultisoft/.env.local` (gitignored, para builds).
- Puertos 3000/3030 OCUPADOS. Dev tienda: `npx next dev -p 3005`; dev cultisoft: `npx next dev -p 3006`. Matar por PID al terminar; nunca tocar otros puertos.
- Commits en español, cortos, sin punto final, desde la raíz del worktree.
- Tests de funciones puras: archivo temporal `.mts` (tsx compila `-e` a CJS y falla con top-level await/import), correr con `npx -y tsx scripts/<x>.mts`, borrar al terminar.
- Solo RM: la región siempre es "RM". No se despacha a regiones.
- El código de cada task es EXACTO — cópialo fiel, no lo "mejores".

---

### Task 1: Dataset único de comunas RM

**Files:**
- Create: `cultimed-store/lib/comunas-rm.ts`
- Test: `cultimed-store/scripts/test-comunas.mts` (temporal)

**Interfaces:**
- Produces: `interface Comuna { name: string; outlying: boolean }`; `COMUNAS_RM: Comuna[]` (52); `normalizeComuna(v: string|null|undefined): string`; `OUTLYING_COMUNA_KEYS: Set<string>`; `filterComunas(query: string): Comuna[]`.

- [ ] **Step 1: Escribir el test**

```ts
// cultimed-store/scripts/test-comunas.mts — npx -y tsx scripts/test-comunas.mts
import { COMUNAS_RM, normalizeComuna, OUTLYING_COMUNA_KEYS, filterComunas } from "../lib/comunas-rm";

let fails = 0;
const ok = (cond: boolean, label: string) => { console.log(`${cond ? "✓" : "✗"} ${label}`); if (!cond) fails++; };

ok(COMUNAS_RM.length === 52, `son 52 comunas (hay ${COMUNAS_RM.length})`);
ok(COMUNAS_RM.filter((c) => c.outlying).length === 18, "18 alejadas");
ok(COMUNAS_RM.filter((c) => !c.outlying).length === 34, "34 urbanas");
ok(OUTLYING_COMUNA_KEYS.has(normalizeComuna("Talagante")), "Talagante alejada");
ok(OUTLYING_COMUNA_KEYS.has(normalizeComuna("Alhué")), "Alhué alejada (nueva)");
ok(OUTLYING_COMUNA_KEYS.has(normalizeComuna("San Pedro")), "San Pedro alejada (nueva)");
ok(!OUTLYING_COMUNA_KEYS.has(normalizeComuna("Santiago")), "Santiago urbana");
ok(!OUTLYING_COMUNA_KEYS.has(normalizeComuna("Maipú")), "Maipú urbana");
ok(filterComunas("tala").length === 1 && filterComunas("tala")[0].name === "Talagante", "filtro 'tala' → Talagante");
ok(filterComunas("ñuñ").some((c) => c.name === "Ñuñoa"), "filtro sin tildes 'ñuñ' → Ñuñoa");
ok(filterComunas("").length === 52, "filtro vacío → todas");
ok(normalizeComuna(" PROVIDENCIA ") === "providencia", "normaliza espacios y mayúsculas");

process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Correr el test (falla, módulo no existe)**

Run: `cd cultimed-store && npx -y tsx scripts/test-comunas.mts`
Expected: error `Cannot find module '../lib/comunas-rm'`.

- [ ] **Step 3: Implementar `lib/comunas-rm.ts`**

```ts
// Única fuente de verdad de las comunas de la Región Metropolitana y su zona de
// despacho. Cultimed solo despacha dentro de la RM: urbano ($4.990) o alejada
// ($9.990). shipping.ts deriva de aquí — no duplicar la lista.

export interface Comuna {
  name: string;
  /** true = zona alejada ($9.990); false = urbano ($4.990) */
  outlying: boolean;
}

export const COMUNAS_RM: Comuna[] = [
  { name: "Alhué", outlying: true },
  { name: "Buin", outlying: true },
  { name: "Calera de Tango", outlying: true },
  { name: "Cerrillos", outlying: false },
  { name: "Cerro Navia", outlying: false },
  { name: "Colina", outlying: true },
  { name: "Conchalí", outlying: false },
  { name: "Curacaví", outlying: true },
  { name: "El Bosque", outlying: false },
  { name: "El Monte", outlying: true },
  { name: "Estación Central", outlying: false },
  { name: "Huechuraba", outlying: false },
  { name: "Independencia", outlying: false },
  { name: "Isla de Maipo", outlying: true },
  { name: "La Cisterna", outlying: false },
  { name: "La Florida", outlying: false },
  { name: "La Granja", outlying: false },
  { name: "La Pintana", outlying: false },
  { name: "La Reina", outlying: false },
  { name: "Lampa", outlying: true },
  { name: "Las Condes", outlying: false },
  { name: "Lo Barnechea", outlying: false },
  { name: "Lo Espejo", outlying: false },
  { name: "Lo Prado", outlying: false },
  { name: "Macul", outlying: false },
  { name: "Maipú", outlying: false },
  { name: "María Pinto", outlying: true },
  { name: "Melipilla", outlying: true },
  { name: "Ñuñoa", outlying: false },
  { name: "Padre Hurtado", outlying: true },
  { name: "Paine", outlying: true },
  { name: "Pedro Aguirre Cerda", outlying: false },
  { name: "Peñaflor", outlying: true },
  { name: "Peñalolén", outlying: false },
  { name: "Pirque", outlying: true },
  { name: "Providencia", outlying: false },
  { name: "Pudahuel", outlying: false },
  { name: "Puente Alto", outlying: false },
  { name: "Quilicura", outlying: false },
  { name: "Quinta Normal", outlying: false },
  { name: "Recoleta", outlying: false },
  { name: "Renca", outlying: false },
  { name: "San Bernardo", outlying: false },
  { name: "San Joaquín", outlying: false },
  { name: "San José de Maipo", outlying: true },
  { name: "San Miguel", outlying: false },
  { name: "San Pedro", outlying: true },
  { name: "San Ramón", outlying: false },
  { name: "Santiago", outlying: false },
  { name: "Talagante", outlying: true },
  { name: "Til Til", outlying: true },
  { name: "Vitacura", outlying: false },
];

export function normalizeComuna(v: string | null | undefined): string {
  return (v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export const OUTLYING_COMUNA_KEYS: Set<string> = new Set(
  COMUNAS_RM.filter((c) => c.outlying).map((c) => normalizeComuna(c.name))
);

/** Filtra las comunas por texto (sin tildes, case-insensitive). Query vacío → todas. */
export function filterComunas(query: string): Comuna[] {
  const q = normalizeComuna(query);
  if (!q) return COMUNAS_RM;
  return COMUNAS_RM.filter((c) => normalizeComuna(c.name).includes(q));
}
```

- [ ] **Step 4: Correr el test hasta verde**

Run: `npx -y tsx scripts/test-comunas.mts`
Expected: 13 líneas `✓`, exit 0.

- [ ] **Step 5: Borrar temporal y commitear**

```bash
rm scripts/test-comunas.mts
git add lib/comunas-rm.ts
git commit -m "Dataset unico de comunas RM (52) con zona de despacho"
```

---

### Task 2: shipping.ts deriva del dataset

**Files:**
- Modify: `cultimed-store/lib/shipping.ts`
- Test: `cultimed-store/scripts/test-shipping.mts` (temporal)

**Interfaces:**
- Consumes: `OUTLYING_COMUNA_KEYS`, `normalizeComuna` de `./comunas-rm`.
- Produces: API sin cambios — `FREE_SHIPPING_THRESHOLD=100000`, `URBAN_SHIPPING_FEE=4990`, `OUTLYING_SHIPPING_FEE=9990`, `isOutlyingShippingZone(city, region?)`, `calcShippingFee(subtotal, city, region?)`.

- [ ] **Step 1: Escribir el test**

```ts
// cultimed-store/scripts/test-shipping.mts — npx -y tsx scripts/test-shipping.mts
import { calcShippingFee, isOutlyingShippingZone, URBAN_SHIPPING_FEE, OUTLYING_SHIPPING_FEE } from "../lib/shipping";

let fails = 0;
const eq = (a: unknown, b: unknown, label: string) => { const ok = a === b; console.log(`${ok ? "✓" : "✗"} ${label}: ${a}`); if (!ok) fails++; };

eq(calcShippingFee(30000, "Santiago", "RM"), URBAN_SHIPPING_FEE, "Santiago urbano 4990");
eq(calcShippingFee(30000, "Providencia", "RM"), URBAN_SHIPPING_FEE, "Providencia urbano 4990");
eq(calcShippingFee(30000, "Talagante", "RM"), OUTLYING_SHIPPING_FEE, "Talagante alejada 9990");
eq(calcShippingFee(30000, "Alhué", "RM"), OUTLYING_SHIPPING_FEE, "Alhué alejada 9990 (nueva)");
eq(calcShippingFee(30000, "San Pedro", "RM"), OUTLYING_SHIPPING_FEE, "San Pedro alejada 9990 (nueva)");
eq(calcShippingFee(30000, "TALAGANTE", "RM"), OUTLYING_SHIPPING_FEE, "mayúsculas ok");
eq(calcShippingFee(120000, "Talagante", "RM"), 0, "sobre 100k gratis");
eq(isOutlyingShippingZone("Valparaiso", "Valparaiso"), true, "región no-RM histórica → alejada");

process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Correr el test (pasa parcial — Alhué/San Pedro fallan con el shipping.ts viejo)**

Run: `cd cultimed-store && npx -y tsx scripts/test-shipping.mts`
Expected: fallan las líneas de Alhué y San Pedro (el shipping.ts actual no las tiene), el resto pasa.

- [ ] **Step 3: Reemplazar TODO el contenido de `lib/shipping.ts` por:**

```ts
import { OUTLYING_COMUNA_KEYS, normalizeComuna } from "./comunas-rm";

export const FREE_SHIPPING_THRESHOLD = 100000;
export const URBAN_SHIPPING_FEE = 4990;
export const OUTLYING_SHIPPING_FEE = 9990;

// Alias de la RM: si la región es la RM, la tarifa la decide la comuna;
// cualquier otra región (data histórica — hoy solo despachamos RM) → alejada.
const RM_ALIASES = new Set([
  "rm",
  "region metropolitana",
  "metropolitana",
  "santiago",
]);

export function isOutlyingShippingZone(city: string | null | undefined, region?: string | null): boolean {
  const normalizedRegion = normalizeComuna(region);
  if (normalizedRegion && !RM_ALIASES.has(normalizedRegion)) return true;
  return OUTLYING_COMUNA_KEYS.has(normalizeComuna(city));
}

export function calcShippingFee(subtotal: number, city: string | null | undefined, region?: string | null): number {
  if (subtotal > FREE_SHIPPING_THRESHOLD) return 0;
  return isOutlyingShippingZone(city, region) ? OUTLYING_SHIPPING_FEE : URBAN_SHIPPING_FEE;
}
```

- [ ] **Step 4: Correr el test hasta verde**

Run: `npx -y tsx scripts/test-shipping.mts`
Expected: 8 líneas `✓`, exit 0.

- [ ] **Step 5: tsc + borrar temporal + commit**

Run: `npx tsc --noEmit`
Expected: sin errores.

```bash
rm scripts/test-shipping.mts
git add lib/shipping.ts
git commit -m "shipping deriva la lista de comunas alejadas del dataset (+ Alhue, San Pedro)"
```

---

### Task 3: Componente ComunaCombobox

**Files:**
- Create: `cultimed-store/components/ComunaCombobox.tsx`

**Interfaces:**
- Consumes: `COMUNAS_RM`, `filterComunas` de `@/lib/comunas-rm`.
- Produces: `<ComunaCombobox value={string} onChange={(comuna: string) => void} placeholder?={string} />` — selector controlado. `value` = comuna válida seleccionada o "". Llama `onChange` con el nombre exacto de la comuna al elegir, o "" si se limpia. NO renderiza input oculto (el form field lo pone el consumidor).

- [ ] **Step 1: Implementar el componente**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { filterComunas } from "@/lib/comunas-rm";

interface ComunaComboboxProps {
  value: string;
  onChange: (comuna: string) => void;
  placeholder?: string;
}

export default function ComunaCombobox({ value, onChange, placeholder = "Busca tu comuna" }: ComunaComboboxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Refleja el valor externo (p. ej. reset del form) en el texto visible.
  useEffect(() => { setQuery(value); }, [value]);

  // Cerrar al clickear fuera; al cerrar, el texto vuelve a la selección válida.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(value);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [value]);

  const matches = filterComunas(query);

  function select(name: string) {
    onChange(name);
    setQuery(name);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) { setOpen(true); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, matches.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && open && matches[highlight]) { e.preventDefault(); select(matches[highlight].name); }
    else if (e.key === "Escape") { setOpen(false); setQuery(value); }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        type="text"
        autoComplete="off"
        className="input-editorial w-full"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.currentTarget.value);
          if (value) onChange(""); // invalida la selección mientras se re-tipea
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-auto bg-paper-bright border border-rule shadow-editorial">
          {matches.map((c, i) => (
            <li
              key={c.name}
              onMouseDown={(e) => { e.preventDefault(); select(c.name); }}
              onMouseEnter={() => setHighlight(i)}
              className={
                "px-4 py-2.5 text-sm cursor-pointer flex justify-between items-baseline gap-3 " +
                (i === highlight ? "bg-paper-dim text-ink" : "text-ink-muted")
              }
            >
              <span>{c.name}</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle nums-lining shrink-0">
                {c.outlying ? "$9.990" : "$4.990"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {open && query.trim() && matches.length === 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 bg-paper-bright border border-rule px-4 py-3 text-sm text-ink-muted">
          Solo despachamos dentro de la Región Metropolitana.
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/ComunaCombobox.tsx
git commit -m "ComunaCombobox: buscador de comunas RM mobile-first"
```

---

### Task 4: Wire del combobox en CheckoutClient

**Files:**
- Modify: `cultimed-store/app/checkout/CheckoutClient.tsx`

**Interfaces:**
- Consumes: `ComunaCombobox` de `@/components/ComunaCombobox`.

- [ ] **Step 1: Agregar el import** (junto a los imports existentes, tras el import de `ScrollReveal`):

```ts
import ComunaCombobox from "@/components/ComunaCombobox";
```

- [ ] **Step 2: Reemplazar el bloque de inputs comuna+región** (el `<div className="grid grid-cols-2 gap-4">` con los dos `<input name="shipping_city">` y `<input name="shipping_region">`, líneas ~180-197) por:

```tsx
                <ComunaCombobox value={shippingCity} onChange={setShippingCity} />
                <input type="hidden" name="shipping_city" value={shippingCity} />
                <input type="hidden" name="shipping_region" value="RM" />
```

(El `<input name="shipping_address">` de arriba y su contenedor `space-y-4` quedan igual; solo cambia el sub-bloque de comuna/región.)

- [ ] **Step 3: Fijar la región y quitar el estado sobrante.** Buscar la declaración `const [shippingRegion, setShippingRegion] = useState("RM");` y eliminarla. Buscar donde se usa `shippingRegion` en el cálculo reactivo (`calcShippingFee(subtotal, shippingCity, shippingRegion)`) y reemplazar por `calcShippingFee(subtotal, shippingCity, "RM")`.

- [ ] **Step 4: Bloquear submit sin comuna válida.** En `handleSubmit`, justo después de `setSubmitting(true); setError(null);` (o al inicio del try), agregar la guarda:

```tsx
    if (!shippingCity) {
      setError("Elige tu comuna de la lista de despacho.");
      setSubmitting(false);
      return;
    }
```

- [ ] **Step 5: tsc + build**

Run: `cd cultimed-store && npx tsc --noEmit && npm run build`
Expected: ambos verdes.

- [ ] **Step 6: Smoke en dev server** (puerto 3005): `npx next dev -p 3005`, abrir `http://localhost:3005/checkout` requiere login+carrito; en su lugar verificar que la ruta compila y no lanza en el log del server (`grep -i error` en el output). Matar server por PID. (El flujo interactivo completo se prueba en la verificación integral / por Oscar en la app.)

- [ ] **Step 7: Commit**

```bash
git add app/checkout/CheckoutClient.tsx
git commit -m "Checkout: comuna con buscador RM, region fija, guarda submit"
```

---

### Task 5: Helper de desglose (copia gemela en ambas apps)

**Files:**
- Create: `cultimed-store/lib/order-breakdown.ts`
- Create: `cultisoft/lib/order-breakdown.ts`
- Test: `cultimed-store/scripts/test-breakdown.mts` (temporal)

**Interfaces:**
- Produces: `interface OrderBreakdown { subtotal, referralDiscount, paymentDiscount, shippingFee, total: number }`; `computeOrderBreakdown(o): OrderBreakdown`.

- [ ] **Step 1: Escribir el test**

```ts
// cultimed-store/scripts/test-breakdown.mts — npx -y tsx scripts/test-breakdown.mts
import { computeOrderBreakdown } from "../lib/order-breakdown";

let fails = 0;
const eq = (a: unknown, b: unknown, label: string) => { const ok = a === b; console.log(`${ok ? "✓" : "✗"} ${label}: ${a}`); if (!ok) fails++; };

// Caso del screenshot: subtotal 104784, total 94306, desc transferencia 10478 → despacho 0 (gratis sobre 100k)
const a = computeOrderBreakdown({ subtotal: 104784, total: 94306, payment_discount_amount: 10478, referral_discount_amount: 0 });
eq(a.shippingFee, 0, "screenshot: despacho gratis");
eq(a.paymentDiscount, 10478, "screenshot: descuento transferencia");

// Caso con despacho alejado: subtotal 30000, desc 10% 3000, despacho 9990 → total 36990
const b = computeOrderBreakdown({ subtotal: 30000, total: 36990, payment_discount_amount: 3000, referral_discount_amount: 0 });
eq(b.shippingFee, 9990, "alejada: despacho 9990");

// Nulls/undefined tolerados
const c = computeOrderBreakdown({ subtotal: 20000, total: 24990 });
eq(c.shippingFee, 4990, "sin descuentos: despacho 4990");
eq(c.referralDiscount, 0, "descuentos nulos → 0");

process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Correr el test (falla, módulo no existe)**

Run: `cd cultimed-store && npx -y tsx scripts/test-breakdown.mts`
Expected: `Cannot find module '../lib/order-breakdown'`.

- [ ] **Step 3: Crear `cultimed-store/lib/order-breakdown.ts`**

```ts
// Mismo código en cultisoft y cultimed-store — sincronizar ambas copias a mano.
// Deriva el desglose del cobro desde columnas ya guardadas del pedido; el
// despacho no se almacena aparte, se calcula: total - subtotal + descuentos.

export interface OrderBreakdown {
  subtotal: number;
  referralDiscount: number;
  paymentDiscount: number;
  shippingFee: number;
  total: number;
}

export function computeOrderBreakdown(o: {
  subtotal: number;
  total: number;
  referral_discount_amount?: number | null;
  payment_discount_amount?: number | null;
}): OrderBreakdown {
  const subtotal = Number(o.subtotal) || 0;
  const total = Number(o.total) || 0;
  const referralDiscount = Number(o.referral_discount_amount) || 0;
  const paymentDiscount = Number(o.payment_discount_amount) || 0;
  const shippingFee = Math.max(0, total - subtotal + referralDiscount + paymentDiscount);
  return { subtotal, referralDiscount, paymentDiscount, shippingFee, total };
}
```

- [ ] **Step 4: Correr el test hasta verde**

Run: `npx -y tsx scripts/test-breakdown.mts`
Expected: 5 líneas `✓`, exit 0.

- [ ] **Step 5: Copiar idéntico a cultisoft y verificar**

```bash
cp lib/order-breakdown.ts ../cultisoft/lib/order-breakdown.ts
diff lib/order-breakdown.ts ../cultisoft/lib/order-breakdown.ts && echo IDENTICOS
```
Expected: `IDENTICOS`.

- [ ] **Step 6: Borrar temporal + commit**

```bash
rm scripts/test-breakdown.mts
git add cultimed-store/lib/order-breakdown.ts cultisoft/lib/order-breakdown.ts
git commit -m "Helper computeOrderBreakdown (copia gemela) deriva el despacho"
```

---

### Task 6: Desglose en el panel admin (cultisoft)

**Files:**
- Modify: `cultisoft/app/(app)/web-orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `computeOrderBreakdown` de `@/lib/order-breakdown`.

- [ ] **Step 1: Import + campos en la interfaz.** Agregar el import junto a los existentes:

```ts
import { computeOrderBreakdown } from "@/lib/order-breakdown";
```

En la interfaz `OrderFull` (que ya tiene `subtotal`, `total`), agregar:

```ts
  referral_discount_amount: number | null;
  payment_discount_amount: number | null;
```

(El `SELECT o.*` ya trae estas columnas; solo faltaba tiparlas.)

- [ ] **Step 2: Calcular el desglose.** En el componente, después de obtener `o` (el pedido) y antes del `return`, agregar:

```ts
  const bd = computeOrderBreakdown(o);
```

- [ ] **Step 3: Insertar las filas de desglose.** En la tabla de totales, entre la fila de `Subtotal` (`<td ...>Subtotal</td><td ...>{formatCLP(o.subtotal)}</td>`) y la fila de `Total`, insertar:

```tsx
                  {bd.paymentDiscount > 0 && (
                    <tr>
                      <td colSpan={3} className="px-5 py-2 text-right eyebrow text-ink-subtle">Descuento transferencia</td>
                      <td className="px-5 py-2 text-right tabular-nums font-mono text-forest">−{formatCLP(bd.paymentDiscount)}</td>
                    </tr>
                  )}
                  {bd.referralDiscount > 0 && (
                    <tr>
                      <td colSpan={3} className="px-5 py-2 text-right eyebrow text-ink-subtle">Descuento embajador</td>
                      <td className="px-5 py-2 text-right tabular-nums font-mono text-forest">−{formatCLP(bd.referralDiscount)}</td>
                    </tr>
                  )}
                  <tr>
                    <td colSpan={3} className="px-5 py-2 text-right eyebrow text-ink-subtle">Despacho</td>
                    <td className="px-5 py-2 text-right tabular-nums font-mono text-ink">{bd.shippingFee > 0 ? formatCLP(bd.shippingFee) : "Gratis"}</td>
                  </tr>
```

- [ ] **Step 4: tsc + build**

Run: `cd cultisoft && npx tsc --noEmit && npm run build`
Expected: ambos verdes.

- [ ] **Step 5: Commit**

```bash
git add "cultisoft/app/(app)/web-orders/[id]/page.tsx"
git commit -m "Panel pedido: muestra desglose (descuentos + despacho)"
```

---

### Task 7: Desglose en las 2 vistas del cliente (cultimed-store)

**Files:**
- Modify: `cultimed-store/app/checkout/[id]/page.tsx`
- Modify: `cultimed-store/app/mi-cuenta/pedidos/[id]/page.tsx`

**Interfaces:**
- Consumes: `computeOrderBreakdown` de `@/lib/order-breakdown`.

- [ ] **Step 1: `checkout/[id]/page.tsx` — import + interfaz.** Agregar el import:

```ts
import { computeOrderBreakdown } from "@/lib/order-breakdown";
```

En la interfaz `OrderRow`, agregar tras `subtotal: number; total: number;`:

```ts
  referral_discount_amount: number | null; payment_discount_amount: number | null;
```

(El `SELECT *` ya trae las columnas.)

- [ ] **Step 2: `checkout/[id]` — calcular y renderizar.** Tras obtener `order`, antes del `return`, agregar `const bd = computeOrderBreakdown(order);`. En el bloque de resumen que hoy muestra solo el Total (la fila `<span className="font-display text-base">Total</span> ... {formatCLP(order.total)}`, ~línea 225), insertar ANTES de esa fila de Total:

```tsx
              <div className="flex justify-between text-sm text-ink-muted">
                <span>Subtotal</span>
                <span className="font-mono nums-lining tabular-nums">{formatCLP(bd.subtotal)}</span>
              </div>
              {bd.paymentDiscount > 0 && (
                <div className="flex justify-between text-sm text-forest">
                  <span>Descuento transferencia</span>
                  <span className="font-mono nums-lining tabular-nums">−{formatCLP(bd.paymentDiscount)}</span>
                </div>
              )}
              {bd.referralDiscount > 0 && (
                <div className="flex justify-between text-sm text-forest">
                  <span>Descuento embajador</span>
                  <span className="font-mono nums-lining tabular-nums">−{formatCLP(bd.referralDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm text-ink-muted">
                <span>Despacho</span>
                <span className="font-mono nums-lining tabular-nums">{bd.shippingFee > 0 ? formatCLP(bd.shippingFee) : "Gratis"}</span>
              </div>
```

(Si el contenedor de la fila Total no es un flex vertical con `space-y`, envolver estas filas + la de Total en un `<div className="space-y-2">`. Ajustar al markup real manteniendo las clases del entorno.)

- [ ] **Step 3: `mi-cuenta/pedidos/[id]/page.tsx` — import + interfaz.** Agregar el import:

```ts
import { computeOrderBreakdown } from "@/lib/order-breakdown";
```

En el tipo del `get<{...}>` del pedido (que ya tiene `subtotal: number; total: number;`), agregar:

```ts
    referral_discount_amount: number | null;
    payment_discount_amount: number | null;
```

- [ ] **Step 4: `mi-cuenta/pedidos/[id]` — renderizar.** Tras obtener `order`, agregar `const bd = computeOrderBreakdown(order);`. Reemplazar la fila única de Total (`<div className="px-5 py-4 flex justify-between font-display text-xl"><span>Total</span><span ...>{formatCLP(order.total)}</span></div>`, ~línea 77-80) por:

```tsx
            <div className="px-5 py-3 flex justify-between text-sm text-ink-muted">
              <span>Subtotal</span>
              <span className="font-mono tabular-nums">{formatCLP(bd.subtotal)}</span>
            </div>
            {bd.paymentDiscount > 0 && (
              <div className="px-5 py-3 flex justify-between text-sm text-forest">
                <span>Descuento transferencia</span>
                <span className="font-mono tabular-nums">−{formatCLP(bd.paymentDiscount)}</span>
              </div>
            )}
            {bd.referralDiscount > 0 && (
              <div className="px-5 py-3 flex justify-between text-sm text-forest">
                <span>Descuento embajador</span>
                <span className="font-mono tabular-nums">−{formatCLP(bd.referralDiscount)}</span>
              </div>
            )}
            <div className="px-5 py-3 flex justify-between text-sm text-ink-muted">
              <span>Despacho</span>
              <span className="font-mono tabular-nums">{bd.shippingFee > 0 ? formatCLP(bd.shippingFee) : "Gratis"}</span>
            </div>
            <div className="px-5 py-4 flex justify-between font-display text-xl">
              <span>Total</span>
              <span className="tabular-nums">{formatCLP(order.total)}</span>
            </div>
```

- [ ] **Step 5: tsc + build**

Run: `cd cultimed-store && npx tsc --noEmit && npm run build`
Expected: ambos verdes.

- [ ] **Step 6: Commit**

```bash
git add "cultimed-store/app/checkout/[id]/page.tsx" "cultimed-store/app/mi-cuenta/pedidos/[id]/page.tsx"
git commit -m "Vistas cliente: desglose de subtotal, descuentos y despacho"
```

---

### Task 8: Verificación integral

**Files:** ninguno nuevo.

- [ ] **Step 1: Builds completos**

Run: `cd cultimed-store && npm run build && cd ../cultisoft && npm run build`
Expected: ambos verdes.

- [ ] **Step 2: Desglose contra un pedido real (read-only).** Script node (patrón repo: cargar `.env.local` de cultimed-store + postgres, max 1) que tome el pedido más reciente con descuento y verifique que `computeOrderBreakdown` cuadra: imprimir subtotal, payment_discount_amount, referral_discount_amount, total, y el shippingFee derivado; confirmar `subtotal - descuentos + shippingFee === total`. Reportar los valores.

- [ ] **Step 3: Smoke del combobox** (dev tienda puerto 3005): `npx next dev -p 3005`; `curl -s http://localhost:3005/checkout -o /dev/null -w "%{http_code}"` → 307 (redirect a login, ruta compila). Confirmar en `grep -i "error\|failed"` del log del server que no hay errores de compilación de CheckoutClient/ComunaCombobox. Matar server por PID.

- [ ] **Step 4: git status limpio; `git log --oneline main..HEAD` lista ~8 commits.**

- [ ] **Step 5: Anunciar listo para merge** — usar superpowers:finishing-a-development-branch.

**Post-merge (Oscar):** en la app, hacer un pedido de prueba a Talagante → ver despacho $9.990 en el checkout y el desglose completo en la confirmación y en el panel.
