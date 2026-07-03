// Emite una URL de subida firmada para que el navegador del staff suba el
// archivo DIRECTO a Supabase Storage — evita el límite duro de ~4.5MB por
// request que Vercel impone a las funciones serverless (server actions
// incluidas), que podía romper la subida manual de comprobantes (fotos
// reenviadas por WhatsApp).
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { createSignedUploadUrl, type UploadBucket } from "@/lib/storage";

export const dynamic = "force-dynamic";

const ALLOWED_BUCKETS: UploadBucket[] = ["prescriptions", "payment-proofs", "patient-documents"];
const MAX_BYTES = 8 * 1024 * 1024;

// Nota de permisos: este endpoint solo verifica que haya UNA sesión de staff
// válida (cualquier rol) — es únicamente el paso "sube bytes a Storage".
// El permiso de negocio real (¿puede este staff tocar ESTE pedido/paciente?)
// se valida en el endpoint de attach correspondiente antes de escribir en BD.
export async function POST(req: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { bucket?: string; fileName?: string; fileSize?: number; docType?: string; ownerId?: number | string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { bucket, fileName, fileSize, docType, ownerId } = body;
  if (!bucket || !ALLOWED_BUCKETS.includes(bucket as UploadBucket)) {
    return NextResponse.json({ error: "invalid_bucket" }, { status: 400 });
  }
  if (!fileName || typeof fileSize !== "number" || !ownerId) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }
  if (fileSize <= 0 || fileSize > MAX_BYTES) {
    return NextResponse.json({ error: "too_big" }, { status: 400 });
  }
  if (!/\.(pdf|jpe?g|png)$/i.test(fileName)) {
    return NextResponse.json({ error: "bad_type" }, { status: 400 });
  }

  try {
    const safeDocType = (docType || "archivo").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40) || "archivo";
    const ext = (fileName.match(/\.[a-z0-9]+$/i)?.[0] || ".bin").toLowerCase();
    const result = await createSignedUploadUrl(
      bucket as UploadBucket,
      ownerId,
      `${safeDocType}${ext}`
    );
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("sign upload url failed:", e);
    return NextResponse.json({ error: "sign_failed", detail: e?.message }, { status: 500 });
  }
}
