// Upload helper. Ahora usa Supabase Storage en lugar del filesystem local
// (que no funciona en Vercel serverless).
//
// Devuelve una referencia "bucket://path" que se guarda en BD. Para mostrar
// el archivo se usa `resolveStorageUrl()` desde lib/storage.ts.

import { uploadFile, buildStoragePath, type UploadBucket } from "./storage";

/**
 * Sube un archivo a Supabase Storage.
 * `subdir` ahora se usa solo para determinar el bucket:
 *   - "prescriptions/<id>" → bucket "prescriptions"
 *   - "payment-proofs/<id>" → bucket "payment-proofs"
 *
 * Retorna la referencia "bucket://path" para guardar en BD.
 */
export async function saveUploadedFile(file: File, subdir: string): Promise<string> {
  const [folder, userId] = subdir.split("/");
  const bucket: UploadBucket = folder === "payment-proofs" ? "payment-proofs" : "prescriptions";

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const ext = (() => {
    const m = file.name.match(/\.[a-z0-9]+$/i);
    return m ? m[0].toLowerCase() : ".bin";
  })();

  const fileName = `receta${ext}`;
  const result = await uploadFile({
    bucket,
    userId: userId || "anon",
    fileName,
    buffer,
    contentType: file.type || undefined,
  });

  // Guardamos en BD el formato "bucket://path" que después resolveStorageUrl convierte a signed URL.
  return buildStoragePath(bucket, result.path);
}
