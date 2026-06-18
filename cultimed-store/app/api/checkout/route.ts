import { NextResponse, type NextRequest } from "next/server";
import { getCurrentCustomer, canPurchase } from "@/lib/auth";
import { transaction, get } from "@/lib/db";
import { getActiveConversionForReferred, REFERRED_DISCOUNT_BPS } from "@/lib/referrals";
import { calcPaymentDiscount } from "@/lib/payments";
import { calcShippingFee } from "@/lib/shipping";

interface CheckoutPayload {
  shipping_method: "pickup" | "courier";
  shipping_address?: string;
  shipping_city?: string;
  shipping_region?: string;
  shipping_phone: string;
  notes?: string;
  items: Array<{ productId: number; quantity: number; unitPrice: number }>;
}

export async function POST(req: NextRequest) {
  const customer = await getCurrentCustomer();
  if (!customer) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!canPurchase(customer)) {
    return NextResponse.json({ error: "no_prescription" }, { status: 403 });
  }

  let body: CheckoutPayload;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  if (!body.items || body.items.length === 0) {
    return NextResponse.json({ error: "empty_cart" }, { status: 400 });
  }

  if (body.shipping_method !== "courier") {
    return NextResponse.json({ error: "pickup_disabled" }, { status: 400 });
  }
  const shippingAddress = (body.shipping_address || "").trim();
  const shippingCity = (body.shipping_city || "").trim();
  const shippingRegion = (body.shipping_region || "").trim();
  const shippingPhone = (body.shipping_phone || "").trim();
  if (!shippingAddress || !shippingCity || !shippingRegion || !shippingPhone) {
    return NextResponse.json({ error: "missing_shipping_data" }, { status: 400 });
  }

  const paymentMethod = "transfer" as const;

  let subtotal = 0;
  const validatedItems: Array<{
    productId: number; qty: number; unitPrice: number; total: number; name: string;
  }> = [];
  const outOfStock: string[] = [];

  for (const it of body.items) {
    const product = await get<{ default_price: number; name: string }>(
      `SELECT default_price, name FROM products WHERE id = ? AND is_active = 1 AND shopify_status = 'active'`,
      it.productId
    );
    if (!product) continue;
    if (it.quantity <= 0) continue;

    const stockRow = await get<{ available: number }>(
      `SELECT COALESCE(SUM(quantity_current), 0)::int AS available
       FROM batches WHERE product_id = ? AND status = 'available'`,
      it.productId
    );
    const available = stockRow?.available ?? 0;
    if (available < it.quantity) {
      outOfStock.push(`${product.name} — disponible: ${available}, pediste: ${it.quantity}`);
      continue;
    }

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

  if (outOfStock.length > 0) {
    return NextResponse.json(
      { error: "out_of_stock", detail: outOfStock },
      { status: 409 }
    );
  }
  if (validatedItems.length === 0) {
    return NextResponse.json({ error: "no_valid_items" }, { status: 400 });
  }

  const conversion = await getActiveConversionForReferred(customer.id);
  const eligibleForReferralDiscount = !!(conversion && !conversion.first_order_id);
  const referralDiscount = eligibleForReferralDiscount
    ? Math.round((subtotal * REFERRED_DISCOUNT_BPS) / 10000)
    : 0;

  const paymentDiscount = calcPaymentDiscount(subtotal, paymentMethod);
  const shippingFee = calcShippingFee(subtotal, shippingCity, shippingRegion);
  const total = Math.max(0, subtotal - referralDiscount - paymentDiscount + shippingFee);

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
      shippingAddress,
      shippingCity,
      shippingRegion,
      shippingPhone,
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
    const shippingNote = shippingFee > 0 ? ` y despacho $${shippingFee.toLocaleString("es-CL")}` : " y despacho gratis";

    await tx.run(
      `INSERT INTO customer_order_events (order_id, event_type, message)
       VALUES (?, 'created', ?)`,
      orderId,
      `Orden creada${discountNote}${shippingNote}`
    );
  });

  return NextResponse.json({
    orderId,
    folio,
    paymentMethod,
    referralDiscount,
    paymentDiscount,
    shippingFee,
  });
}