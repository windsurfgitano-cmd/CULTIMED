/** Order has confirmed payment (admin sets `paid`; legacy may use other statuses). */
export function isOrderPaid(status: string): boolean {
  return [
    "paid",
    "payment_confirmed",
    "preparing",
    "ready_for_pickup",
    "shipped",
    "delivered",
  ].includes(status);
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

export function isOrderTerminal(status: string): boolean {
  return ["delivered", "cancelled", "rejected"].includes(status);
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Pago pendiente",
  proof_uploaded: "Verificando pago",
  paid: "Pago confirmado",
  payment_confirmed: "Pago confirmado",
  preparing: "En preparación",
  ready_for_pickup: "Lista para retiro",
  shipped: "Despachado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  rejected: "Comprobante rechazado",
};