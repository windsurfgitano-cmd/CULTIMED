import { formatDateTime } from "@/lib/format";

interface Event { event_type: string; message: string | null; created_at: string; }

const EVENT_LABEL: Record<string, string> = {
  created: "Orden creada",
  proof_uploaded: "Comprobante recibido",
  payment_confirmed: "Pago confirmado",
  payment_rejected: "Comprobante rechazado",
  preparing: "En preparación",
  shipped: "Despachado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  whatsapp_sent: "WhatsApp enviado",
};

export default function OrderTimeline({ events, status }: { events: Event[]; status: string }) {
  // Possible future steps to show as "next"
  const knownSteps = ["created", "proof_uploaded", "payment_confirmed", "preparing", "shipped", "delivered"];
  const completedTypes = new Set(events.map((e) => e.event_type));
  const ghostSteps = knownSteps.filter((s) => !completedTypes.has(s) && !["delivered", "cancelled"].includes(status));

  return (
    <div className="border border-rule bg-paper-bright p-6 lg:p-7">
      <p className="eyebrow mb-5">— Trazabilidad</p>
      <ol className="space-y-5">
        {events.map((e, i) => (
          <li key={i} className="grid grid-cols-[18px_1fr] gap-3 items-start">
            <span className="mt-1.5 w-2 h-2 rounded-full bg-forest" aria-hidden />
            <div className="pb-4 border-b border-rule-soft last:border-b-0">
              <p className="font-display text-base">
                {EVENT_LABEL[e.event_type] || e.event_type}
              </p>
              {e.message && (
                <p className="text-xs text-ink-muted mt-0.5">{e.message}</p>
              )}
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink-subtle mt-1 nums-lining">
                {formatDateTime(e.created_at)}
              </p>
            </div>
          </li>
        ))}
        {ghostSteps.map((s, i) => (
          <li key={`ghost-${i}`} className="grid grid-cols-[18px_1fr] gap-3 items-start opacity-40">
            <span className="mt-1.5 w-2 h-2 rounded-full border border-ink-subtle" aria-hidden />
            <div className="pb-4 border-b border-rule-soft last:border-b-0">
              <p className="font-display text-base italic text-ink-muted">
                {EVENT_LABEL[s] || s}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
