// Métodos de pago: transferencia bancaria con 10% off vs MercadoPago.
// El descuento por transferencia es para incentivar el pago directo (sin comisión bancaria) y
// reducir el ciclo de cobro.

import { MercadoPagoConfig, Preference } from "mercadopago";

export type PaymentMethod = "transfer" | "mercadopago";

// Descuento por método (basis points: 10000 = 100%)
export const TRANSFER_DISCOUNT_BPS = 1000; // 10% off por transferencia
export const MERCADOPAGO_DISCOUNT_BPS = 0;  // sin descuento

export function paymentDiscountBps(method: PaymentMethod): number {
  return method === "transfer" ? TRANSFER_DISCOUNT_BPS : MERCADOPAGO_DISCOUNT_BPS;
}

export function calcPaymentDiscount(subtotal: number, method: PaymentMethod): number {
  const bps = paymentDiscountBps(method);
  if (bps === 0) return 0;
  return Math.round((subtotal * bps) / 10000);
}

// ---- MercadoPago client (lazy init) -------------------------------------

let _mpClient: MercadoPagoConfig | null = null;

export function getMpClient(): MercadoPagoConfig | null {
  if (_mpClient) return _mpClient;
  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) return null; // configurado pero deshabilitado
  _mpClient = new MercadoPagoConfig({
    accessToken: token,
    options: { timeout: 5000 },
  });
  return _mpClient;
}

export function isMercadoPagoEnabled(): boolean {
  return !!process.env.MP_ACCESS_TOKEN;
}

// ---- Crear preferencia de pago en MercadoPago ---------------------------

export interface CreatePreferenceInput {
  orderId: number;
  folio: string;
  total: number;
  customerEmail: string;
  itemsDescription: string; // resumen breve para mostrar en MP
  publicBaseUrl: string;    // ej. https://app.dispensariocultimed.cl
}

export async function createMpPreference(input: CreatePreferenceInput): Promise<{
  id: string;
  init_point: string;
} | null> {
  const client = getMpClient();
  if (!client) return null;

  const pref = new Preference(client);
  const result = await pref.create({
    body: {
      items: [
        {
          id: `cultimed-order-${input.orderId}`,
          title: `Cultimed · pedido ${input.folio}`,
          description: input.itemsDescription,
          quantity: 1,
          unit_price: input.total,
          currency_id: "CLP",
        },
      ],
      external_reference: String(input.orderId),
      payer: { email: input.customerEmail },
      back_urls: {
        success: `${input.publicBaseUrl}/checkout/${input.orderId}?mp=success`,
        pending: `${input.publicBaseUrl}/checkout/${input.orderId}?mp=pending`,
        failure: `${input.publicBaseUrl}/checkout/${input.orderId}?mp=failure`,
      },
      auto_return: "approved",
      notification_url: `${input.publicBaseUrl}/api/payments/mp-webhook`,
      // En CLP no hay cuotas, se paga al contado.
      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }, { id: "atm" }],
        installments: 1,
      },
      statement_descriptor: "CULTIMED",
      binary_mode: true, // approved | rejected (sin pending crédito)
    },
  });

  if (!result.id || !result.init_point) return null;
  return { id: result.id, init_point: result.init_point };
}

// ---- Helper: descripción corta del pedido -------------------------------

export function buildItemsDescription(items: Array<{ name: string; quantity: number }>): string {
  if (items.length === 0) return "Pedido Cultimed";
  if (items.length === 1) return `${items[0].quantity}× ${items[0].name}`;
  const head = items.slice(0, 2).map(i => `${i.quantity}× ${i.name}`).join(", ");
  const rest = items.length - 2;
  return rest > 0 ? `${head} y ${rest} más` : head;
}
