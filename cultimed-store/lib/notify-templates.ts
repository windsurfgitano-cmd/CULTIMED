// Plantillas de email y SMS por tipo de notificación. Layout editorial oscuro
// (mismo look del cron receta-expiry, que es la plantilla oficial de Cultimed).
export type NotificationType =
  | "receta_aprobada"
  | "receta_rechazada"
  | "pedido_pago_confirmado"
  | "pedido_despachado"
  | "recompra"
  | "pedido_abandonado";

// STORE_PUBLIC_BASE primero: en cultisoft es LA variable que apunta a la tienda;
// si ese proyecto definiera NEXT_PUBLIC_BASE_URL (dominio del panel), no debe ganar.
const STORE_BASE =
  process.env.STORE_PUBLIC_BASE || process.env.NEXT_PUBLIC_BASE_URL || "https://dispensariocultimed.cl";
const LOGO =
  "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";
const BANK = {
  name: process.env.NEXT_PUBLIC_BANK_NAME || "",
  accountType: process.env.NEXT_PUBLIC_BANK_ACCOUNT_TYPE || "",
  accountNumber: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || "",
  rut: process.env.NEXT_PUBLIC_BANK_RUT || "",
  holder: process.env.NEXT_PUBLIC_BANK_HOLDER || "",
  email: process.env.NEXT_PUBLIC_BANK_EMAIL || "",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function firstName(data: Record<string, unknown>): string {
  const full = String(data.firstName || "").trim();
  return full ? full.split(" ")[0] : "Hola";
}

function layout(opts: {
  eyebrow: string;
  eyebrowColor?: string;
  titleHtml: string;
  greeting: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footerExtraHtml?: string;
}): string {
  const { eyebrow, eyebrowColor = "#8b7d5c", titleHtml, greeting, bodyHtml, ctaLabel, ctaUrl, footerExtraHtml = "" } = opts;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0F1A22;font-family:Georgia,serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0F1A22;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#F7F1E5;border:1px solid #C9B891;">
      <tr><td align="center" style="padding:36px 48px 24px;">
        <img src="${LOGO}" alt="Cultimed" width="160" style="display:block;width:160px;max-width:60%;height:auto;border:0;" />
      </td></tr>
      <tr><td style="padding:24px 48px 16px;">
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${eyebrowColor};">${eyebrow}</p>
        <h1 style="margin:0;font-family:Georgia,serif;font-size:32px;font-weight:300;line-height:1.1;color:#1a1a1a;">${titleHtml}</h1>
      </td></tr>
      <tr><td style="padding:0 48px 32px;font-family:Georgia,serif;font-size:16px;line-height:1.65;color:#3a3530;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;"><tr><td style="height:1px;background:#C9B891;"></td></tr></table>
        <p style="margin:0 0 16px;">${greeting},</p>
        ${bodyHtml}
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px auto 8px;">
          <tr><td align="center" style="background:#0F1A22;border:1px solid #0F1A22;">
            <a href="${ctaUrl}" style="display:inline-block;padding:16px 40px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#F7F1E5;text-decoration:none;">${ctaLabel}</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 48px 32px;border-top:1px solid #C9B891;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.7;color:#8b7d5c;">
        <p style="margin:0;font-size:10px;"><strong style="color:#5d544a;">Cultimed</strong> · Operamos bajo Ley 20.850 y normativa SANNA. ¿Dudas? <a href="mailto:contacto@dispensariocultimed.cl" style="color:#5d544a;text-decoration:underline;">contacto@dispensariocultimed.cl</a></p>
        ${footerExtraHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function renderEmail(
  type: NotificationType,
  data: Record<string, unknown>
): { subject: string; html: string; text: string } {
  const name = firstName(data);
  const greeting = name === "Hola" ? "Hola" : `Hola ${esc(name)}`;
  const notes = data.notes ? String(data.notes) : "";
  const folio = esc(data.folio);
  const totalCLP = esc(data.totalCLP);
  const tracking = data.tracking ? String(data.tracking) : "";

  switch (type) {
    case "receta_aprobada":
      return {
        subject: "Tu receta fue aprobada · Cultimed",
        html: layout({
          eyebrow: "Receta aprobada",
          eyebrowColor: "#3d5c3a",
          titleHtml: `Tu receta fue <em style="font-style:italic;font-weight:400;">aprobada</em>.`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Nuestro químico farmacéutico validó tu documentación. El catálogo completo ya está habilitado para ti — precios, disponibilidad por lote y compra.</p>${notes ? `<p style="margin:0 0 16px;">Nota del revisor: <em>${esc(notes)}</em></p>` : ""}`,
          ctaLabel: "Ver catálogo",
          ctaUrl: `${STORE_BASE}/productos`,
        }),
        text: `${greeting},\n\nTu receta fue aprobada por nuestro químico farmacéutico. Ya puedes comprar en el catálogo completo:\n${STORE_BASE}/productos${notes ? `\n\nNota del revisor: ${notes}` : ""}\n\nCultimed · dispensariocultimed.cl`,
      };
    case "receta_rechazada":
      return {
        subject: "Tu receta requiere corrección · Cultimed",
        html: layout({
          eyebrow: "Receta rechazada",
          eyebrowColor: "#9b3a3a",
          titleHtml: `Tu receta <em style="font-style:italic;font-weight:400;">requiere corrección</em>.`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Revisamos tu documentación y no pudo ser aprobada.</p>${notes ? `<p style="margin:0 0 16px;">Motivo indicado por el revisor: <em>${esc(notes)}</em></p>` : `<p style="margin:0 0 16px;">Tu documentación no cumple los requisitos. Sube nuevos documentos para revisarlos de nuevo.</p>`}`,
          ctaLabel: "Subir nueva receta",
          ctaUrl: `${STORE_BASE}/mi-cuenta/recetas`,
        }),
        text: `${greeting},\n\nTu receta no pudo ser aprobada.${notes ? ` Motivo: ${notes}` : ""}\nSube una nueva en:\n${STORE_BASE}/mi-cuenta/recetas\n\nCultimed · dispensariocultimed.cl`,
      };
    case "pedido_pago_confirmado":
      return {
        subject: `Pago confirmado · Pedido ${folio} · Cultimed`,
        html: layout({
          eyebrow: "Pago confirmado",
          eyebrowColor: "#3d5c3a",
          titleHtml: `Estamos <em style="font-style:italic;font-weight:400;">preparando</em> tu pedido.`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Confirmamos tu transferencia por <strong>${totalCLP}</strong>. Tu pedido <strong>${folio}</strong> pasó a preparación en farmacia y te avisaremos cuando salga a despacho.</p>`,
          ctaLabel: "Seguir mi pedido",
          ctaUrl: `${STORE_BASE}/mi-cuenta/pedidos`,
        }),
        text: `${greeting},\n\nConfirmamos tu pago de ${String(data.totalCLP)}. Tu pedido ${String(data.folio)} está en preparación; te avisamos cuando salga a despacho.\n\nSeguimiento: ${STORE_BASE}/mi-cuenta/pedidos\n\nCultimed · dispensariocultimed.cl`,
      };
    case "pedido_despachado":
      return {
        subject: `Tu pedido ${folio} va en camino · Cultimed`,
        html: layout({
          eyebrow: "Pedido despachado",
          titleHtml: `Tu pedido va <em style="font-style:italic;font-weight:400;">en camino</em>.`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Tu pedido <strong>${folio}</strong> salió a despacho.</p>${tracking ? `<p style="margin:0 0 16px;">Número de seguimiento: <strong style="font-family:monospace;">${esc(tracking)}</strong></p>` : ""}`,
          ctaLabel: "Ver mi pedido",
          ctaUrl: `${STORE_BASE}/mi-cuenta/pedidos`,
        }),
        text: `${greeting},\n\nTu pedido ${String(data.folio)} va en camino.${tracking ? ` Seguimiento: ${tracking}` : ""}\n\n${STORE_BASE}/mi-cuenta/pedidos\n\nCultimed · dispensariocultimed.cl`,
      };
    case "recompra": {
      const unsubscribeUrl = String(data.unsubscribeUrl || "");
      return {
        subject: "¿Se te está acabando? · Cultimed",
        html: layout({
          eyebrow: "Tu tratamiento",
          titleHtml: `¿Se te está <em style="font-style:italic;font-weight:400;">acabando</em>?`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Han pasado unos días desde tu último pedido. Para que no interrumpas tu tratamiento, el catálogo está disponible con tu receta vigente — despacho en 24–72h hábiles.</p>`,
          ctaLabel: "Renovar mi pedido",
          ctaUrl: `${STORE_BASE}/productos`,
          footerExtraHtml: `<p style="margin:8px 0 0;font-size:10px;"><a href="${unsubscribeUrl}" style="color:#8b7d5c;text-decoration:underline;">No quiero recordatorios de recompra</a></p>`,
        }),
        text: `${greeting},\n\nHan pasado unos días desde tu último pedido en Cultimed. Renueva en:\n${STORE_BASE}/productos\n\nPara no recibir recordatorios: ${unsubscribeUrl}\n\nCultimed · dispensariocultimed.cl`,
      };
    }
    case "pedido_abandonado": {
      const orderId = Number(data.orderId);
      const bankHtml = BANK.accountNumber
        ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;background:#EFE7D6;border:1px solid #C9B891;"><tr><td style="padding:16px 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.8;color:#3a3530;">
${esc(BANK.holder)} · RUT ${esc(BANK.rut)}<br>${esc(BANK.name)} · ${esc(BANK.accountType)} <strong style="font-family:monospace;">${esc(BANK.accountNumber)}</strong><br>Comprobante a: ${esc(BANK.email)}</td></tr></table>`
        : "";
      return {
        subject: `Tu pedido ${folio} sigue reservado · Cultimed`,
        html: layout({
          eyebrow: "Pedido pendiente de pago",
          eyebrowColor: "#9b3a3a",
          titleHtml: `Tu pedido sigue <em style="font-style:italic;font-weight:400;">reservado</em>.`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Generaste el pedido <strong>${folio}</strong> por <strong>${totalCLP}</strong> pero no hemos recibido tu transferencia. Sigue reservado — completa el pago y súbenos el comprobante para prepararlo.</p>${bankHtml}`,
          ctaLabel: "Retomar mi pedido",
          ctaUrl: `${STORE_BASE}/checkout/${orderId}`,
        }),
        text: `${greeting},\n\nTu pedido ${String(data.folio)} por ${String(data.totalCLP)} sigue reservado, pendiente de transferencia. Retómalo en:\n${STORE_BASE}/checkout/${orderId}\n\nCultimed · dispensariocultimed.cl`,
      };
    }
  }
}

export function renderSms(type: NotificationType, data: Record<string, unknown>): string {
  const folio = String(data.folio || "");
  switch (type) {
    case "receta_aprobada":
      return `Cultimed: tu receta fue aprobada. Ya puedes comprar en dispensariocultimed.cl/productos`;
    case "receta_rechazada":
      return `Cultimed: tu receta requiere correccion. Sube una nueva en dispensariocultimed.cl/mi-cuenta/recetas`;
    case "pedido_pago_confirmado":
      return `Cultimed: recibimos tu pago del pedido ${folio}. Ya lo estamos preparando.`;
    case "pedido_despachado":
      return `Cultimed: tu pedido ${folio} va en camino.${data.tracking ? ` Seguimiento: ${String(data.tracking)}` : ""}`;
    case "recompra":
      return `Cultimed: han pasado unos dias desde tu ultimo pedido. Renueva en dispensariocultimed.cl/productos`;
    case "pedido_abandonado":
      return `Cultimed: tu pedido ${folio} sigue reservado. Completa la transferencia en dispensariocultimed.cl/checkout/${Number(data.orderId)}`;
  }
}
