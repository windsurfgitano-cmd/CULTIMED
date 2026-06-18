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

  // customer web accounts
  none:          { label: "Sin receta",    cls: "pill-neutral" },
  aprobada:      { label: "Aprobada",      cls: "pill-success" },
  rechazada:     { label: "Rechazada",     cls: "pill-error" },

  // dispensations
  completed:     { label: "Completada",    cls: "pill-success" },
  cancelled:     { label: "Cancelada",     cls: "pill-error" },
  returned:      { label: "Devuelta",      cls: "pill-warning" },

  // payments
  paid:          { label: "Pagado",        cls: "pill-success" },
  failed:        { label: "Fallido",       cls: "pill-error" },
  refunded:      { label: "Reembolsado",   cls: "pill-warning" },

  // web orders
  pending_payment:  { label: "Pago pendiente",    cls: "pill-neutral" },
  proof_uploaded:   { label: "Comprobante recibido", cls: "pill-warning" },
  preparing:        { label: "En preparación",    cls: "pill-tertiary" },
  ready_for_pickup: { label: "Lista retiro",      cls: "pill-success" },
  shipped:          { label: "Despachada",        cls: "pill-success" },
  delivered:        { label: "Entregada",         cls: "pill-success" },
};

export default function StatusBadge({ status }: { status: string }) {
  const cfg = MAP[status] || { label: status, cls: "pill-neutral" };
  return <span className={clsx("pill", cfg.cls)}>{cfg.label}</span>;
}
