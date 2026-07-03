"use client";

// Sube el comprobante de transferencia DIRECTO a Supabase Storage —
// bypass del límite de ~4.5MB por request de las funciones serverless de
// Vercel (server actions incluidas), que hacía fallar en silencio fotos de
// comprobantes reales tomadas con celular.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadAndAttach, UploadError } from "@/lib/client-upload";

export default function UploadProofForm({ orderId }: { orderId: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (f && f.size > 8 * 1024 * 1024) {
      setError("El archivo supera 8 MB.");
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
      await uploadAndAttach("payment_proof", file, { orderId });
      router.push(`/checkout/${orderId}?ok=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof UploadError ? err.message : "No pudimos subir el comprobante. Intenta de nuevo.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6">
      {error && (
        <div className="mb-4 p-4 bg-sangria/10 border-l-2 border-sangria">
          <p className="text-sm text-ink">{error}</p>
        </div>
      )}
      <label
        htmlFor="proof"
        className="block border-2 border-dashed border-rule hover:border-ink p-10 lg:p-12 text-center bg-paper-bright transition-all cursor-pointer"
      >
        <input
          ref={inputRef}
          id="proof"
          name="proof"
          type="file"
          accept=".pdf,image/jpeg,image/png"
          onChange={onChange}
          className="sr-only"
        />
        {file ? (
          <>
            <p className="font-display text-2xl italic mb-2">{file.name}</p>
            <p className="text-xs font-mono uppercase tracking-widest text-ink-muted">
              {(file.size / 1024 / 1024).toFixed(1)} MB · listo para enviar
            </p>
          </>
        ) : (
          <>
            <p className="font-display text-2xl italic mb-2">Selecciona archivo</p>
            <p className="text-xs font-mono uppercase tracking-widest text-ink-muted">
              Comprobante en PDF, JPG o PNG · máx 8 MB
            </p>
          </>
        )}
      </label>
      <button type="submit" disabled={!file || pending} className="btn-brass w-full mt-4 disabled:opacity-50 disabled:cursor-not-allowed">
        {pending ? "Enviando…" : "Enviar comprobante"}
      </button>
    </form>
  );
}
