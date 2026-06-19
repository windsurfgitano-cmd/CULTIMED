"use client";

import { useState } from "react";

const SEGMENTS = [
  { id: "all", label: "Todos (1 email / paciente)", desc: "Plantilla de mayor prioridad por persona" },
  { id: "no_web_account", label: "Sin cuenta web", desc: "Invitación a registrarse" },
  { id: "missing_docs", label: "Docs críticos faltantes", desc: "Receta o carnet pendiente" },
  { id: "no_valid_rx", label: "Sin receta válida", desc: "Subir o resubir receta" },
  { id: "complete_profile", label: "Ficha incompleta", desc: "RUT, teléfono, comuna, etc." },
  { id: "activation_reminder", label: "Cuenta sin activar", desc: "Link para definir contraseña" },
] as const;

interface PreviewRow {
  patient_id: number;
  name: string;
  email: string;
  template: string;
  reason: string;
  subject: string;
}

interface CampaignStats {
  queued: number;
  totalCandidates: number;
  sent: number;
  failed: number;
  skipped: Record<string, number>;
  preview: PreviewRow[];
  errors: Array<{ patient_id?: number; email?: string; error: string }>;
}

export default function OutreachEmailPanel() {
  const [segment, setSegment] = useState<string>("all");
  const [limit, setLimit] = useState(20);
  const [cooldownDays, setCooldownDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastDryRun, setLastDryRun] = useState(true);

  async function runCampaign(dryRun: boolean) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/outreach/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment, limit, cooldownDays, dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al ejecutar campaña");
      setStats(data.stats);
      setLastDryRun(dryRun);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const segmentMeta = SEGMENTS.find((s) => s.id === segment);

  return (
    <section className="mb-10 clinical-card p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-6">
        <div>
          <p className="eyebrow text-ink-subtle mb-1">— Automatización</p>
          <h2 className="font-display text-2xl text-ink tracking-tight">Emails de campaña</h2>
          <p className="text-sm text-ink-muted mt-2 max-w-xl">
            Envío masivo vía Resend. Cada paciente recibe como máximo un email por ejecución.
            Se registra en bitácora y se respeta cooldown para no spamear.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <button
            type="button"
            className="btn-secondary"
            disabled={loading}
            onClick={() => runCampaign(true)}
          >
            {loading && lastDryRun ? "Calculando…" : "Vista previa"}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={loading}
            onClick={() => {
              if (
                !window.confirm(
                  `¿Enviar hasta ${limit} emails del segmento "${segmentMeta?.label}"? Esta acción no se puede deshacer.`
                )
              ) {
                return;
              }
              runCampaign(false);
            }}
          >
            {loading && !lastDryRun ? "Enviando…" : "Enviar emails"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <label className="block">
          <span className="text-[11px] font-mono uppercase tracking-widest text-ink-muted">
            Segmento
          </span>
          <select
            className="mt-1 w-full border border-rule-soft bg-paper-bright px-3 py-2 text-sm"
            value={segment}
            onChange={(e) => setSegment(e.target.value)}
          >
            {SEGMENTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {segmentMeta && (
            <span className="text-xs text-ink-muted mt-1 block">{segmentMeta.desc}</span>
          )}
        </label>
        <label className="block">
          <span className="text-[11px] font-mono uppercase tracking-widest text-ink-muted">
            Límite por ejecución
          </span>
          <input
            type="number"
            min={1}
            max={200}
            className="mt-1 w-full border border-rule-soft bg-paper-bright px-3 py-2 text-sm"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || 20)}
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-mono uppercase tracking-widest text-ink-muted">
            Cooldown (días)
          </span>
          <input
            type="number"
            min={0}
            max={90}
            className="mt-1 w-full border border-rule-soft bg-paper-bright px-3 py-2 text-sm"
            value={cooldownDays}
            onChange={(e) => setCooldownDays(Number(e.target.value) || 7)}
          />
          <span className="text-xs text-ink-muted mt-1 block">
            Omite pacientes con email enviado en los últimos N días
          </span>
        </label>
      </div>

      {error && (
        <div className="mb-4 p-3 border border-error/30 bg-error/5 text-sm text-error">
          {error}
        </div>
      )}

      {stats && (
        <div className="border border-rule-soft bg-paper-dim/20 p-4">
          <p className="text-[11px] font-mono uppercase tracking-widest text-ink-muted mb-3">
            {lastDryRun ? "Vista previa" : "Resultado envío"} · {stats.queued} en cola ·{" "}
            {stats.totalCandidates} candidatos · {stats.sent} OK · {stats.failed} fallidos
          </p>
          {stats.preview.length > 0 && (
            <div className="overflow-x-auto">
              <table className="table-clinical text-sm">
                <thead>
                  <tr>
                    <th>Paciente</th>
                    <th>Email</th>
                    <th>Plantilla</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.preview.slice(0, 20).map((row) => (
                    <tr key={row.patient_id}>
                      <td>
                        <span className="font-semibold">{row.name}</span>
                        <span className="block text-[11px] font-mono text-ink-muted">
                          #{row.patient_id}
                        </span>
                      </td>
                      <td className="font-mono text-[12px]">{row.email}</td>
                      <td>{row.template}</td>
                      <td className="text-ink-muted">{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!lastDryRun && stats.errors.length > 0 && (
            <ul className="mt-3 text-xs text-error space-y-1">
              {stats.errors.map((e, i) => (
                <li key={i}>
                  #{e.patient_id} {e.email}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}