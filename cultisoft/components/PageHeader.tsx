import type { ReactNode } from "react";

export default function PageHeader({
  title,
  subtitle,
  badge,
  actions,
  numeral,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  actions?: ReactNode;
  numeral?: string;
  eyebrow?: string;
}) {
  // Try to find a natural italic split for the title
  const words = title.split(" ");
  const renderTitle = () => {
    if (words.length === 1) return title;
    // Italicize the second word for editorial rhythm
    return (
      <>
        <span className="font-light">{words[0]}</span>{" "}
        <span className="italic font-normal">{words[1]}</span>
        {words.length > 2 && <span className="font-light"> {words.slice(2).join(" ")}</span>}
      </>
    );
  };

  return (
    <header className="mb-8 lg:mb-10">
      {(numeral || eyebrow) && (
        <div className="flex items-baseline gap-4 mb-4">
          {numeral && <span className="editorial-numeral text-base text-ink-subtle">— {numeral}</span>}
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 sm:gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-display-2 leading-[1.0] text-balance flex flex-wrap items-baseline gap-3">
            {renderTitle()}
            {badge && (
              <span className="text-xs font-mono uppercase tracking-widest text-ink-muted bg-paper-dim px-3 py-1">
                {badge}
              </span>
            )}
          </h1>
          {subtitle && (
            <p className="mt-3 text-sm text-ink-muted max-w-2xl leading-relaxed">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex gap-2 flex-wrap shrink-0">{actions}</div>}
      </div>
      <div className="hairline-thick mt-6 lg:mt-8" />
    </header>
  );
}
