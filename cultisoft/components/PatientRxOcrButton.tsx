"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";

export default function PatientRxOcrButton({
  accountId,
  patientId,
}: {
  accountId: number;
  patientId: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function handleClick() {
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/ocr/prescription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: accountId }),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage({ tone: "error", text: json.error || "No se pudo extraer la receta." });
        return;
      }

      const confidence = json.data?.confidence;
      const saved = json.saved !== false;
      const warning = json.warning as string | undefined;

      setMessage({
        tone: "success",
        text: saved
          ? `OCR completado${confidence ? ` (${confidence})` : ""}. Datos guardados para paciente #${patientId}.`
          : warning || "OCR completado, pero los datos no se guardaron en la cuenta.",
      });

      router.refresh();
    } catch (e: unknown) {
      const err = e as { message?: string };
      setMessage({ tone: "error", text: err?.message || "Error de conexión." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2 shrink-0">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="btn-secondary text-sm whitespace-nowrap"
      >
        <span className="material-symbols-outlined text-base">
          {loading ? "hourglass_top" : "document_scanner"}
        </span>
        {loading ? "Extrayendo OCR…" : "Extraer datos OCR de receta"}
      </button>

      {message && (
        <p
          role="status"
          className={clsx(
            "text-xs max-w-xs text-right",
            message.tone === "success" ? "text-success" : "text-error"
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}