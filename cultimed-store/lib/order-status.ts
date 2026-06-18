/** Order has confirmed payment (admin sets `paid`; legacy may use other statuses). */
export function isOrderPaid(status: string): boolean {
  return ["paid", "payment_confirmed", "preparing", "shipped", "delivered"].includes(status);
}

export function isOrderAwaitingPayment(status: string): boolean {
  return status === "pending_payment";
}

export function isOrderProofUploaded(status: string): boolean {
  return status === "proof_uploaded";
}

export function isOrderRejected(status: string, rejectionReason?: string | null): boolean {
  return status === "rejected" || !!rejectionReason;
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Pago pendiente",
  proof_uploaded: "Verificando pago",
  paid: "Pago confirmado",
  payment_confirmed: "Pago confirmado",
  preparing: "En preparación",
  shipped: "Despachado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  rejected: "Comprobante rechazado",
};