"use client";

import { useState, useRef } from "react";

const MAX_BYTES = 8 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function FileUploadField({
  name,
  label,
  accept = ".pdf,.png,.jpg,.jpeg",
  required = false,
  onFileChange,
  status,
}: {
  name: string;
  label: string;
  accept?: string;
  required?: boolean;
  /** Recibe el File seleccionado (o null si se quita). */
  onFileChange?: (file: File | null) => void;
  /** Estado de subida controlado desde el padre (opcional, para flujos de upload directo). */
  status?: "idle" | "uploading" | "done" | "error";
}) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    if (!f) {
      setFile(null);
      onFileChange?.(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`El archivo supera 8 MB (${formatBytes(f.size)}).`);
      setFile(null);
      onFileChange?.(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    setFile(f);
    onFileChange?.(f);
  }

  function clearFile() {
    setFile(null);
    setError(null);
    onFileChange?.(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  const borderCls =
    status === "error" ? "border-sangria bg-sangria/5"
    : status === "done" ? "border-forest bg-forest/5"
    : "border-forest bg-forest/5";

  return (
    <div>
      <label className="input-label">{label} {required && "*"}</label>
      <div className="mt-2">
        {file ? (
          <div className={`border ${borderCls} p-4 flex items-center justify-between`}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs font-mono text-ink-muted mt-0.5 nums-lining">
                {formatBytes(file.size)}
                {status === "uploading" && " · subiendo…"}
                {status === "done" && " · ✓ subido"}
                {status === "error" && " · falló, reintenta"}
              </p>
            </div>
            {status !== "uploading" && (
              <button type="button" onClick={clearFile} className="text-xs uppercase tracking-widest font-mono text-sangria hover:text-sangria/70 ml-4 shrink-0">
                Quitar
              </button>
            )}
            {status === "uploading" && (
              <span className="ml-4 shrink-0 w-4 h-4 border-2 border-ink-muted border-t-transparent rounded-full animate-spin" aria-hidden />
            )}
          </div>
        ) : (
          <label htmlFor={name} className="block border-2 border-dashed border-rule hover:border-ink bg-paper-bright p-8 text-center cursor-pointer transition-colors">
            <p className="font-display text-lg italic text-ink-muted">Seleccionar archivo</p>
            <p className="text-xs text-ink-muted font-mono uppercase tracking-widest mt-2">{accept.replace(/,/g, " · ")} · máx 8 MB</p>
          </label>
        )}
        <input ref={inputRef} id={name} name={name} type="file" accept={accept} onChange={onChange} required={required} className="sr-only" />
      </div>
      {error && <p className="mt-2 text-xs text-sangria">{error}</p>}
    </div>
  );
}
