// Supabase Storage helper para uploads de pacientes (recetas + comprobantes).
// Bucket: "uploads" (público, signed URLs para acceso controlado).
//
// Buckets a crear en Supabase Storage:
//   - "prescriptions"  · privado, signed URL 1h. Recetas médicas.
//   - "payment-proofs" · privado, signed URL 1h. Comprobantes de transferencia.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let _admin: SupabaseClient | null = null;

/** Cliente admin (usa service-role key) — solo para server-side. */
export function getStorageAdmin(): SupabaseClient {
  if (_admin) return _admin;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase no configurado: falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  return _admin;
}

export type UploadBucket = "prescriptions" | "payment-proofs";

export interface UploadResult {
  /** Path interno del objeto, ej: "1/2026-04-30T20-00-00_receta.pdf" */
  path: string;
  /** URL firmada con expiración para acceso seguro (1 hora). */
  signedUrl: string;
}

/**
 * Sube un archivo a Supabase Storage. Path se genera como `${userId}/${timestamp}_${nombre}`.
 */
export async function uploadFile(opts: {
  bucket: UploadBucket;
  userId: number | string;
  fileName: string;
  buffer: Buffer | Uint8Array | Blob;
  contentType?: string;
}): Promise<UploadResult> {
  const admin = getStorageAdmin();
  const safeName = opts.fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-80);
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${opts.userId}/${ts}_${safeName}`;

  const { error } = await admin.storage
    .from(opts.bucket)
    .upload(path, opts.buffer as any, {
      contentType: opts.contentType || "application/octet-stream",
      upsert: false,
      cacheControl: "3600",
    });

  if (error) throw new Error(`upload failed: ${error.message}`);

  const signedUrl = await getSignedUrl(opts.bucket, path);
  return { path, signedUrl };
}

/** Genera una URL firmada con TTL en segundos (default 1h). */
export async function getSignedUrl(
  bucket: UploadBucket,
  path: string,
  ttlSeconds = 3600
): Promise<string> {
  const admin = getStorageAdmin();
  const { data, error } = await admin.storage
    .from(bucket)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data) throw new Error(`signed url failed: ${error?.message}`);
  return data.signedUrl;
}

/** Borra un objeto del bucket. */
export async function deleteFile(bucket: UploadBucket, path: string): Promise<void> {
  const admin = getStorageAdmin();
  const { error } = await admin.storage.from(bucket).remove([path]);
  if (error) throw new Error(`delete failed: ${error.message}`);
}

/**
 * Genera URL firmada a partir de la columna `prescription_url` o `payment_proof_url`
 * que en BD guardamos como `bucket://path` para identificar bucket+path.
 *
 * Compatibilidad con datos legacy: si la URL empieza con "/uploads/...",
 * la consideramos legacy filesystem (no funciona en Vercel, debe migrarse).
 */
export async function resolveStorageUrl(stored: string | null): Promise<string | null> {
  if (!stored) return null;

  // Formato nuevo: "prescriptions://1/2026-04-30T20-00-00_receta.pdf"
  const match = stored.match(/^(prescriptions|payment-proofs):\/\/(.+)$/);
  if (match) {
    const bucket = match[1] as UploadBucket;
    const path = match[2];
    try {
      return await getSignedUrl(bucket, path);
    } catch {
      return null;
    }
  }

  // Legacy filesystem: devolver tal cual (solo funciona en dev local)
  if (stored.startsWith("/uploads/") || stored.startsWith("/")) {
    const base = process.env.STORE_PUBLIC_BASE || process.env.NEXT_PUBLIC_BASE_URL || "";
    return `${base}${stored}`;
  }

  // URL absoluta (http/https) — devolver tal cual
  return stored;
}

/** Helper para storage path serializado en BD: "bucket://path" */
export function buildStoragePath(bucket: UploadBucket, path: string): string {
  return `${bucket}://${path}`;
}
