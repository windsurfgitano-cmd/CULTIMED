import clsx from "clsx";

export default function KpiCard({
  numeral,
  label,
  value,
  delta,
  tone = "neutral",
}: {
  numeral?: string;
  label: string;
  value: string | number;
  delta?: { text: string; tone?: "success" | "warning" | "error" | "neutral" };
  tone?: "neutral" | "success" | "warning" | "error";
  /** legacy prop, ignored */
  icon?: string;
}) {
  const toneStyles = {
    neutral: "text-ink",
    success: "text-forest",
    warning: "text-brass-dim",
    error: "text-sangria",
  }[tone];

  const deltaTone = delta?.tone || "neutral";
  const deltaCls = {
    neutral: "text-ink-muted bg-paper-dim/50",
    success: "text-forest bg-success-container/40",
    warning: "text-brass-dim bg-warning-container/60",
    error: "text-sangria bg-error-container/40",
  }[deltaTone];

  return (
    <div className="border border-rule bg-paper-bright p-5 lg:p-6 transition-all duration-300 hover:bg-paper-bright/70 hover:-translate-y-0.5">
      <div className="flex items-baseline justify-between mb-5">
        <span className="editorial-numeral text-base text-ink-subtle">
          {numeral ? `— ${numeral}` : "—"}
        </span>
        {delta && (
          <span className={clsx("text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded", deltaCls)}>
            {delta.text}
          </span>
        )}
      </div>
      <p className={clsx("font-display text-4xl lg:text-5xl font-light tabular-nums nums-lining", toneStyles)}>
        {value}
      </p>
      <p className="eyebrow mt-2">{label}</p>
    </div>
  );
}
