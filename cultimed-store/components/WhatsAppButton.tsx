"use client";

import { formatCLP } from "@/lib/format";

export default function WhatsAppButton({
  order,
}: {
  order: { id: number; folio: string; total: number };
}) {
  const number = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "56993177375";
  const message = encodeURIComponent(
    `Hola Cultimed, soy paciente y necesito ayuda con mi orden ${order.folio} (${formatCLP(order.total)}).`
  );
  const href = `https://wa.me/${number}?text=${message}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-forest text-paper p-5 hover:bg-forest-deep transition-colors"
    >
      <div className="flex items-center gap-3 mb-2">
        <WAIcon />
        <span className="eyebrow text-paper/70">— ¿Necesitas ayuda?</span>
      </div>
      <p className="font-display text-xl leading-tight">
        Escríbenos por <span className="italic">WhatsApp</span>
      </p>
      <p className="text-xs text-paper/70 mt-1">Respondemos lun–sáb 10:00–19:00</p>
    </a>
  );
}

function WAIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="text-paper/80">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12.06 21.4c-1.81 0-3.585-.486-5.124-1.402l-.367-.218-3.815 1 1.02-3.722-.24-.382c-1.005-1.598-1.535-3.444-1.535-5.34 0-5.535 4.504-10.039 10.04-10.039 2.683 0 5.205 1.045 7.103 2.943 1.897 1.898 2.943 4.42 2.942 7.103-.002 5.535-4.506 10.041-10.025 10.057zM20.52 3.449C18.245 1.17 15.21-.025 12.045-.025c-6.554 0-11.89 5.336-11.893 11.892 0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654c1.737.948 3.693 1.448 5.683 1.449h.005c6.554 0 11.89-5.337 11.892-11.893.001-3.165-1.231-6.139-3.422-8.453z"/>
    </svg>
  );
}
