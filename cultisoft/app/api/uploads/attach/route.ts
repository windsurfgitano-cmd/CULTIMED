// Confirma que un comprobante YA se subió directo a Storage (vía
// /api/uploads/sign) y lo adjunta al pedido correspondiente. Solo mueve
// JSON chico — nunca bytes de archivo — así que nunca choca con el límite
// de body de las funciones serverless de Vercel.
//
// Replica exactamente la lógica de negocio del antiguo adminUploadProofAction
// (mismo event_type, mismo formato de mensaje, misma acción de auditoría).
import { NextResponse, type NextRequest } from "next/server";
import { requireRoleApi } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { buildStoragePath, type UploadBucket } from "@/lib/storage";

export const dynamic = "force-dynamic";

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  "in-person": "Presencial",
  manual: "Carga manual",
};

export async function POST(req: NextRequest) {
  const staffOrRes = await requireRoleApi("admin", "superadmin");
  if (staffOrRes instanceof NextResponse) return staffOrRes;
  const staff = staffOrRes;

  let body: { bucket?: string; path?: string; orderId?: number; channel?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { bucket, path, orderId, channel, notes } = body;
  if (!bucket || !path || !orderId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const order = await get<{ id: number; status: string }>(
    `SELECT id, status FROM customer_orders WHERE id = ?`,
    orderId
  );
  if (!order) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!["pending_payment", "proof_uploaded", "payment_rejected"].includes(order.status)) {
    return NextResponse.json({ error: "wrong_status" }, { status: 409 });
  }

  const storagePath = buildStoragePath(bucket as UploadBucket, path);
  const channelKey = (channel || "manual").trim();
  const channelLabel = CHANNEL_LABELS[channelKey] || channelKey;
  const notesTrim = (notes || "").trim();

  await run(
    `UPDATE customer_orders
     SET payment_proof_url = ?,
         payment_proof_uploaded_at = CURRENT_TIMESTAMP,
         status = 'proof_uploaded',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    storagePath, orderId
  );

  const eventMsg = `Comprobante cargado por ${staff.full_name} (admin) vía ${channelLabel}${notesTrim ? " · " + notesTrim : ""}`;
  await run(
    `INSERT INTO customer_order_events (order_id, event_type, message, staff_id)
     VALUES (?, 'proof_uploaded_by_admin', ?, ?)`,
    orderId, eventMsg, staff.id
  );

  await logAudit({
    staffId: staff.id,
    action: "order_proof_uploaded_by_admin",
    entityType: "customer_order",
    entityId: orderId,
    details: { channel: channelKey, notes: notesTrim || null, url: storagePath },
  });

  return NextResponse.json({ ok: true });
}
