// Local file storage helper. For local MVP only — production should use S3 or similar.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

export async function saveUploadedFile(file: File, subdir: string): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, subdir);
  fs.mkdirSync(dir, { recursive: true });

  const ext = (() => {
    const m = file.name.match(/\.[a-z0-9]+$/i);
    return m ? m[0].toLowerCase() : ".bin";
  })();
  const filename = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`;
  const fullPath = path.join(dir, filename);

  const arrayBuffer = await file.arrayBuffer();
  fs.writeFileSync(fullPath, Buffer.from(arrayBuffer));

  // Return public URL path
  return `/uploads/${subdir}/${filename}`;
}
