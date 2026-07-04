"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadAndAttach, UploadError, type UploadTarget } from "@/lib/client-upload";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

export default function DocumentUpload({
  target,
  label,
  uploaded,
}: {
  target: Exclude<UploadTarget, "payment_proof">;
  label: string;
  uploaded: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (pending) return;
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size > MAX_BYTES) {
      setError("El archivo supera 8 MB.");
      return;
    }
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) {
      setError("Formato no aceptado. Sube PDF, JPG o PNG.");
      return;
    }
    setPending(true);
    try {
      await uploadAndAttach(target, file);
      router.refresh();
    } catch (err) {
      setError(err instanceof UploadError ? err.message : "No pudimos subir el archivo. Intenta de nuevo.");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="py-3 border-b border-rule-soft">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-ink">{label}</span>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-xs font-mono ${uploaded ? "text-forest" : "text-ink-subtle"}`}>
            {uploaded ? "Subido" : "Falta"}
          </span>
          <label className="text-[11px] uppercase tracking-widest font-mono text-ink-muted hover:text-ink border-b border-ink/20 hover:border-ink pb-0.5 cursor-pointer transition-colors">
            {pending ? "Subiendo…" : uploaded ? "Reemplazar" : "Subir"}
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              onChange={onChange}
              disabled={pending}
              className="sr-only"
            />
          </label>
        </div>
      </div>
      {error && <p className="text-xs text-sangria mt-1.5">{error}</p>}
    </div>
  );
}
