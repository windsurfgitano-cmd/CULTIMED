import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer, canPurchase } from "@/lib/auth";
import { run, transaction, get } from "@/lib/db";
import { getActiveConversionForReferred, REFERRED_DISCOUNT_BPS } from "@/lib/referrals";
import {
  PaymentMethod,
  calcPaymentDiscount,
  createMpPreference,
  buildItemsDescription,
  isMercadoPagoEnabled,
} from "@/lib/payments";

interface CheckoutPayload {
  shipping_method: "pickup" | "courier";
  shipping_address?: string;
  shipping_city?: string;
  shipping_region?: string;
  shipping_phone: string;
  notes?: string;
  payment_method?: PaymentMethod; // default 'transfer'
  items: Array<{ productId: number; quantity: number; unitPrice: number }>;
}

export async function POST(req: NextRequest) {
  const customer = await requireCustomer();
  if (!canPurchase(customer)) {
    return NextResponse.json({ error: "no_prescription" }, { status: 403 });
  }

  let body: CheckoutPayload;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ error: "empty_cart" }, { status: 400 });
  }

  // Retiro en farmacia deshabilitado: aún no tenemos farmacia física propia.
  // Forzamos courier en backend incluso si el cliente lo intenta saltar.
  if (body.shipping_method !== "courier") {
    return NextResponse.json({ error: "pickup_disabled" }, { status: 400 });
  }

  const paymentMethod: PaymentMethod = body.payment_method === "mercadopago" ? "mercadopago" : "transfer";
  if (paymentMethod === "mercadopago" && !isMercadoPagoEnabled()) {
    return NextResponse.json({ error: "mp_disabled" }, { status: 400 });
  }

  // Recompute totals server-side from products table to avoid client tampering
  let subtotal = 0;
  const validatedItems: Array<{
    productId: number; qty: number; unitPrice: number; total: number; name: string;
  }> = [];

  for (const it of body.items) {
    const product = await get<{ default_price: number; name: string }>(
      `SELECT default_price, name FROM products WHERE id = ? AND is_active = 1`,
      it.productId
    );
    if (!product) continue;
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

  if (validatedItems.length === 0) {
    return NextResponse.json({ error: "no_valid_items" }, { status: 400 });
  }

  // Programa Embajadores: 5% off al referido en su primera compra (acumulable con descuento por método)
  const conversion = await getActiveConversionForReferred(customer.id);
  const eligibleForReferralDiscount = !!(conversion && !conversion.first_order_id);
  const referralDiscount = eligibleForReferralDiscount
    ? Math.round((subtotal * REFERRED_DISCOUNT_BPS) / 10000)
    : 0;

  // Descuento por método de pago: 10% si transferencia, 0% si MercadoPago.
  // El descuento por método se aplica sobre el subtotal (no sobre el subtotal-referral) para evitar
  // doble descuento sobre el mismo monto.
  const paymentDiscount = calcPaymentDiscount(subtotal, paymentMethod);

  const total = Math.max(0, subtotal - referralDiscount - paymentDiscount);

  const folio = `CM-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
  let orderId = 0;

  await transaction(async (tx) => {
    const r = await tx.run(
      `INSERT INTO customer_orders (folio, customer_account_id, status, subtotal, total,
         shipping_method, shipping_address, shipping_city, shipping_region, shipping_phone, notes,
         referral_conversion_id, referral_discount_amount,
         payment_method, payment_discount_amount)
       VALUES (?, ?, 'pending_payment', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      folio, customer.id, subtotal, total,
      body.shipping_method,
      body.shipping_method === "courier" ? body.shipping_address || null : null,
      body.shipping_method === "courier" ? body.shipping_city || null : null,
      body.shipping_method === "courier" ? body.shipping_region || null : null,
      body.shipping_phone,
      body.notes || null,
      eligibleForReferralDiscount ? conversion!.id : null,
      referralDiscount,
      paymentMethod,
      paymentDiscount
    );
    orderId = Number(r.lastInsertRowid);

    for (const it of validatedItems) {
      await tx.run(
        `INSERT INTO customer_order_items (order_id, product_id, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?)`,
        orderId, it.productId, it.qty, it.unitPrice, it.total
      );
    }

    const discounts: string[] = [];
    if (referralDiscount > 0) discounts.push(`embajador 5% (-$${referralDiscount.toLocaleString("es-CL")})`);
    if (paymentDiscount > 0) discounts.push(`transferencia 10% (-$${paymentDiscount.toLocaleString("es-CL")})`);
    const discountNote = discounts.length ? ` con descuento ${discounts.join(" + ")}` : "";

    await tx.run(
      `INSERT INTO customer_order_events (order_id, event_type, message)
       VALUES (?, 'created', ?)`,
      orderId,
      `Orden creada${discountNote}`
    );
  });

  // Si es MercadoPago, crear preference y guardar IDs.
  if (paymentMethod === "mercadopago") {
    const proto = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3000";
    const publicBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || `${proto}://${host}`;

    try {
      const pref = await createMpPreference({
        orderId,
        folio,
        total,
        customerEmail: customer.email,
        itemsDescription: buildItemsDescription(
          validatedItems.map((it) => ({ name: it.name, quantity: it.qty }))
        ),
        publicBaseUrl,
      });

      if (pref) {
        await run(
          `UPDATE customer_orders
             SET mp_preference_id = ?, mp_init_point = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          pref.id, pref.init_point, orderId
        );
        return NextResponse.json({
          orderId,
          folio,
          paymentMethod,
          mpInitPoint: pref.init_point,
        });
      }
    } catch (e) {
      console.error("MP preference creation failed:", e);
      // Caemos a flujo manual si MP falla
    }
  }

  return NextResponse.json({
    orderId,
    folio,
    paymentMethod,
    referralDiscount,
    paymentDiscount,
  });
}
