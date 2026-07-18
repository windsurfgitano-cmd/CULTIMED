/**
 * Semantica UNICA de disponibilidad del catalogo.
 *
 * Hay dos preguntas distintas que antes se resolvian ad-hoc en cada pagina y que
 * aca quedan centralizadas:
 *
 *   1. isReachable  -> se puede ABRIR la ficha / clickear la tarjeta.
 *   2. isPurchasable -> se puede agregar al carrito y PAGAR.
 *
 * REGLA:
 *   publicado      = is_active = 1 AND shopify_status = 'active'
 *   isReachable    = is_active = 1 AND (shopify_status = 'active' OR is_preorder = 1)
 *   isPurchasable  = publicado AND stock > 0 AND is_preorder = 0
 *
 * Por que isReachable NO exige stock > 0:
 *   Hoy el stock no participa en ningun lado de la alcanzabilidad de un producto
 *   normal (ni el catalogo ni la ficha lo filtran; el "Agotado" se resuelve mas
 *   abajo, en el picker). Meter stock > 0 aca haria 404-ear productos publicados
 *   que quedan transitoriamente en 0 — un cambio de comportamiento sobre
 *   productos que NO son de preventa. El unico delta permitido es el de preventa.
 *   El stock si gatea la compra, que es donde importa.
 *
 * REGLA DE ORO: isPurchasable NUNCA es true si is_preorder = 1. Una reserva no es
 * una venta: un producto de preventa no se paga por la tienda aunque algun dia
 * tenga lotes cargados.
 *
 * Recordatorio: todos estos flags son SMALLINT en Postgres — se comparan con 1/0,
 * nunca con true/false.
 */

export interface ProductAvailability {
  is_preorder?: number | null;
  is_active?: number | null;
  shopify_status?: string | null;
  /** Stock derivado de batches (SUM(quantity_current) de lotes 'available'). */
  stock?: number | null;
}

/** El producto esta marcado como (PREVENTA) / (PREDISPENSADO). */
export function isPreorder(p: ProductAvailability): boolean {
  return p.is_preorder === 1;
}

/** Publicado en la web: activo y con estado Shopify 'active'. */
export function isPublished(p: ProductAvailability): boolean {
  return p.is_active === 1 && p.shopify_status === "active";
}

/**
 * Se puede abrir la ficha / clickear la tarjeta.
 * La preventa es alcanzable aunque no tenga stock ni estado 'active': la reserva
 * vive en la ficha, asi que la ficha tiene que abrir.
 */
export function isReachable(p: ProductAvailability): boolean {
  if (p.is_active !== 1) return false;
  return p.shopify_status === "active" || isPreorder(p);
}

/**
 * Se puede agregar al carrito y pagar.
 * Un producto de preventa jamas es comprable, tenga el stock que tenga.
 */
export function isPurchasable(p: ProductAvailability): boolean {
  if (isPreorder(p)) return false;
  return isPublished(p) && (p.stock ?? 0) > 0;
}
