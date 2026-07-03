"use client";

// Carga manual de comprobante por el staff (cuando el cliente lo manda por
// WhatsApp en vez de subirlo a la web). Sube DIRECTO a Supabase Storage
// desde el navegador — evita el límite duro de ~4.5MB por request que
// Vercel impone a las funciones serverless (server actions incluidas),
// que podía romper la subida de una foto de comprobante real.

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPaymentProof, UploadError } from "@/lib/client-upload";

export default function AdminUploadProofForm({
  orderId,
  customerAccountId,
  isReplacing = false,
}: {
  orderId: number;
  customerAccountId: number;
  isReplacing?: boolean;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [channel, setChannel] = useState("whatsapp");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
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
      await uploadPaymentProof(file, orderId, customerAccountId, { channel, notes });
      router.push(`/web-orders/${orderId}?ok=proof_uploaded`);
      router.refresh();
    } catch (err) {
      setError(err instanceof UploadError ? err.message : "No pudimos subir el comprobante.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg mx-auto">
      {error && (
        <div className="p-3 bg-error-container/40 border-l-4 border-error rounded-r-lg">
          <p className="text-sm text-on-error-container">{error}</p>
        </div>
      )}

      <div>
        <label htmlFor={`proof-${orderId}`} className="input-label">Archivo (PDF / JPG / PNG · máx 8MB)</label>
        <input
          ref={inputRef}
          type="file"
          id={`proof-${orderId}`}
          name="proof"
          accept=".pdf,image/jpeg,image/png,image/webp"
          onChange={onFileChange}
          className="block w-full text-sm text-ink-muted file:mr-3 file:py-2 file:px-4 file:border file:border-rule file:bg-paper-dim/30 file:text-xs file:uppercase file:tracking-widest file:font-mono file:cursor-pointer hover:file:bg-paper-dim/60"
        />
        {file && (
          <p className="mt-1 text-[11px] font-mono text-on-surface-variant nums-lining">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`channel-${orderId}`} className="input-label">¿Por dónde lo envió el cliente?</label>
          <select
            id={`channel-${orderId}`}
            name="channel"
            className="input-field"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="email">Email</option>
            <option value="in-person">Presencial</option>
            <option value="manual">Otro / Manual</option>
          </select>
        </div>
        <div>
          <label htmlFor={`notes-${orderId}`} className="input-label">Notas (opcional)</label>
          <input
            type="text"
            id={`notes-${orderId}`}
            name="notes"
            placeholder="Ej: Pago de $143.991 vía Santander"
            className="input-field"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-1">
        <button type="submit" disabled={!file || pending} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
          <span className="material-symbols-outlined text-base">upload_file</span>
          {pending ? "Subiendo…" : isReplacing ? "Reemplazar comprobante" : "Cargar comprobante"}
        </button>
      </div>

      <p className="text-[11px] text-on-surface-variant text-center">
        Queda registrado en bitácora con tu cuenta como cargador manual + canal de entrega.
      </p>
    </form>
  );
}
