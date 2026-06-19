const LOGO_IMAGE =
  "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";
const HERO_IMAGE =
  "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/apothecary-hero.png";

export function firstName(fullName) {
  const n = (fullName || "").trim();
  return n ? n.split(/\s+/)[0] : "Hola";
}

function layout({ preheader, kicker, title, subtitle, bodyHtml, ctaLabel, ctaUrl, footerExtra }) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0F1A22;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
${preheader ? `<div style="display:none;visibility:hidden;mso-hide:all;font-size:1px;color:#0F1A22;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0F1A22;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#F7F1E5;border:1px solid #C9B891;">
      <tr><td align="center" style="padding:36px 48px 24px;background:#F7F1E5;">
        <img src="${LOGO_IMAGE}" alt="Cultimed" width="160" style="display:block;width:160px;max-width:60%;height:auto;border:0;margin:0 auto;" />
      </td></tr>
      <tr><td style="padding:0;line-height:0;">
        <img src="${HERO_IMAGE}" alt="Cultimed" width="600" style="display:block;width:100%;height:auto;border:0;" />
      </td></tr>
      <tr><td style="padding:36px 48px 24px;background:#F7F1E5;">
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#8b7d5c;">${kicker}</p>
        <h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:34px;font-weight:300;line-height:1.05;color:#1a1a1a;">${title}</h1>
        ${subtitle ? `<p style="margin:0;font-family:Georgia,serif;font-size:18px;font-style:italic;color:#5d544a;line-height:1.4;">${subtitle}</p>` : ""}
      </td></tr>
      <tr><td style="padding:0 48px 32px;background:#F7F1E5;font-family:Georgia,serif;font-size:16px;line-height:1.65;color:#3a3530;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:28px;"><tr><td style="height:1px;background:#C9B891;"></td></tr></table>
        ${bodyHtml}
        ${
          ctaLabel && ctaUrl
            ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:36px auto 16px;">
          <tr><td align="center" style="background:#0F1A22;">
            <a href="${ctaUrl}" style="display:inline-block;padding:18px 44px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#F7F1E5;text-decoration:none;">${ctaLabel}</a>
          </td></tr>
        </table>
        <p style="margin:8px 0 0;text-align:center;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#8b7d5c;">
          o copia este enlace<br><span style="word-break:break-all;color:#5d544a;">${ctaUrl}</span>
        </p>`
            : ""
        }
      </td></tr>
      <tr><td style="padding:24px 48px 36px;background:#F7F1E5;border-top:1px solid #C9B891;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.7;color:#8b7d5c;">
        ${footerExtra || ""}
        <p style="margin:12px 0 0;">¿Dudas? <a href="mailto:contacto@dispensariocultimed.cl" style="color:#5d544a;text-decoration:underline;">contacto@dispensariocultimed.cl</a> · WhatsApp +56 9 9317 7375</p>
        <p style="margin:12px 0 0;font-size:10px;color:#9c8e6e;">Cultimed · Operamos bajo Ley 20.850 y normativa SANNA · Datos clínicos protegidos bajo Ley 19.628</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

const DOC_LABELS = {
  prescription_url: "Receta médica",
  id_front_url: "Carnet (frente)",
  id_back_url: "Carnet (reverso)",
  criminal_record_url: "Antecedentes penales",
  rights_assignment_url: "Comprobante de depósito",
};

