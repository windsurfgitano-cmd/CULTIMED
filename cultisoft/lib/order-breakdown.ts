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
