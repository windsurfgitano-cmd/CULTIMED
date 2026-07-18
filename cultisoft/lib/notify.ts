// Mismo código en cultisoft y cultimed-store — sincronizar ambas copias a mano.
// Envío multicanal de notificaciones con deduplicación por DB.
// Canales: email (Resend, activo) · sms (TextBee, dormido hasta setear env) ·
// whatsapp (stub fase 2). El routing por tipo vive en CHANNELS_BY_TYPE.
// Regla de oro: sendNotification NUNCA lanza — registra el error en el log.
import { run } from "./db";
import { renderEmail, renderSms, type NotificationType } from "./notify-templates";
import { normalizePhoneCL } from "./notify-utils";

export type { NotificationType };
export type NotificationChannel = "email" | "whatsapp" | "sms";

// v1: todo por email. Para activar otro canal en un tipo, agregarlo aquí —
// p.ej. pedido_despachado: ["email", "sms"] cuando el relay TextBee esté arriba.
const CHANNELS_BY_TYPE: Record<NotificationType, NotificationChannel[]> = {
  receta_aprobada: ["email"],
  receta_rechazada: ["email"],
  pedido_pago_confirmado: ["email"],
  pedido_despachado: ["email"],
  recompra: ["email"],
  pedido_abandonado: ["email"],
  reserva_confirmada: ["email"],
};

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Cultimed <no-reply@dispensariocultimed.cl>";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "contacto@dispensariocultimed.cl";
const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY;
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID;
const TEXTBEE_BASE_URL = process.env.TEXTBEE_BASE_URL || "https://api.textbee.dev/api/v1";

export interface SendNotificationInput {
  type: NotificationType;
  customerAccountId: number;
  recipientEmail: string;
  recipientPhone?: string | null;
  /** Identidad de la instancia del evento — ver spec. Orden: String(orderId); receta: `${accountId}:${uploadedAt}`; reserva: `${productId}:${customerAccountId}` (un doble click no manda dos correos). */
  dedupeKey: string;
  relatedId: number;
  data: Record<string, unknown>;
}

export async function sendNotification(input: SendNotificationInput): Promise<void> {
  for (const channel of CHANNELS_BY_TYPE[input.type]) {
    try {
      await sendOnChannel(channel, input);
    } catch (e) {
      // Nunca propagar: una notificación caída no puede romper la acción del admin.
      console.error(`notify ${input.type}/${channel} failed:`, e);
    }
  }
}

async function sendOnChannel(channel: NotificationChannel, input: SendNotificationInput): Promise<void> {
  const recipient =
    channel === "email" ? input.recipientEmail : normalizePhoneCL(input.recipientPhone) || "";

  // Reclamar la fila ANTES de enviar: si el INSERT no devuelve id, ya existe
  // (enviada o en curso por otra request) — no enviar de nuevo.
  // OJO (semántica at-most-once): si el destinatario es inválido en este momento
  // (p. ej. teléfono no normalizable), la fila igual queda reclamada y esta
  // instancia del evento NO se reintenta aunque corrijan el dato después.
  const ins = await run(
    `INSERT INTO notification_log (customer_account_id, type, channel, recipient, dedupe_key, related_id, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT (type, channel, dedupe_key) DO NOTHING`,
    input.customerAccountId, input.type, channel, recipient || "(sin destinatario)",
    input.dedupeKey, input.relatedId
  );
  const logId = Number(ins.lastInsertRowid);
  if (!logId) return; // dedupe: ya existe registro para esta instancia

  const finish = (status: string, error: string | null = null) =>
    run(`UPDATE notification_log SET status = ?, error = ? WHERE id = ?`, status, error, logId);

  if (channel === "whatsapp") {
    await finish("skipped_not_configured", "WhatsApp Business API pendiente (fase 2)");
    return;
  }

  if (channel === "sms") {
    if (!TEXTBEE_API_KEY || !TEXTBEE_DEVICE_ID) {
      await finish("skipped_not_configured", "TEXTBEE_API_KEY / TEXTBEE_DEVICE_ID sin setear");
      return;
    }
    if (!recipient) {
      await finish("failed", `teléfono no normalizable: ${JSON.stringify(input.recipientPhone)}`);
      return;
    }
    try {
      const res = await fetch(`${TEXTBEE_BASE_URL}/gateway/devices/${TEXTBEE_DEVICE_ID}/send-sms`, {
        method: "POST",
        headers: { "x-api-key": TEXTBEE_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: [recipient], message: renderSms(input.type, input.data) }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        await finish("failed", `TextBee HTTP ${res.status}: ${body.slice(0, 300)}`);
        return;
      }
      await finish("sent");
    } catch (e: any) {
      await finish("failed", `TextBee: ${e?.message || String(e)}`);
    }
    return;
  }

  // email
  if (!RESEND_API_KEY) {
    await finish("skipped_not_configured", "RESEND_API_KEY sin setear");
    return;
  }
  if (!recipient) {
    await finish("failed", "sin email de destinatario");
    return;
  }
  try {
    const { subject, html, text } = renderEmail(input.type, input.data);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [recipient], reply_to: EMAIL_REPLY_TO, subject, html, text }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      await finish("failed", `Resend: ${body?.message || `HTTP ${res.status}`}`);
      return;
    }
    await finish("sent");
  } catch (e: any) {
    await finish("failed", `Resend: ${e?.message || String(e)}`);
  }
}
