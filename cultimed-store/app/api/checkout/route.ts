import { NextResponse, type NextRequest } from "next/server";
import { getCurrentCustomer, canPurchase } from "@/lib/auth";
import { transaction, get } from "@/lib/db";
import { getActiveConversionForReferred, REFERRED_DISCOUNT_BPS } from "@/lib/referrals";
import { calcPaymentDiscount } from "@/lib/payments";
import { calcShippingFee } from "@/lib/shipping";
import { calcularPrecioGramos, parsePriceTiers } from "@/lib/pricing";

interface CheckoutPayload {
  shipping_method?: "courier";
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

  const shippingMethod = "courier" as const;
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
  const noVendibles: string[] = [];

  for (const it of body.items) {
    // Traemos is_preorder y lo rechazamos en JS (en vez de filtrarlo en el WHERE)
    // a proposito: si lo filtraramos, el item caeria en `!product` y se descartaria
    // EN SILENCIO — el paciente terminaria pagando un pedido distinto al que reviso.
    // Necesitamos poder distinguir "no existe" de "no se vende" para avisarle.
    const product = await get<{
      default_price: number | null; name: string; price_tiers: unknown; is_preorder: number;
    }>(
      `SELECT default_price, name, price_tiers, is_preorder FROM products
       WHERE id = ? AND is_active = 1 AND shopify_status = 'active'`,
      it.productId
    );
    if (!product) continue;
    if (it.quantity <= 0) continue;

    // Una reserva NO es una venta: una cepa en preventa se reserva a nombre del
    // paciente, sin pago, y jamas puede pasar por checkout — tampoco el dia que se
    // le carguen lotes reales. Llega aca por carrito viejo en localStorage, por un
    // producto marcado como preventa despues de agregarlo, o por payload manipulado.
    // SMALLINT: se compara con 1, nunca con true.
    if (product.is_preorder === 1) {
      noVendibles.push(`${product.name} — es una cepa en reserva, no se vende todavia`);
      continue;
    }

    // Sin precio cargado no hay nada que cobrar. Sin este guard, `null * qty` da 0
    // y se crearia un pedido en $0.
    const tienePrecio = product.default_price != null || product.price_tiers != null;
    if (!tienePrecio) {
      noVendibles.push(`${product.name} — todavia no tiene precio definido`);
      continue;
    }

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

    const tiers = parsePriceTiers(product.price_tiers);
    const precioBase = product.default_price ?? 0;
    const total = tiers ? calcularPrecioGramos(it.quantity, tiers) : precioBase * it.quantity;
    const unitPrice = tiers ? Math.round(total / it.quantity) : precioBase;
    subtotal += total;
    validatedItems.push({
      productId: it.productId,
      qty: it.quantity,
      unitPrice,
      total,
      name: product.name,
    });
  }

  // Antes que el stock: si el carrito trae algo que no se vende, cortamos y se lo
  // decimos. Nunca crear un pedido parcial en silencio — el paciente estaria
  // pagando algo distinto de lo que reviso en el carrito.
  if (noVendibles.length > 0) {
    return NextResponse.json(
      { error: "not_purchasable", detail: noVendibles },
      { status: 409 }
    );
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
      shippingMethod,
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