# Venta de flores por gramo + limpieza de pacientes/documentos abandonados

## Contexto

Hoy Bourbon Street y Gaslight Purple Ghost se venden como 3 productos fijos cada uno
(5g/10g/20g), cada uno con su propio lote de inventario. El stock real llega a granel
y se pesa al momento de vender — no hay bolsas pre-armadas. Esto genera SKUs
redundantes en el catálogo/inventario y no deja comprar cantidades intermedias (ej. 7g).

Aceites (Aceite Sublingual Calma, 10ML/30ML) quedan **fuera de este cambio** — siguen
con formato fijo.

De paso, se revisó el flujo de compra completo y aparecieron pacientes/pedidos
abandonados y un hueco de UX en re-subida de documentos — se incluyen en este mismo
diseño porque tocan las mismas páginas (perfil, checkout, dashboard).

## A) Modelo de datos

- **`products`**: Bourbon Street y Gaslight pasan de 3 filas (una por tamaño) a 1 fila
  cada uno. Nueva columna `price_tiers jsonb` con la escalera de precios (ver sección B).
  Las 6 filas viejas (3 por variedad) se archivan (`is_active = 0`), **no se borran**
  — preservan el historial de `customer_order_items` / `dispensation_items` que ya
  las referencian por `product_id`.
- **`batches`**: cada variedad pasa a **1 solo lote** con el total real en gramos
  (90g Bourbon Street, 4g Gaslight Purple Ghost — confirmado con Oscar que son gramos
  directos, no unidades de bolsa). Los 6 lotes viejos quedan marcados `depleted`,
  sin borrarse.
- **Aceites**: sin cambios de esquema.

## B) Cálculo de precio — 4 tramos por gramos comprados

| Gramos | Bourbon Street | Gaslight Purple Ghost |
|---|---|---|
| 1–5g   | $8.998/g   | $8.998/g   |
| 6–10g  | $8.599/g   | $8.499/g   |
| 11–20g | $7.999,5/g | $7.999,5/g |
| 21g+   | $7.500/g (piso fijo, no baja más) | $7.500/g (piso fijo, no baja más) |

`price_tiers` por producto: `[{"desde_g": 1, "precio_g": 8998}, {"desde_g": 6, "precio_g": 8599}, {"desde_g": 11, "precio_g": 7999.5}, {"desde_g": 21, "precio_g": 7500}]`
(Gaslight usa 8499 en el tramo 6-10g, el resto igual.)

Nueva función compartida `lib/pricing.ts` (existe en ambos proyectos, cultisoft y
cultimed-store, mismo código):

```ts
function calcularPrecioGramos(gramos: number, tiers: PriceTier[]): number {
  const tramo = [...tiers].reverse().find(t => gramos >= t.desde_g)!;
  return Math.round(gramos * tramo.precio_g);
}
```

Usada por: página de producto (precio en vivo), carrito, checkout (cálculo real del
cobro). Un solo punto de verdad — evita que catálogo y checkout se desincronicen.

El límite mensual de gramos (`lib/gram-utils.ts`, cumplimiento SANNA) **no cambia** —
ya usa `quantity` directo para productos categoría "flor" sin parsear texto de
presentación, así que gramos-como-cantidad ya funciona tal cual.

## C) cultimed-store (tienda)

- **Página de producto** (Bourbon Street, Gaslight): se elimina el selector de
  formato 5G/10G/20G. Queda un input de cantidad en gramos (stepper +/-, enteros,
  mínimo 1g). Precio se recalcula en vivo con `calcularPrecioGramos`, mostrando el
  tramo activo ("Tramo 6–10g · $8.599/g") y una tabla chica con los 4 tramos.
- **Carrito / checkout**: `quantity` pasa a representar gramos directos para estos
  2 productos. Sin cambios de flujo, solo de unidad y de dónde viene el precio.
- **Aceites**: sin cambios.
- **Perfil del paciente** (`/mi-cuenta/perfil`): se agrega la posibilidad de volver a
  subir cualquiera de los 5 documentos (hoy solo se puede resubir la receta). Mismo
  componente/patrón que ya existe para receta, replicado para id_front, id_back,
  criminal_record, rights_assignment.

## D) cultisoft (panel)

- **Productos**: la ficha de Bourbon Street/Gaslight edita los 4 tramos de precio
  (tabla desde-gramos + precio/gramo) en vez de un precio fijo único.
- **Inventario**: cada variedad es 1 lote, en gramos. "Ingresar lote" pide gramos
  directos para estas 2 variedades.
- **Dashboard**: el contador "Pedidos web por gestionar" separa pedidos
  `pending_payment` con más de 7 días de antigüedad como "Abandonados" — no cuentan
  como pendientes activos, se listan aparte para que el equipo decida si los cancela
  o hace seguimiento.
- **Campaña datos** (`/patients/outreach`): se agregan 2 segmentos nuevos a la
  segmentación existente — cuentas con 0 documentos subidos, y cuentas con receta
  `rechazada` que nunca resubieron.

## E) Migración de datos existentes

1. Crear 2 productos nuevos (Bourbon Street, Gaslight) con `unit = 'gramo'`,
   `price_tiers` según tabla de la sección B, `is_active = 1`.
2. Crear 1 lote nuevo por variedad: 90g Bourbon Street, 4g Gaslight Purple Ghost.
3. Archivar (`is_active = 0`) los 6 productos viejos (5g/10g/20g × 2 variedades).
4. Marcar `depleted` los 6 lotes viejos correspondientes.
5. Verificar que ningún pedido/dispensación en curso (`preparing`, `pending_payment`)
   referencie los productos viejos de forma que rompa su visualización — no debería,
   porque solo se archivan, no se borran.

## F) Testing

Antes de dar por terminado, repetir el mismo test end-to-end ya usado hoy (cuenta de
prueba desechable, borrada al final): registro → aprobación QF → comprar una cantidad
intermedia de gramos (ej. 7g) que cruce un tramo → verificar el precio cobrado
coincide con la tabla → confirmar pago → ciclo completo de despacho. Además, probar
la resubida de un documento no-receta desde el perfil del paciente.

## Fuera de alcance

- Aceites u otros productos — quedan con formato fijo.
- Integración Getnet — bloqueada, sin relación con este cambio.
- Los 8 pedidos abandonados existentes no se cancelan automáticamente en este
  cambio — solo se separan visualmente para que el equipo decida caso a caso.
