"use client";

// Sube archivos DIRECTO desde el navegador del staff a Supabase Storage,
// sin pasar por una función serverless de Vercel — evita el límite duro de
// ~4.5MB por request que podía romper la subida manual de comprobantes.

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
  invalid_bucket: "Error interno (bucket inválido).",
  missing_fields: "Faltan datos del archivo.",
  sign_failed: "No pudimos preparar la subida. Intenta de nuevo.",
  forbidden: "No tienes permisos para esta acción.",
};

/** Sube un comprobante de pago directo a Storage y lo adjunta a un pedido. */
export async function uploadPaymentProof(
  file: File,
  orderId: number,
  customerAccountId: number,
  opts?: { channel?: string; notes?: string }
): Promise<void> {
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket: "payment-proofs",
      fileName: file.name,
      fileSize: file.size,
      docType: "comprobante",
      // Mismo formato de path que usaba saveUploadedFile(): "{customerId}-{orderId}"
      ownerId: `${customerAccountId}-${orderId}`,
    }),
  });
  const signJson = await signRes.json().catch(() => ({}));
  if (!signRes.ok) {
    const code = signJson.error || "sign_failed";
    throw new UploadError(code, ERROR_MESSAGES[code] || "No pudimos preparar la subida.");
  }
  const { signedUrl: _signedUrl, token, path } = signJson as { signedUrl: string; token: string; path: string };

  const client = getBrowserClient();
  const { error: uploadErr } = await client.storage.from("payment-proofs").uploadToSignedUrl(path, token, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (uploadErr) {
    throw new UploadError("upload_failed", "La subida falló. Revisa tu conexión e intenta de nuevo.");
  }

  const attachRes = await fetch("/api/uploads/attach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket: "payment-proofs",
      path,
      orderId,
      channel: opts?.channel,
      notes: opts?.notes,
    }),
  });
  const attachJson = await attachRes.json().catch(() => ({}));
  if (!attachRes.ok) {
    const code = attachJson.error || "attach_failed";
    throw new UploadError(code, "El archivo se subió pero no pudimos guardarlo en el pedido.");
  }
}

/**
 * Sube un documento de paciente (carnet, receta, antecedentes, comprobante
 * de depósito) EN NOMBRE del paciente — usado por staff cuando el paciente
 * no pudo subirlo por su cuenta.
 */
export async function uploadPatientDocument(
  file: File,
  customerId: number,
  docType: "id_front" | "id_back" | "criminal_record" | "prescription" | "rights_assignment"
): Promise<void> {
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket: "patient-documents",
      fileName: file.name,
      fileSize: file.size,
      docType,
      ownerId: customerId,
    }),
  });
  const signJson = await signRes.json().catch(() => ({}));
  if (!signRes.ok) {
    if (signRes.status === 401) throw new UploadError("unauthorized", "Tu sesión expiró. Vuelve a ingresar.");
    const code = signJson.error || "sign_failed";
    throw new UploadError(code, ERROR_MESSAGES[code] || "No pudimos preparar la subida.");
  }
  const { token, path } = signJson as { signedUrl: string; token: string; path: string };

  const client = getBrowserClient();
  const { error: uploadErr } = await client.storage.from("patient-documents").uploadToSignedUrl(path, token, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (uploadErr) {
    throw new UploadError("upload_failed", "La subida falló. Revisa tu conexión e intenta de nuevo.");
  }

  const attachRes = await fetch("/api/uploads/attach-patient-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket: "patient-documents", path, customerId, docType }),
  });
  const attachJson = await attachRes.json().catch(() => ({}));
  if (!attachRes.ok) {
    const code = attachJson.error || "attach_failed";
    throw new UploadError(code, "El archivo se subió pero no pudimos guardarlo en la ficha del paciente.");
  }
}
