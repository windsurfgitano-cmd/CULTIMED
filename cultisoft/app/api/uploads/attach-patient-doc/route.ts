// Confirma que un documento de paciente (carnet, receta, antecedentes,
// comprobante de depósito) YA se subió directo a Storage — el staff lo sube
// en nombre del paciente cuando este no pudo hacerlo por su cuenta.
// Replica exactamente uploadDocumentAction (mismo columnMap, misma
// auditoría), pero solo mueve JSON — nunca bytes de archivo.
import { NextResponse, type NextRequest } from "next/server";
import { requireRoleApi } from "@/lib/auth";
import { PRESCRIPTIONS_ROLES } from "@/lib/permissions";
import { run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { buildStoragePath, type UploadBucket } from "@/lib/storage";

export const dynamic = "force-dynamic";

const COLUMN_MAP: Record<string, string> = {
  id_front: "id_front_url",
  id_back: "id_back_url",
  criminal_record: "criminal_record_url",
  prescription: "prescription_url",
  rights_assignment: "rights_assignment_url",
};

export async function POST(req: NextRequest) {
  const staffOrRes = await requireRoleApi(...PRESCRIPTIONS_ROLES);
  if (staffOrRes instanceof NextResponse) return staffOrRes;
  const staff = staffOrRes;

  let body: { bucket?: string; path?: string; customerId?: number; docType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { bucket, path, customerId, docType } = body;
  if (!bucket || !path || !customerId || !docType) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  const column = COLUMN_MAP[docType];
  if (!column) {
    return NextResponse.json({ error: "invalid_doc_type" }, { status: 400 });
  }

  const storagePath = buildStoragePath(bucket as UploadBucket, path);

  await run(
    `UPDATE customer_accounts SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    storagePath, customerId
  );
  await logAudit({
    staffId: staff.id,
    action: `upload_document_${docType}`,
    entityType: "customer_account",
    entityId: customerId,
  });

  return NextResponse.json({ ok: true });
}
