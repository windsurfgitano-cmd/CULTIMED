// Cron diario: identifica productos con stock bajo y lotes próximos a vencer.
// Envía email diario con el resumen al staff admin/superadmin.
//
// Schedule en vercel.json. Idempotente (no muta DB; solo email).
import { NextResponse, type NextRequest } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LOW_STOCK_THRESHOLD = 10; // unidades
const EXPIRY_WARNING_DAYS = 60; // lotes que vencen en menos de 60 días
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Cultimed <no-reply@dispensariocultimed.cl>";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "contacto@dispensariocultimed.cl";

interface LowStockProduct {
  id: number;
  sku: string;
  name: string;
  total_stock: number;
}
interface ExpiringBatch {
  id: number;
  batch_number: string;
  product_name: string;
  quantity_current: number;
  expiry_date: string;
  days_left: number;
}

async function sendEmail(to: string[], subject: string, html: string, text: string) {
  if (!RESEND_API_KEY) return { ok: false as const, error: "RESEND_API_KEY missing" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: EMAIL_FROM, to, reply_to: EMAIL_REPLY_TO, subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false as const, error: body?.message || `HTTP ${res.status}` };
  return { ok: true as const, id: body.id };
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  const expectedManual = process.env.MIGRATION_SECRET ? `Bearer ${process.env.MIGRATION_SECRET}` : null;
  if (auth !== expectedCron && auth !== expectedManual) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sql = getSql();

  // Productos con stock bajo
  const lowStock = await sql<LowStockProduct[]>`
    SELECT p.id, p.sku, p.name,
      COALESCE(SUM(b.quantity_current), 0)::int as total_stock
    FROM products p
    LEFT JOIN batches b ON b.product_id = p.id AND b.status='available'
    WHERE p.is_active=1 AND p.shopify_status='active'
    GROUP BY p.id, p.sku, p.name
    HAVING COALESCE(SUM(b.quantity_current), 0) < ${LOW_STOCK_THRESHOLD}
    ORDER BY total_stock ASC, p.name
  `;

  // Lotes próximos a vencer
  const expiring = await sql<ExpiringBatch[]>`
    SELECT b.id, b.batch_number, p.name as product_name, b.quantity_current,
      b.expiry_date::text as expiry_date,
      EXTRACT(DAY FROM b.expiry_date::timestamp - NOW())::int as days_left
    FROM batches b
    JOIN products p ON p.id = b.product_id
    WHERE b.status='available'
      AND b.quantity_current > 0
      AND b.expiry_date IS NOT NULL
      AND b.expiry_date::date <= CURRENT_DATE + INTERVAL '${sql.unsafe(String(EXPIRY_WARNING_DAYS))} days'
    ORDER BY b.expiry_date ASC
  `;

  if (lowStock.length === 0 && expiring.length === 0) {
    return NextResponse.json({ ok: true, low_stock: 0, expiring: 0, email_sent: false, message: "all good — no alerts" });
  }

  // Lista de admins activos
  const admins = await sql<Array<{ email: string; full_name: string }>>`
    SELECT email, full_name FROM staff
    WHERE is_active=1 AND role IN ('admin','superadmin')
    ORDER BY role DESC, email
  `;
  const recipients = admins.map((a) => a.email);

  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, error: "no active admins to notify" });
  }

  // Build email
  const lowStockRows = lowStock
    .map((p) => `<tr><td style="padding:8px;border-bottom:1px solid #DCD3C4;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;">${p.name}</td><td style="padding:8px;border-bottom:1px solid #DCD3C4;font-family:monospace;font-size:12px;color:#7a7066;">${p.sku}</td><td align="right" style="padding:8px;border-bottom:1px solid #DCD3C4;font-family:monospace;font-size:14px;font-weight:600;color:${p.total_stock === 0 ? "#9b3a3a" : "#a06a1f"};">${p.total_stock}</td></tr>`)
    .join("");

  const expiringRows = expiring
    .map((b) => `<tr><td style="padding:8px;border-bottom:1px solid #DCD3C4;font-family:'Helvetica Neue',Arial,sans-serif;font-size:13px;">${b.product_name}</td><td style="padding:8px;border-bottom:1px solid #DCD3C4;font-family:monospace;font-size:12px;color:#7a7066;">${b.batch_number}</td><td align="right" style="padding:8px;border-bottom:1px solid #DCD3C4;font-family:monospace;font-size:13px;">${b.quantity_current}</td><td align="right" style="padding:8px;border-bottom:1px solid #DCD3C4;font-family:monospace;font-size:13px;color:${b.days_left < 14 ? "#9b3a3a" : "#a06a1f"};">${b.expiry_date} (${b.days_left}d)</td></tr>`)
    .join("");

  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0F1A22;font-family:Georgia,serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0F1A22;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;width:100%;background:#F7F1E5;border:1px solid #C9B891;">
      <tr><td style="padding:36px 40px 16px;">
        <p style="margin:0 0 8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#8b7d5c;">Cultimed · Reporte diario de inventario</p>
        <h1 style="margin:0;font-family:Georgia,serif;font-size:30px;font-weight:300;line-height:1.1;color:#1a1a1a;">
          ${lowStock.length} producto(s) con <em style="font-style:italic;">stock bajo</em>${expiring.length ? `, ${expiring.length} lote(s) por <em style="font-style:italic;">vencer</em>` : ""}.
        </h1>
      </td></tr>
      ${lowStock.length > 0 ? `
      <tr><td style="padding:0 40px 24px;">
        <p style="margin:24px 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8b7d5c;">— Stock bajo (umbral ${LOW_STOCK_THRESHOLD})</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #C9B891;">
          <thead><tr style="background:#FBF5E8;">
            <th align="left" style="padding:8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#7a7066;font-weight:600;">Producto</th>
            <th align="left" style="padding:8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#7a7066;font-weight:600;">SKU</th>
            <th align="right" style="padding:8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#7a7066;font-weight:600;">Stock</th>
          </tr></thead>
          <tbody>${lowStockRows}</tbody>
        </table>
      </td></tr>` : ""}
      ${expiring.length > 0 ? `
      <tr><td style="padding:0 40px 24px;">
        <p style="margin:24px 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8b7d5c;">— Lotes próximos a vencer (≤${EXPIRY_WARNING_DAYS} días)</p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid #C9B891;">
          <thead><tr style="background:#FBF5E8;">
            <th align="left" style="padding:8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#7a7066;font-weight:600;">Producto</th>
            <th align="left" style="padding:8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#7a7066;font-weight:600;">Lote</th>
            <th align="right" style="padding:8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#7a7066;font-weight:600;">Cant.</th>
            <th align="right" style="padding:8px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:#7a7066;font-weight:600;">Vence</th>
          </tr></thead>
          <tbody>${expiringRows}</tbody>
        </table>
      </td></tr>` : ""}
      <tr><td align="center" style="padding:8px 40px 32px;">
        <a href="https://panel.dispensariocultimed.cl/inventory" style="display:inline-block;padding:14px 32px;background:#0F1A22;color:#F7F1E5;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;text-decoration:none;border:1px solid #0F1A22;">
          Ver inventario completo →
        </a>
      </td></tr>
      <tr><td style="padding:24px 40px;border-top:1px solid #C9B891;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#8b7d5c;">
        <p style="margin:0;">Reporte diario automático · Cultimed</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  const text = [
    `Reporte de inventario · ${new Date().toISOString().slice(0, 10)}`,
    "",
    lowStock.length > 0 ? `STOCK BAJO (< ${LOW_STOCK_THRESHOLD} unidades):` : "",
    ...lowStock.map((p) => `  - ${p.name} (${p.sku}): ${p.total_stock} unid.`),
    "",
    expiring.length > 0 ? `LOTES POR VENCER (≤${EXPIRY_WARNING_DAYS} días):` : "",
    ...expiring.map((b) => `  - ${b.product_name} lote ${b.batch_number}: ${b.quantity_current} unid. vence ${b.expiry_date} (${b.days_left}d)`),
    "",
    "Inventario completo: https://panel.dispensariocultimed.cl/inventory",
    "",
    "Cultimed · Reporte automático",
  ].filter(Boolean).join("\n");

  const sendRes = await sendEmail(
    recipients,
    `[Inventario] ${lowStock.length} stock bajo${expiring.length ? ` · ${expiring.length} por vencer` : ""}`,
    html,
    text
  );

  return NextResponse.json({
    ok: true,
    low_stock: lowStock.length,
    expiring: expiring.length,
    email_sent: sendRes.ok,
    email_id: sendRes.ok ? sendRes.id : null,
    error: sendRes.ok ? null : sendRes.error,
    recipients_count: recipients.length,
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
