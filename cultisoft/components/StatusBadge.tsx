import clsx from "clsx";

const MAP: Record<string, { label: string; cls: string }> = {
  // patients
  active:        { label: "Activo",        cls: "pill-success" },
  pending:       { label: "Pendiente",     cls: "pill-warning" },
  suspended:     { label: "Suspendido",    cls: "pill-error" },

  // batches
  available:     { label: "Disponible",    cls: "pill-success" },
  depleted:      { label: "Agotado",       cls: "pill-neutral" },
  recalled:      { label: "Retirado",      cls: "pill-error" },
  expired:       { label: "Vencido",       cls: "pill-error" },

  // prescriptions
  fulfilled:     { label: "Completada",    cls: "pill-tertiary" },
  rejected:      { label: "Rechazada",     cls: "pill-error" },

  // dispensations
  completed:     { label: "Completada",    cls: "pill-success" },
  cancelled:     { label: "Cancelada",     cls: "pill-error" },
  returned:      { label: "Devuelta",      cls: "pill-warning" },

  // payments
  paid:          { label: "Pagado",        cls: "pill-success" },
  failed:        { label: "Fallido",       cls: "pill-error" },
  refunded:      { label: "Reembolsado",   cls: "pill-warning" },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = MAP[status] || { label: status, cls: "pill-neutral" };
  return <span className={clsx("pill", cfg.cls)}>{cfg.label}</span>;
}
