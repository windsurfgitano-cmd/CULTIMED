import type { ReactNode } from "react";

export default function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  /** legacy prop, ignored */
  icon?: string;
}) {
  return (
    <div className="border border-rule bg-paper-bright p-12 lg:p-16 flex flex-col items-center text-center">
      <p className="font-display text-3xl italic text-ink-muted mb-3 text-balance">{title}</p>
      {message && (
        <p className="text-sm text-ink-muted max-w-md leading-relaxed">{message}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
