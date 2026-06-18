// Pago por transferencia bancaria con 10% de descuento.

export type PaymentMethod = "transfer";

export const TRANSFER_DISCOUNT_BPS = 1000; // 10%

export function paymentDiscountBps(_method: PaymentMethod = "transfer"): number {
  return TRANSFER_DISCOUNT_BPS;
}

export function calcPaymentDiscount(subtotal: number, method: PaymentMethod = "transfer"): number {
  const bps = paymentDiscountBps(method);
  if (bps === 0) return 0;
  return Math.round((subtotal * bps) / 10000);
}