// Upload helper para cultisoft (admin-side).
// Reusa la misma lógica que cultimed-store/lib/uploads.ts.
import { uploadFile, buildStoragePath, type UploadBucket } from "./storage";

/**
 * Sube un archivo a Supabase Storage.
 * subdir prefix determina el bucket:
 *   - "prescriptions/<id>" → bucket "prescriptions"
 *   - "payment-proofs/<id>" → bucket "payment-proofs"
 * Retorna referencia "bucket://path" para guardar en BD.
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

  const fileName = `comprobante${ext}`;
  const result = await uploadFile({
    bucket,
    userId: userId || "anon",
    fileName,
    buffer,
    contentType: file.type || undefined,
  });

  return buildStoragePath(bucket, result.path);
}
