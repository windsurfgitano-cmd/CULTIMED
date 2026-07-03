// Recibe la confirmación de que un archivo YA se subió directo a Supabase
// Storage (vía /api/uploads/sign) y persiste la referencia en la BD.
// Este endpoint solo mueve JSON pequeño — nunca bytes de archivo — así que
// nunca choca con el límite de body de las funciones serverless de Vercel.
import { NextResponse, type NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { buildStoragePath, type UploadBucket } from "@/lib/storage";

export const dynamic = "force-dynamic";

type Target = "prescription" | "id_front" | "id_back" | "criminal_record" | "rights_assignment" | "payment_proof";

const DOC_TARGETS: Record<Exclude<Target, "payment_proof">, { column: string; bucket: UploadBucket }> = {
  prescription:      { column: "prescription_url",     bucket: "prescriptions" },
  id_front:          { column: "id_front_url",         bucket: "patient-documents" },
  id_back:           { column: "id_back_url",           bucket: "patient-documents" },
  criminal_record:   { column: "criminal_record_url",   bucket: "patient-documents" },
  rights_assignment: { column: "rights_assignment_url", bucket: "patient-documents" },
};

export async function POST(req: NextRequest) {
  const customer = await requireCustomer();

  let body: { target?: Target; bucket?: string; path?: string; orderId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { target, bucket, path, orderId } = body;
  if (!target || !bucket || !path) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  // El path SIEMPRE debe empezar con el id del customer autenticado — no
  // confiamos en lo que mande el cliente, evita que alguien "adjunte" el
  // archivo de otro paciente a su propia cuenta.
  if (!path.startsWith(`${customer.id}/`)) {
    return NextResponse.json({ error: "path_mismatch" }, { status: 403 });
  }

  const storagePath = buildStoragePath(bucket as UploadBucket, path);

  if (target === "payment_proof") {
    if (!orderId) return NextResponse.json({ error: "missing_order" }, { status: 400 });
    const order = await get<{ id: number; customer_account_id: number; status: string }>(
      `SELECT id, customer_account_id, status FROM customer_orders WHERE id = ?`,
      orderId
    );
    if (!order || order.customer_account_id !== customer.id) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (!["pending_payment", "proof_uploaded"].includes(order.status)) {
      return NextResponse.json({ error: "wrong_status" }, { status: 409 });
    }
    await run(
      `UPDATE customer_orders
       SET payment_proof_url = ?, payment_proof_uploaded_at = CURRENT_TIMESTAMP,
           status = 'proof_uploaded', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      storagePath, orderId
    );
    await run(
      `INSERT INTO customer_order_events (order_id, event_type, message)
       VALUES (?, 'proof_uploaded', 'Comprobante de transferencia recibido')`,
      orderId
    );
    return NextResponse.json({ ok: true });
  }

  const docTarget = DOC_TARGETS[target as Exclude<Target, "payment_proof">];
  if (!docTarget) {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }

  if (target === "prescription") {
    await run(
      `UPDATE customer_accounts
       SET prescription_url = ?, prescription_status = 'pending',
           prescription_uploaded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      storagePath, customer.id
    );
  } else {
    await run(
      `UPDATE customer_accounts SET ${docTarget.column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      storagePath, customer.id
    );
  }

  return NextResponse.json({ ok: true });
}
