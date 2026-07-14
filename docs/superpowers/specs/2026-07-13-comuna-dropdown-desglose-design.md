# Comuna con buscador (RM) + desglose del pedido — Diseño

**Fecha:** 2026-07-13
**Estado:** aprobado por Oscar (solo RM, sin regiones; desglose completo; a producción)

## Objetivo

1. Reemplazar el campo de texto libre de comuna en el checkout por un buscador
   desplegable de las 52 comunas de la Región Metropolitana, para que el cobro de
   despacho se clasifique sin errores de tipeo. Cultimed solo despacha dentro de
   la RM.
2. Mostrar el desglose del cobro (subtotal, descuentos, despacho, total) en las 3
   vistas de pedido que hoy solo muestran el total.

## Contexto

- Tarifas ya existen en `cultimed-store/lib/shipping.ts`: urbano $4.990, alejada
  $9.990, gratis sobre $100.000. La lógica es server-authoritative (la API de
  checkout recalcula, `app/api/checkout/route.ts:100`).
- Hoy la comuna y la región son campos de texto libre en `CheckoutClient.tsx`
  (líneas 181-197) → error de tipeo = mala clasificación.
- La lista de comunas alejadas está hardcodeada solo en `shipping.ts` (16 comunas)
  y le **faltan Alhué y San Pedro** (rurales de la provincia de Melipilla) → hoy
  quien vive ahí paga $4.990 en vez de $9.990. Se corrige.
- Las 3 vistas de pedido muestran solo el total, sin despacho ni descuentos:
  `cultimed-store/app/checkout/[id]/page.tsx`,
  `cultimed-store/app/mi-cuenta/pedidos/[id]/page.tsx`,
  `cultisoft/app/(app)/web-orders/[id]/page.tsx` (este usa `SELECT o.*`).
- El `shipping_fee` NO se guarda como columna, pero es derivable exacto de valores
  ya almacenados: `despacho = total − subtotal + referral_discount_amount +
  payment_discount_amount`. Verificado con el pedido del screenshot (subtotal
  $104.784, total $94.306, descuento 10% $10.478 → despacho $0, gratis sobre $100k).

## Alcance

### 1. Dataset único de comunas RM — `cultimed-store/lib/comunas-rm.ts` (nuevo)

Única fuente de verdad. Las 52 comunas de la RM, cada una con flag `outlying`
(true = $9.990, false = $4.990). Región siempre "RM".

```ts
export interface Comuna { name: string; outlying: boolean; }
export const COMUNAS_RM: Comuna[] = [ /* 52, alfabético */ ];
export function normalizeComuna(v: string | null | undefined): string; // NFD, sin tildes, trim, lower
export const OUTLYING_COMUNA_KEYS: Set<string>; // derivado: keys normalizadas de las outlying
```

**Urbano (34, outlying:false):** Cerrillos, Cerro Navia, Conchalí, El Bosque,
Estación Central, Huechuraba, Independencia, La Cisterna, La Florida, La Granja,
La Pintana, La Reina, Las Condes, Lo Barnechea, Lo Espejo, Lo Prado, Macul,
Maipú, Ñuñoa, Pedro Aguirre Cerda, Peñalolén, Providencia, Pudahuel, Puente Alto,
Quilicura, Quinta Normal, Recoleta, Renca, San Bernardo, San Joaquín, San Miguel,
San Ramón, Santiago, Vitacura.

**Alejada (18, outlying:true):** Alhué, Buin, Calera de Tango, Colina, Curacaví,
El Monte, Isla de Maipo, Lampa, María Pinto, Melipilla, Padre Hurtado, Paine,
Peñaflor, Pirque, San José de Maipo, San Pedro, Talagante, Til Til.

### 2. `shipping.ts` deriva del dataset (sin duplicar la lista)

