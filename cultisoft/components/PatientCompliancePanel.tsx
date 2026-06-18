import type { ReactNode } from "react";
import clsx from "clsx";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";
import type { ComplianceCheckItem, PatientComplianceSummary } from "@/lib/patient-compliance";
import StatusBadge from "@/components/StatusBadge";
import PatientRxOcrButton from "@/components/PatientRxOcrButton";

const ALERT_STYLES = {
  ok: {
    banner: "bg-success-container/40 border-success",
    icon: "check_circle",
    label: "Compliance en orden",
  },
  warn: {
    banner: "bg-warning-container/40 border-warning",
    icon: "warning",
    label: "Revisar antes de dispensar",
  },
  critical: {
    banner: "bg-error-container/40 border-error",
    icon: "error",
    label: "Bloqueo o riesgo crítico",
  },
} as const;

const CHECK_ICONS: Record<
  ComplianceCheckItem["status"] | "unknown",
  { icon: string; cls: string; fill?: boolean }
> = {
  ok: { icon: "check_circle", cls: "text-success", fill: true },
  fail: { icon: "cancel", cls: "text-error", fill: true },
  warn: { icon: "warning", cls: "text-warning", fill: true },
  pending: { icon: "hourglass_empty", cls: "text-on-surface-variant" },
  unknown: { icon: "help_outline", cls: "text-on-surface-variant" },
};

const RX_SOURCE_LABELS: Record<string, string> = {
  internal: "Receta interna",
  web_ocr: "Receta web + OCR",
  web: "Receta web",
  none: "Sin receta",
};

