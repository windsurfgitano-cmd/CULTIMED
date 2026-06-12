"use client";

import { useState, useRef } from "react";

export default function OcrClientPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setLinked(false);

    const form = e.currentTarget;
    const fd = new FormData(form);
    const file = fd.get("file") as File;
    if (!file || file.size === 0) {
      setError("Selecciona un archivo.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/ocr", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) { setError(json.error); } else { setResult(json); }
    } catch (e: any) {
      setError(e?.message || "Error de conexión");
    }
    setLoading(false);
  }

  async function linkRut(accountId: number, rut: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/ocr/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId, rut }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); } else { setLinked(true); }
    } catch (e: any) {
      setError(e?.message || "Error");
    }
    setLoading(false);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <div className="border border-rule bg-paper-bright p-5">
          <div className="flex items-baseline gap-3 mb-4">
            <span className="editorial-numeral text-sm text-ink-subtle">— I</span>
            <span className="eyebrow">Subir carnet</span>
          </div>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            <input
              type="file"
              name="file"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
              className="block w-full text-sm text-ink-muted file:mr-4 file:py-2 file:px-4 file:border-0 file:text-[11px] file:font-mono file:uppercase file:tracking-widest file:bg-forest file:text-paper hover:file:bg-forest/90"
            />
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Procesando..." : "Extraer RUT"}
            </button>
          </form>
        </div>
      </div>

      <div className="space-y-8">
        <div>
          <div className="flex items-baseline gap-3 mb-4">
            <span className="editorial-numeral text-sm text-ink-subtle">— II</span>
            <span className="eyebrow">Resultado</span>
          </div>

          {error && (
            <div className="border border-sangria bg-sangria/10 p-5 mb-4">
              <p className="text-sm text-sangria">{error}</p>
            </div>
          )}

          {linked && (
            <div className="border border-forest bg-forest/10 p-5 mb-4">
              <p className="text-sm text-forest">RUT vinculado correctamente.</p>
            </div>
          )}

          {result && (
            <div className="space-y-5">
              <div className="border border-rule bg-paper-bright p-5">
                <p className="eyebrow text-ink-subtle mb-2">Archivo</p>
                <p className="text-sm text-ink font-mono break-all">{result.fileName}</p>
              </div>

              {result.rutFormatted ? (
                <div className="border border-forest bg-forest/10 p-5">
                  <p className="eyebrow text-forest mb-1">RUT detectado</p>
                  <p className="font-display text-2xl text-forest">{result.rutFormatted}</p>
                </div>
              ) : (
                <div className="border border-rule bg-paper-bright p-5">
                  <p className="text-sm text-ink-muted italic">No se detectó un RUT válido en la imagen.</p>
                </div>
              )}

              {result.candidates && result.candidates.length > 0 && (
                <div>
                  <p className="eyebrow text-ink-subtle mb-3">Cuentas candidatas</p>
                  <div className="space-y-2">
                    {result.candidates.filter((c: any) => !c.rut).map((c: any) => (
                      <div key={c.id} className="flex items-center justify-between border border-rule bg-paper-bright p-4">
                        <div>
                          <p className="text-sm text-ink">{c.full_name}</p>
                          <p className="text-[11px] font-mono text-ink-muted">{c.email}</p>
                        </div>
                        <button
                          onClick={() => linkRut(c.id, result.rutFormatted)}
                          disabled={loading}
                          className="text-[11px] font-mono uppercase tracking-widest text-forest hover:text-forest/70 underline-offset-4 hover:underline disabled:opacity-50"
                        >
                          Vincular
                        </button>
                      </div>
                    ))}
                    {result.candidates.filter((c: any) => !c.rut).length === 0 && (
                      <p className="text-sm text-ink-muted italic">Todas las cuentas candidatas ya tienen RUT.</p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <p className="eyebrow text-ink-subtle mb-2">Texto extraído (vista previa)</p>
                <pre className="border border-rule bg-paper-dim p-4 text-xs font-mono text-ink-muted whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                  {result.text}
                </pre>
              </div>
            </div>
          )}

          {!result && !error && (
            <p className="text-sm text-ink-muted italic">
              Sube un carnet para ver el RUT extraído y las cuentas candidatas.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
