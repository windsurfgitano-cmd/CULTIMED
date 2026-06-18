// Upload helper para cultisoft (admin-side).
// Usa Supabase Storage; devuelve "bucket://path" para guardar en BD.

import { uploadFile, buildStoragePath, type UploadBucket } from "./storage";

/**
 * Sube un archivo a Supabase Storage.
 *
 * @param file - El archivo a subir
 * @param bucket - Bucket destino ("prescriptions" | "payment-proofs" | "documents" | "patient-documents")
 * @param userId - ID del usuario para la ruta
 * @param docType - Tipo de documento (ej: "comprobante", "receta")
 *
 * Retorna referencia "bucket://path" para guardar en BD.
 */
export async function saveUploadedFile(
  file: File,
  bucket: UploadBucket,
  userId: string,
  docType: string
): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const ext = (() => {
    const m = file.name.match(/\.[a-z0-9]+$/i);
    return m ? m[0].toLowerCase() : ".bin";
  })();

  const fileName = `${docType}${ext}`;
  const result = await uploadFile({
    bucket,
    userId: userId || "anon",
    fileName,
    buffer,
    contentType: file.type || undefined,
  });

  return buildStoragePath(bucket, result.path);
}