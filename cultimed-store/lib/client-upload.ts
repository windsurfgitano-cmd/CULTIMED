"use client";

// Sube archivos DIRECTO desde el navegador a Supabase Storage, sin pasar por
// una función serverless de Vercel — evita el límite duro de ~4.5MB por
// request que rompía fotos de carnet/receta/comprobante en producción.
//
// Flujo: 1) pide URL firmada a /api/uploads/sign (el server valida sesión,
// tamaño y tipo) → 2) sube el archivo con esa URL directo a Storage →
// 3) confirma en /api/uploads/attach (JSON chico, persiste en BD).

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let _client: ReturnType<typeof createClient> | null = null;
function getBrowserClient() {
  if (_client) return _client;
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  return _client;
}

export class UploadError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  too_big: "El archivo supera 8 MB.",
  bad_type: "Formato no aceptado. Sube PDF, JPG o PNG.",
  invalid_bucket: "Error interno (bucket inválido). Contacta soporte.",
  missing_fields: "Faltan datos del archivo.",
  sign_failed: "No pudimos preparar la subida. Intenta de nuevo.",
  unauthorized: "Tu sesión expiró. Vuelve a ingresar.",
};

export type UploadTarget =
  | "prescription" | "id_front" | "id_back" | "criminal_record" | "rights_assignment"
  | "payment_proof";

const TARGET_BUCKET: Record<UploadTarget, "prescriptions" | "payment-proofs" | "patient-documents"> = {
  prescription: "prescriptions",
  id_front: "patient-documents",
  id_back: "patient-documents",
  criminal_record: "patient-documents",
  rights_assignment: "patient-documents",
  payment_proof: "payment-proofs",
};

/**
 * Sube un archivo directo a Storage y lo adjunta al registro correspondiente
 * (receta, documento de registro, o comprobante de pago de una orden).
 */
export async function uploadAndAttach(
  target: UploadTarget,
  file: File,
  opts?: { orderId?: number }
): Promise<void> {
  const bucket = TARGET_BUCKET[target];

  // 1) Pedir URL firmada
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, fileName: file.name, fileSize: file.size, docType: target }),
  });
  const signJson = await signRes.json().catch(() => ({}));
  if (!signRes.ok) {
    if (signRes.status === 401) throw new UploadError("unauthorized", ERROR_MESSAGES.unauthorized);
    const code = signJson.error || "sign_failed";
    throw new UploadError(code, ERROR_MESSAGES[code] || "No pudimos preparar la subida.");
  }
  const { signedUrl, token, path } = signJson as { signedUrl: string; token: string; path: string };

  // 2) Subir el archivo directo a Storage (bypass total de Vercel)
  const client = getBrowserClient();
  const { error: uploadErr } = await client.storage.from(bucket).uploadToSignedUrl(path, token, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (uploadErr) {
    throw new UploadError("upload_failed", "La subida falló. Revisa tu conexión e intenta de nuevo.");
  }

  // 3) Confirmar — persistir referencia en BD
  const attachRes = await fetch("/api/uploads/attach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, bucket, path, orderId: opts?.orderId }),
  });
  const attachJson = await attachRes.json().catch(() => ({}));
  if (!attachRes.ok) {
    const code = attachJson.error || "attach_failed";
    throw new UploadError(code, "El archivo se subió pero no pudimos guardarlo en tu cuenta. Contacta soporte.");
  }
}
