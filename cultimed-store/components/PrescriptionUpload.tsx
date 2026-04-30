"use client";

import { useState, useRef, useCallback } from "react";
import { useFormStatus } from "react-dom";

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className={
        "btn-brass disabled:opacity-50 disabled:cursor-not-allowed transition-all " +
        (pending ? "animate-pulse" : "")
      }
    >
      {pending ? (
        <>
          <SpinnerIcon />
          Enviando…
        </>
      ) : (
        "Enviar a validación"
      )}
    </button>
  );
}

export default function PrescriptionUpload({
  action,
}: {
  action: (formData: FormData) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File | null) => {
    setError(null);
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`El archivo supera 8 MB (pesa ${formatBytes(f.size)}).`);
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) {
      setError("Formato no aceptado. Sube PDF, JPG o PNG.");
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    setFile(f);
    if (f.type.startsWith("image/")) {
      const url = URL.createObjectURL(f);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }
  }, []);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFile(e.target.files?.[0] ?? null);
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
      handleFile(f);
    }
  }

  function clearFile() {
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <form action={action} className="space-y-8">
      <div>
        <label className="input-label mb-4">Archivo</label>

        {/* Drop zone OR preview */}
        {file ? (
          <FilePreview
            file={file}
            previewUrl={previewUrl}
            onClear={clearFile}
            onReplace={() => inputRef.current?.click()}
          />
        ) : (
          <label
            htmlFor="prescription"
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={
              "block border-2 border-dashed p-12 lg:p-16 text-center cursor-pointer transition-all duration-300 " +
              (dragOver
                ? "border-brass bg-brass/5 scale-[1.01]"
                : "border-rule hover:border-ink bg-paper-bright")
            }
          >
            <div className="flex flex-col items-center gap-4">
              <UploadIcon dragOver={dragOver} />
              <p className="font-display text-2xl italic text-ink">
                {dragOver ? "Suelta el archivo aquí" : "Selecciona o arrastra aquí"}
              </p>
              <p className="text-xs text-ink-muted font-mono uppercase tracking-widest">
                PDF · JPG · PNG · máx 8 MB
              </p>
            </div>
          </label>
        )}

        <input
          ref={inputRef}
          id="prescription"
          name="prescription"
          type="file"
          accept={ACCEPT}
          onChange={onChange}
          className="sr-only"
        />

        {error && (
          <div className="mt-3 p-3 bg-sangria/10 border-l-2 border-sangria flex items-start gap-2">
            <ErrorIcon />
            <p className="text-sm text-ink">{error}</p>
          </div>
        )}
      </div>

      <div className="hairline" />

      <div>
        <p className="eyebrow mb-4">— Antes de subir, asegúrate</p>
        <ul className="space-y-3">
          {[
            "La receta esté vigente (no más de 30 días desde la emisión, o según indicación del médico)",
            "Se vea claro: nombre del paciente, médico, especialidad, RUT, productos prescritos",
            "Esté firmada y timbrada por el profesional tratante",
            "Si es retenida (estupefaciente), incluye original y copia",
          ].map((b, i) => (
            <li key={i} className="flex items-baseline gap-4 text-sm text-ink-muted">
              <span className="editorial-numeral text-base text-ink-subtle w-8 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="leading-relaxed">{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <SubmitButton disabled={!file} />
    </form>
  );
}

function FilePreview({
  file, previewUrl, onClear, onReplace,
}: {
  file: File;
  previewUrl: string | null;
  onClear: () => void;
  onReplace: () => void;
}) {
  return (
    <div className="border border-forest bg-forest/5 p-5 lg:p-6 animate-fade-in">
      <div className="flex items-start gap-5">
        <div className="shrink-0 w-20 h-20 lg:w-24 lg:h-24 border border-rule bg-paper-bright flex items-center justify-center overflow-hidden">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={file.name} className="w-full h-full object-cover" />
          ) : (
            <PdfIcon />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <CheckIcon />
            <p className="eyebrow text-forest">— Listo para enviar</p>
          </div>
          <p className="font-display text-xl truncate" title={file.name}>{file.name}</p>
          <p className="text-xs font-mono uppercase tracking-widest text-ink-muted mt-1 nums-lining">
            {formatBytes(file.size)} · {file.type || "archivo"}
          </p>
          <div className="flex gap-4 mt-4">
            <button
              type="button"
              onClick={onReplace}
              className="text-xs uppercase tracking-widest font-mono text-ink-muted hover:text-ink border-b border-ink/20 hover:border-ink pb-0.5 transition-colors"
            >
              Reemplazar archivo
            </button>
            <button
              type="button"
              onClick={onClear}
              className="text-xs uppercase tracking-widest font-mono text-ink-muted hover:text-sangria border-b border-transparent hover:border-sangria pb-0.5 transition-colors"
            >
              Quitar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────  ICONS  ─────────

function UploadIcon({ dragOver }: { dragOver: boolean }) {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 48 48"
      fill="none"
      className={
        "transition-all duration-300 " +
        (dragOver ? "text-brass scale-110 -translate-y-1" : "text-brass-dim")
      }
    >
      <path
        d="M24 32V16M24 16L16 24M24 16L32 24"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="12" y="36" width="24" height="2" fill="currentColor" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="32" height="40" viewBox="0 0 32 40" fill="none" className="text-brass-dim">
      <path d="M2 2h18l10 10v26H2V2z" stroke="currentColor" strokeWidth="1" />
      <path d="M20 2v10h10" stroke="currentColor" strokeWidth="1" />
      <text
        x="16" y="28"
        textAnchor="middle"
        fontFamily="JetBrains Mono"
        fontSize="7"
        letterSpacing="0.1em"
        fill="currentColor"
      >
        PDF
      </text>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-forest">
      <path d="M2 7L6 11L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-sangria mt-0.5 shrink-0">
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
      <line x1="7" y1="4" x2="7" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="7" cy="10" r="0.5" fill="currentColor" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="animate-spin">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" strokeOpacity="0.3" />
      <path d="M12.5 7C12.5 4 10 1.5 7 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
