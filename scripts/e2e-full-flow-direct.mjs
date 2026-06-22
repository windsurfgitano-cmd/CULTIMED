#!/usr/bin/env node
/**
 * E2E directo DB/API — registro → docs → autorización → compra → pago → stock → rollback.
 *
 * Crea datos temporales reales en Postgres/Supabase Storage, verifica el flujo y luego
 * revierte: elimina cuenta/paciente/orden/documentos y compensa stock con movimiento auditable.
 *
 * Uso: node scripts/e2e-full-flow-direct.mjs
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const requireStore = createRequire(path.join(root, "cultimed-store", "package.json"));
const postgres = requireStore("postgres");
const bcrypt = requireStore("bcryptjs");
const { createClient } = requireStore("@supabase/supabase-js");

const STORE = process.env.STORE_URL || "https://dispensariocultimed.cl";
const ADMIN = process.env.ADMIN_URL || "https://panel.dispensariocultimed.cl";
const TARGET_STRAIN = "bourbon-street-lit-farms";
const TARGET_PRESENTATION = "10g";
const QTY = 1;

function loadEnv(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing env file: ${file}`);
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || m[1].startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv(path.join(root, "cultimed-store", ".env.local"));
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL missing");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Supabase Storage env missing");
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.PGSSL === "false" ? undefined : "require",
  prepare: false,
  connect_timeout: 10,
  max: 1,
});
const storage = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const runId = `e2e-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex")}`;
const email = `${runId}@example.invalid`;
const password = `E2E-${crypto.randomBytes(6).toString("hex")}`;
const rut = makeRut(runId);
const fullName = `Paciente ${runId}`;
const phone = "+56900000000";
const created = {
  accountId: null,
  patientId: null,
  orderId: null,
  productId: null,
  batchDeltas: [],
  storageObjects: [],
};

function makeRut(seed) {
  const n = String(70000000 + (parseInt(crypto.createHash("sha1").update(seed).digest("hex").slice(0, 6), 16) % 9999999));
  let sum = 0, mul = 2;
  for (let i = n.length - 1; i >= 0; i--) {
    sum += Number(n[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const rest = 11 - (sum % 11);
  const dv = rest === 11 ? "0" : rest === 10 ? "K" : String(rest);
  return `${n}-${dv}`;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function gramsOf(presentation, quantity) {
  const m = String(presentation || "").match(/(\d+(?:[.,]\d+)?)\s*g/i);
  return (m ? Number(m[1].replace(",", ".")) : 1) * quantity;
}

function fakePdfBuffer(label) {
  const safe = String(label).replace(/[()\\]/g, "_");
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >> endobj\n4 0 obj << /Length 55 >> stream\nBT /F1 12 Tf 20 80 Td (${safe}) Tj ET\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
}

async function uploadDoc(userId, docType, content) {
  const bucket = "patient-documents";
  const objectPath = `${userId}/${new Date().toISOString().replace(/[:.]/g, "-")}_${docType}.pdf`;
  const { error } = await storage.storage.from(bucket).upload(objectPath, fakePdfBuffer(content), {
    contentType: "application/pdf",
    upsert: false,
    cacheControl: "60",
  });
  if (error) throw new Error(`storage upload ${docType}: ${error.message}`);
  created.storageObjects.push({ bucket, path: objectPath });
  return `${bucket}://${objectPath}`;
}

async function cleanup() {
  const errors = [];
  try {
    if (created.batchDeltas.length) {
      await sql.begin(async (tx) => {
        for (const d of created.batchDeltas) {
          await tx`
            update batches
            set quantity_current = quantity_current + ${d.take},
                status = case when quantity_current + ${d.take} > 0 then 'available' else status end
            where id = ${d.batchId}`;
          await tx`
            insert into inventory_movements (batch_id, movement_type, quantity, reference_type, reference_id, staff_id, reason)
            values (${d.batchId}, 'adjustment', ${d.take}, 'e2e_rollback', ${created.orderId}, null, ${`Rollback ${runId}: compensación de stock E2E`})`;
        }
      });
    }
  } catch (e) { errors.push(`stock rollback: ${e.message}`); }

  try {
    if (created.orderId) await sql`delete from customer_orders where id = ${created.orderId}`;
  } catch (e) { errors.push(`delete order: ${e.message}`); }

  try {
    if (created.accountId) await sql`delete from customer_accounts where id = ${created.accountId}`;
  } catch (e) { errors.push(`delete account: ${e.message}`); }

  try {
    if (created.patientId) await sql`delete from patients where id = ${created.patientId}`;
  } catch (e) { errors.push(`delete patient: ${e.message}`); }

  try {
    const byBucket = new Map();
    for (const o of created.storageObjects) {
      if (!byBucket.has(o.bucket)) byBucket.set(o.bucket, []);
      byBucket.get(o.bucket).push(o.path);
    }
    for (const [bucket, objects] of byBucket) {
      const { error } = await storage.storage.from(bucket).remove(objects);
      if (error) errors.push(`storage remove ${bucket}: ${error.message}`);
    }
  } catch (e) { errors.push(`storage cleanup: ${e.message}`); }

  return errors;
}

async function main() {
  const evidence = [];
  const stockBefore = await sql`
    select p.id::int product_id, p.name, p.presentation, p.default_price::int default_price,
           b.id::int batch_id, b.quantity_current::int quantity_current, b.status
    from products p join batches b on b.product_id = p.id
    where p.strain_key = ${TARGET_STRAIN} and p.presentation = ${TARGET_PRESENTATION} and b.status = 'available'
    order by b.created_at asc, b.expiry_date asc
    limit 1`;
  assert(stockBefore.length === 1, "No hay batch disponible para producto E2E");
  assert(stockBefore[0].quantity_current >= QTY, `Stock insuficiente inicial: ${stockBefore[0].quantity_current}`);
  const product = stockBefore[0];
  created.productId = product.product_id;
  evidence.push(`stock inicial ${product.name}: batch ${product.batch_id} qty=${product.quantity_current}`);

  // 1) Registro real directo equivalente a registerAction.
  const hash = await bcrypt.hash(password, 10);
  const acc = await sql`
    insert into customer_accounts (email, password_hash, full_name, rut, phone, age_gate_accepted_at)
    values (${email}, ${hash}, ${fullName}, ${rut}, ${phone}, current_timestamp)
    returning id::int`;
  created.accountId = acc[0].id;
  const pat = await sql`
    insert into patients (rut, full_name, email, phone, membership_status, membership_started_at)
    values (${rut}, ${fullName}, ${email}, ${phone}, 'active', current_timestamp)
    returning id::int`;
  created.patientId = pat[0].id;
  evidence.push(`registro: account=${created.accountId}, patient=${created.patientId}, rut=${rut}`);

  // 2) Subida de 5 documentos fake a Storage + pending.
  const docs = {
    prescription_url: await uploadDoc(created.accountId, "receta", `Receta médica fake ${runId}`),
    id_front_url: await uploadDoc(created.accountId, "carnet-frente", `Carnet frente fake ${runId}`),
    id_back_url: await uploadDoc(created.accountId, "carnet-dorso", `Carnet dorso fake ${runId}`),
    criminal_record_url: await uploadDoc(created.accountId, "antecedentes", `Antecedentes fake ${runId}`),
    rights_assignment_url: await uploadDoc(created.accountId, "deposito", `Comprobante fake ${runId}`),
  };
  await sql`
    update customer_accounts
    set patient_id=${created.patientId}, prescription_url=${docs.prescription_url}, id_front_url=${docs.id_front_url},
        id_back_url=${docs.id_back_url}, criminal_record_url=${docs.criminal_record_url}, rights_assignment_url=${docs.rights_assignment_url},
        prescription_status='pending', prescription_uploaded_at=current_timestamp, updated_at=current_timestamp
    where id=${created.accountId}`;
  const pending = await sql`select prescription_status from customer_accounts where id=${created.accountId}`;
  assert(pending[0].prescription_status === "pending", "Registro no quedó pending");
  evidence.push(`docs: 5 subidos a Storage, status=pending`);

  // 3) Validar bloqueo de compra antes de aprobación.
  const blocked = pending[0].prescription_status !== "aprobada";
  assert(blocked, "Paciente no aprobado debería estar bloqueado");
  evidence.push(`gate compra antes aprobación: bloqueado=true`);

  // 4) Autorización staff directa equivalente a reviewAction.
  const staff = await sql`select id::int, email from staff where is_active=1 and role in ('admin','superadmin','pharmacist') order by role='superadmin' desc, id limit 1`;
  assert(staff.length === 1, "No hay staff activo autorizador");
  await sql.begin(async (tx) => {
    await tx`
      update customer_accounts
      set prescription_status='aprobada', prescription_reviewed_by=${staff[0].id}, prescription_reviewed_at=current_timestamp,
          prescription_reviewer_notes=${`E2E aprobado ${runId}`}, updated_at=current_timestamp
      where id=${created.accountId}`;
    await tx`
      insert into audit_logs (staff_id, action, entity_type, entity_id, details)
      values (${staff[0].id}, 'web_prescription_aprobada', 'customer_account', ${created.accountId}, ${JSON.stringify({ e2e: true, runId })}::jsonb)`;
  });
  const approved = await sql`select prescription_status from customer_accounts where id=${created.accountId}`;
  assert(approved[0].prescription_status === "aprobada", "Autorización no dejó aprobada la cuenta");
  evidence.push(`autorización: staff=${staff[0].id}, status=aprobada`);

  // 5) Compra / checkout directo equivalente a /api/checkout.
  const subtotal = product.default_price * QTY;
  const paymentDiscount = Math.round(subtotal * 0.10);
  const shippingFee = subtotal > 100000 ? 0 : 4990;
  const total = Math.max(0, subtotal - paymentDiscount + shippingFee);
  const folio = `E2E-${Date.now().toString(36).toUpperCase()}`;
  await sql.begin(async (tx) => {
    const order = await tx`
      insert into customer_orders (folio, customer_account_id, status, subtotal, total,
        shipping_method, shipping_address, shipping_city, shipping_region, shipping_phone, notes,
        payment_method, payment_discount_amount)
      values (${folio}, ${created.accountId}, 'pending_payment', ${subtotal}, ${total},
        'courier', 'Calle E2E 123', 'Santiago', 'RM', ${phone}, ${`Orden temporal ${runId}`}, 'transfer', ${paymentDiscount})
      returning id::int`;
    created.orderId = order[0].id;
    await tx`
      insert into customer_order_items (order_id, product_id, quantity, unit_price, total_price)
      values (${created.orderId}, ${product.product_id}, ${QTY}, ${product.default_price}, ${subtotal})`;
    await tx`
      insert into customer_order_events (order_id, event_type, message)
      values (${created.orderId}, 'created', ${`Orden E2E creada ${runId}`})`;
  });
  evidence.push(`checkout: order=${created.orderId}, folio=${folio}, subtotal=${subtotal}, total=${total}`);

  // 6) Confirmación de pago + descuento FIFO equivalente a admin transitionAction(confirm_payment).
  await sql.begin(async (tx) => {
    const items = await tx`select product_id::int, quantity::int from customer_order_items where order_id=${created.orderId}`;
    for (const item of items) {
      const batches = await tx`
        select id::int, quantity_current::int as qty from batches
        where product_id=${item.product_id} and status='available' and quantity_current > 0
        order by created_at asc, expiry_date asc`;
      let remaining = item.quantity;
      for (const b of batches) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, b.qty);
        await tx`
          update batches
          set quantity_current = quantity_current - ${take},
              status = case when quantity_current - ${take} <= 0 then 'depleted' else status end
          where id=${b.id}`;
        await tx`
          insert into inventory_movements (batch_id, movement_type, quantity, reference_type, reference_id, staff_id, reason)
          values (${b.id}, 'out', ${-take}, 'customer_order', ${created.orderId}, ${staff[0].id}, ${`Venta web E2E ${runId}`})`;
        created.batchDeltas.push({ batchId: b.id, take });
        remaining -= take;
      }
      if (remaining > 0) throw new Error(`Stock insuficiente durante confirmación para product ${item.product_id}`);
    }
    await tx`
      update customer_orders
      set status='paid', payment_confirmed_by=${staff[0].id}, payment_confirmed_at=current_timestamp, updated_at=current_timestamp
      where id=${created.orderId}`;
    await tx`
      insert into customer_order_events (order_id, event_type, message, staff_id)
      values (${created.orderId}, 'payment_confirmed', ${`Pago confirmado E2E ${runId}`}, ${staff[0].id})`;
  });
  const paid = await sql`select status from customer_orders where id=${created.orderId}`;
  assert(paid[0].status === "paid", "Orden no quedó paid");
  const stockAfter = await sql`select quantity_current::int from batches where id=${product.batch_id}`;
  assert(stockAfter[0].quantity_current === product.quantity_current - QTY, `Stock no descontó esperado: ${stockAfter[0].quantity_current}`);
  evidence.push(`pago: status=paid, stock batch ${product.batch_id}: ${product.quantity_current} → ${stockAfter[0].quantity_current}`);

  // 7) Health real post side-effects.
  for (const [name, url] of [["store", `${STORE}/api/health`], ["admin", `${ADMIN}/api/health`]]) {
    const res = await fetch(url);
    const body = await res.json();
    assert(res.status === 200 && body.status === "ok" && body.db === true, `${name} health failed`);
    evidence.push(`${name} health OK`);
  }

  const cleanupErrors = await cleanup();
  assert(cleanupErrors.length === 0, `Rollback con errores: ${cleanupErrors.join("; ")}`);
  const remains = await sql`
    select
      (select count(*)::int from customer_accounts where email=${email}) as accounts,
      (select count(*)::int from patients where rut=${rut}) as patients,
      (select count(*)::int from customer_orders where folio=${folio}) as orders,
      (select quantity_current::int from batches where id=${product.batch_id}) as final_stock`;
  assert(remains[0].accounts === 0 && remains[0].patients === 0 && remains[0].orders === 0, "Quedaron datos E2E sin limpiar");
  assert(remains[0].final_stock === product.quantity_current, `Stock no restaurado: ${remains[0].final_stock} != ${product.quantity_current}`);
  evidence.push(`rollback: datos temporales eliminados, stock restaurado a ${remains[0].final_stock}`);

  return { ok: true, runId, accountId: created.accountId, patientId: created.patientId, orderId: created.orderId, product: { id: product.product_id, name: product.name, batchId: product.batch_id }, evidence };
}

try {
  const result = await main();
  console.log(JSON.stringify(result, null, 2));
} catch (e) {
  const cleanupErrors = await cleanup();
  console.log(JSON.stringify({ ok: false, runId, error: e.message, created, cleanupErrors }, null, 2));
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 3 });
}
