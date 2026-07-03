"use client";

// Staff sube un documento en nombre del paciente (carnet, receta,
// antecedentes, comprobante de depósito) — directo a Supabase Storage,
// evitando el límite duro de ~4.5MB por request de Vercel.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPatientDocument, UploadError } from "@/lib/client-upload";

type DocType = "id_front" | "id_back" | "criminal_record" | "prescription" | "rights_assignment";

export default function StaffDocumentUploadForm({
  customerId,
  docType,
}: {
  customerId: number;
  docType: DocType;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (f && f.size > 8 * 1024 * 1024) {
      setError("Supera 8 MB.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(f);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return;
    setError(null);
    setPending(true);
    try {
      await uploadPatientDocument(file, customerId, docType);
      router.refresh();
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof UploadError ? err.message : "No pudimos subir el documento.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-2 p-3 border border-dashed border-outline-variant rounded-lg bg-surface-container-low">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf,.webp"
          onChange={onChange}
          className="flex-1 text-sm"
        />
        <button type="submit" disabled={!file || pending} className="btn-secondary text-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed">
          <span className="material-symbols-outlined text-base">upload</span>
          {pending ? "Subiendo…" : "Subir"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </form>
  );
}