export default function PatientCompliancePanel({
  compliance,
  canRunOcr,
  patientId,
  primaryAccountId,
}: {
  compliance: PatientComplianceSummary;
  canRunOcr: boolean;
  patientId: number;
  primaryAccountId: number | null;
}) {
  const alert = ALERT_STYLES[compliance.alertLevel] ?? ALERT_STYLES.warn;
  const gramsPct =
    compliance.monthlyGramLimit > 0
      ? Math.min(100, Math.round((compliance.monthlyGramsUsed / compliance.monthlyGramLimit) * 100))
      : 0;
  const gramsTone = gramsPct >= 100 ? "critical" : gramsPct >= 85 ? "warn" : "ok";

  const expiryDays = compliance.daysToRxExpiry;
  const expiryTone =
    expiryDays === null
      ? "neutral"
      : expiryDays < 0
        ? "critical"
        : expiryDays <= 30
          ? "warn"
          : "ok";

  const criticalChecks = compliance.checks.filter((c) => c.status === "fail");

  return (
    <section
      id="revision"
      className="clinical-card overflow-hidden mb-8 scroll-mt-28"
      aria-labelledby="compliance-panel-title"
    >
      <div className="p-6 border-b border-outline-variant/40 bg-surface-container-low/50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <span className="material-symbols-outlined text-primary text-[28px] shrink-0">
              fact_check
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                Modo revisión
              </p>
              <h2 id="compliance-panel-title" className="text-xl font-bold text-on-surface mt-0.5">
                Compliance SANNA
              </h2>
              <p className="text-sm text-on-surface-variant mt-1">
                Paciente #{patientId} · {RX_SOURCE_LABELS[compliance.rxSource] || compliance.rxSource}
              </p>
            </div>
          </div>

          {canRunOcr && primaryAccountId !== null && (
            <PatientRxOcrButton accountId={primaryAccountId} patientId={patientId} />
          )}
        </div>
      </div>

      <div className={clsx("p-4 border-l-4 flex items-start gap-3", alert.banner)}>
        <span
          className={clsx(
            "material-symbols-outlined text-[22px] shrink-0",
            compliance.alertLevel === "ok"
              ? "text-success ms-fill"
              : compliance.alertLevel === "warn"
                ? "text-warning ms-fill"
                : "text-error ms-fill"
          )}
        >
          {alert.icon}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-on-surface">{alert.label}</p>
          {criticalChecks.length > 0 && (
            <p className="text-sm text-on-surface-variant mt-1">
              {criticalChecks.map((c) => c.detail).join(" · ")}
            </p>
          )}
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 border-b border-outline-variant/40">
        <MetricCard label="Gramos mes">
          <p className="text-2xl font-light text-on-surface tabular-nums">
            {formatNumber(compliance.monthlyGramsUsed)}
            <span className="text-base text-on-surface-variant ml-1">
              / {formatNumber(compliance.monthlyGramLimit)} g
            </span>
          </p>
          <div className="mt-3 h-2 w-full bg-surface-container-high rounded-full overflow-hidden">
            <div
              className={clsx(
                "h-full transition-all",
                gramsTone === "critical"
                  ? "bg-error"
                  : gramsTone === "warn"
                    ? "bg-warning"
                    : "bg-primary"
              )}
              style={{ width: `${gramsPct}%` }}
            />
          </div>
          <p
            className={clsx(
              "text-xs mt-2 font-medium",
              gramsTone === "critical"
                ? "text-error"
                : gramsTone === "warn"
                  ? "text-warning"
                  : "text-on-surface-variant"
            )}
          >
            {compliance.monthlyPercent}% del cupo mensual
          </p>
        </MetricCard>

        <MetricCard label="Vencimiento receta">
          <p
            className={clsx(
              "text-2xl font-light tabular-nums",
              expiryTone === "critical"
                ? "text-error font-semibold"
                : expiryTone === "warn"
                  ? "text-warning font-semibold"
                  : "text-on-surface"
            )}
          >
            {expiryDays === null
              ? "—"
              : expiryDays < 0
                ? `Vencida (${Math.abs(expiryDays)}d)`
                : `${expiryDays}d`}
          </p>
          <p className="text-sm text-on-surface-variant mt-2">
            {compliance.rxExpiryDate ? formatDate(compliance.rxExpiryDate) : "Sin fecha"}
          </p>
        </MetricCard>

        <MetricCard label="Médico tratante">
          <p className="text-sm font-medium text-on-surface leading-snug">
            {compliance.rxDoctorName || "—"}
          </p>
        </MetricCard>

        <MetricCard label="Estado receta web">
          <StatusBadge status={compliance.webRxStatus || "none"} />
        </MetricCard>

        <MetricCard label="Documentos">
          <p className="text-2xl font-light text-on-surface tabular-nums">
            {compliance.documentsUploaded}
            <span className="text-base text-on-surface-variant ml-1">
              / {compliance.documentsTotal}
            </span>
          </p>
          <div className="mt-3 flex gap-1">
            {Array.from({ length: compliance.documentsTotal }).map((_, i) => (
              <span
                key={i}
                className={clsx(
                  "h-2 flex-1 rounded-full",
                  i < compliance.documentsUploaded ? "bg-primary" : "bg-surface-container-high"
                )}
              />
            ))}
          </div>
        </MetricCard>
      </div>

      <div className="p-6 border-b border-outline-variant/40">
        <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4">
          <span className="material-symbols-outlined text-primary text-[20px]">playlist_add_check</span>
          Checklist QF
        </h3>
        <div className="clinical-card overflow-x-auto border border-outline-variant/40">
          <table className="table-clinical">
            <thead>
              <tr>
                <th className="w-12">Estado</th>
                <th>Criterio</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {compliance.checks.map((check) => {
                const meta = CHECK_ICONS[check.status] ?? CHECK_ICONS.unknown;
                return (
                  <tr key={check.id}>
                    <td>
                      <span
                        className={clsx(
                          "material-symbols-outlined text-[20px]",
                          meta.cls,
                          meta.fill && "ms-fill"
                        )}
                        title={check.status}
                      >
                        {meta.icon}
                      </span>
                    </td>
                    <td className="font-medium text-on-surface">{check.label}</td>
                    <td className="text-sm text-on-surface-variant">{check.detail || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-secondary text-[20px]">local_pharmacy</span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Última dispensación
            </p>
            <p className="text-on-surface font-medium mt-0.5">
              {compliance.lastDispensationAt
                ? formatDateTime(compliance.lastDispensationAt)
                : "Sin registros"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-[20px]">shopping_cart</span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
              Último pedido web
            </p>
            <p className="text-on-surface font-medium mt-0.5">
              {compliance.lastWebOrderAt
                ? formatDateTime(compliance.lastWebOrderAt)
                : "Sin registros"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function MetricCard({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-outline-variant/40 p-4 bg-surface-container-lowest/60">
      <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
        {label}
      </p>
      {children}
    </div>
  );
}