`shipping.ts` importa `OUTLYING_COMUNA_KEYS` y `normalizeComuna` de `comunas-rm.ts`,
elimina su propio `OUTLYING_RM_COMMUNES`. La API pública NO cambia
(`calcShippingFee`, `isOutlyingShippingZone`, `URBAN_SHIPPING_FEE`,
`OUTLYING_SHIPPING_FEE`, `FREE_SHIPPING_THRESHOLD`). Se mantiene el chequeo de
región no-RM → alejada (robustez para pedidos históricos).

### 3. Componente buscador — `cultimed-store/components/ComunaCombobox.tsx` (nuevo)

Client component: input de texto que filtra la lista de `COMUNAS_RM` en vivo, con
lista desplegable navegable por teclado y táctil (mobile-first, es para la app).
Estilo del design system (`input-editorial`). Props: `value`, `onChange(name)`,
`name` (para el form field oculto `shipping_city`). Al elegir una comuna, setea
el valor; el `shipping_region` queda fijo en "RM". Sin librerías nuevas.

### 4. `CheckoutClient.tsx`

- Reemplaza el `<input name="shipping_city">` de texto libre por `<ComunaCombobox>`.
- Elimina el `<input name="shipping_region">` (ya no se pregunta); se envía
  `shipping_region = "RM"` fijo (hidden input o en el payload).
- El cálculo reactivo de despacho (`calcShippingFee`) ya existe y sigue igual.

### 5. Helper de desglose — `lib/order-breakdown.ts` (copia gemela en ambas apps)

Función pura, deriva el desglose de las columnas ya guardadas:

```ts
export interface OrderBreakdown {
  subtotal: number; referralDiscount: number; paymentDiscount: number;
  shippingFee: number; total: number;
}
export function computeOrderBreakdown(o: {
  subtotal: number; total: number;
  referral_discount_amount?: number | null; payment_discount_amount?: number | null;
}): OrderBreakdown;
// shippingFee = max(0, total - subtotal + referralDiscount + paymentDiscount)
```

Copia idéntica en `cultimed-store/lib/` y `cultisoft/lib/` (patrón pricing.ts,
con header de copia gemela).

### 6. Desglose en las 3 vistas

Cada vista renderiza, entre Subtotal y Total: `− Descuento transferencia` (si >0),
`− Descuento embajador` (si >0), `Despacho $X` (o "Gratis" si 0), luego **Total**.

- `cultisoft/app/(app)/web-orders/[id]/page.tsx`: insertar filas en la tabla de
  totales (entre Subtotal ~línea 478-479 y Total ~482-483). `SELECT o.*` ya trae
  las columnas; agregar `referral_discount_amount` y `payment_discount_amount` a
  la interfaz `OrderFull`.
- `cultimed-store/app/checkout/[id]/page.tsx`: agregar filas antes del Total
  (~línea 225). Agregar los 2 campos de descuento al SELECT y a la interfaz.
- `cultimed-store/app/mi-cuenta/pedidos/[id]/page.tsx`: idem (~línea 78). Agregar
  los 2 campos al SELECT y a la interfaz.

## Verificación

- Unit test de `comunas-rm.ts` + `shipping.ts`: las 52 comunas presentes;
  Talagante/Melipilla/Alhué/San Pedro → outlying ($9.990); Santiago/Providencia/
  Maipú → urbano ($4.990); >$100k → gratis. (tsx, temporal.)
- Unit test de `computeOrderBreakdown`: caso del screenshot (104784/94306/desc
  10478 → despacho 0) y un caso con despacho 9990.
- `npx tsc --noEmit` y `npm run build` verdes en ambas apps.
- Dev server: el buscador filtra al tipear "tala" → Talagante; elegir comuna
  setea el campo; el despacho reactivo muestra $9.990. Las 3 vistas muestran el
  desglose (curl/inspección del HTML de un pedido real).
- Copias `order-breakdown.ts` byte-idénticas entre apps.

## Fuera de alcance

- Cambiar tarifas o el flujo de pago (transferencia).
- Guardar `shipping_fee` como columna (se deriva; si a futuro se quiere explícito,
  se agrega la columna entonces).
- El formulario de creación manual de pedidos del admin (`web-orders/new`) —
  puede migrar al buscador en una pasada futura.