export function buildOutreachEmail(template, opts) {
  const { fullName, storeBase, ctaUrl, missingFields = [], missingDocs = [] } = opts;
  const greet = firstName(fullName);

  switch (template) {
    case "register_account": {
      const subject = "Activa tu cuenta en Cultimed (2 min)";
      const html = layout({
        preheader: "Crea tu cuenta web para gestionar recetas y pedidos.",
        kicker: "Cultimed · Cuenta web",
        title: "Te falta tu <em style='font-style:italic;font-weight:400;'>cuenta web</em>",
        subtitle: "Toma 2 minutos y cumples con la normativa SANNA.",
        bodyHtml: `<p style="margin:0 0 16px;">${greet},</p>
          <p style="margin:0 0 16px;">Estamos actualizando la ficha clínica de todos nuestros pacientes. Para seguir comprando en el dispensario y mantener tu receta al día, necesitas una <strong>cuenta en dispensariocultimed.cl</strong>.</p>
          <p style="margin:0 0 16px;">El registro incluye subir tus documentos (carnet, receta vigente, etc.). Nuestro químico farmacéutico los valida en menos de 24 h hábiles.</p>`,
        ctaLabel: "Crear mi cuenta",
        ctaUrl,
      });
      const text = `${greet},\n\nCrea tu cuenta en Cultimed:\n${ctaUrl}\n\n¿Dudas? contacto@dispensariocultimed.cl`;
      return { subject, html, text };
    }

    case "activation_reminder": {
      const subject = "Recordatorio · Activa tu cuenta Cultimed";
      const html = layout({
        preheader: "Define tu contraseña para acceder al catálogo.",
        kicker: "Cultimed · Recordatorio",
        title: "Tu cuenta te <em style='font-style:italic;font-weight:400;'>espera</em>",
        subtitle: "Solo falta definir tu contraseña.",
        bodyHtml: `<p style="margin:0 0 16px;">${greet},</p>
          <p style="margin:0 0 16px;">Tienes una cuenta creada en Cultimed pero aún no la has activado. Con un click defines tu contraseña y accedes a tu historial de pedidos y recetas.</p>
          <p style="margin:0;font-size:14px;font-style:italic;color:#7a7066;">Este link es válido por 14 días.</p>`,
        ctaLabel: "Definir mi contraseña",
        ctaUrl,
      });
      const text = `${greet},\n\nActiva tu cuenta:\n${ctaUrl}\n\nVálido 14 días.`;
      return { subject, html, text };
    }

    case "upload_rx":
    case "resubmit_rx": {
      const rejected = template === "resubmit_rx";
      const subject = rejected
        ? "Acción requerida: sube una nueva receta en Cultimed"
        : "Acción requerida: receta médica vigente en Cultimed";
      const html = layout({
        preheader: rejected ? "Tu receta fue rechazada — puedes resubirla." : "Necesitamos una receta vigente para continuar.",
        kicker: rejected ? "Receta rechazada" : "Receta pendiente",
        title: rejected
          ? "Sube una nueva <em style='font-style:italic;font-weight:400;'>receta</em>"
          : "Necesitamos tu <em style='font-style:italic;font-weight:400;'>receta vigente</em>",
        subtitle: "Ley 20.850 · vigencia 6 meses",
        bodyHtml: `<p style="margin:0 0 16px;">${greet},</p>
          <p style="margin:0 0 16px;">${
            rejected
              ? "Tu última receta no cumplió los criterios de validación (legible, con firma/timbre médico, RUT y fecha). Puedes subir una nueva sin límite de intentos."
              : "No tenemos una receta médica vigente asociada a tu ficha. Para comprar productos cannábicos medicinales necesitas una receta actualizada."
          }</p>
          <p style="margin:0;">Formatos: PDF, JPG o PNG. Máximo 10 MB.</p>`,
        ctaLabel: "Subir receta",
        ctaUrl,
      });
      const text = `${greet},\n\nSube tu receta:\n${ctaUrl}`;
      return { subject, html, text };
    }

    case "upload_docs": {
      const docList = missingDocs.map((d) => DOC_LABELS[d] || d).join(", ");
      const subject = "Acción requerida: sube tus documentos en Cultimed";
      const html = layout({
        preheader: "Faltan documentos en tu ficha clínica.",
        kicker: "Cultimed · Documentos",
        title: "Completa tus <em style='font-style:italic;font-weight:400;'>documentos</em>",
        subtitle: "Cumplimiento normativa SANNA",
        bodyHtml: `<p style="margin:0 0 16px;">${greet},</p>
          <p style="margin:0 0 16px;">En tu ficha clínica faltan los siguientes documentos: <strong>${docList}</strong>.</p>
          <p style="margin:0;">Puedes subirlos desde tu cuenta en menos de 2 minutos. Si ya los enviaste por otro canal, ignora este mensaje.</p>`,
        ctaLabel: "Subir documentos",
        ctaUrl,
      });
      const text = `${greet},\n\nFaltan: ${docList}\n\nSube aquí: ${ctaUrl}`;
      return { subject, html, text };
    }

    case "complete_profile": {
      const fieldList = missingFields.join(", ");
      const subject = "Acción requerida: completa tu ficha en Cultimed (2 min)";
      const html = layout({
        preheader: "Actualiza RUT, teléfono, comuna u otros datos de tu ficha.",
        kicker: "Cultimed · Ficha clínica",
        title: "Completa tu <em style='font-style:italic;font-weight:400;'>ficha</em>",
        subtitle: "Te tomará 2 minutos",
        bodyHtml: `<p style="margin:0 0 16px;">${greet},</p>
          <p style="margin:0 0 16px;">Estamos actualizando la ficha clínica de todos nuestros pacientes para cumplir con la normativa SANNA. En tu registro faltan: <strong>${fieldList}</strong>.</p>
          <p style="margin:0;">Por favor actualiza tus datos lo antes posible.</p>`,
        ctaLabel: "Completar mi ficha",
        ctaUrl,
      });
      const text = `${greet},\n\nCompleta tu ficha (faltan: ${fieldList}):\n${ctaUrl}`;
      return { subject, html, text };
    }

    default:
      throw new Error(`Unknown template: ${template}`);
  }
}