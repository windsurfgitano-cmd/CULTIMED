const LOGO_IMAGE =
  "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";
const HERO_IMAGE =
  "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/apothecary-hero.png";

export function firstName(fullName: string | null | undefined): string {
  const n = (fullName || "").trim();
  return n ? n.split(/\s+/)[0]! : "Hola";
}

function layout(opts: {
  preheader?: string;
  kicker: string;
  title: string;
  subtitle?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const { preheader, kicker, title, subtitle, bodyHtml, ctaLabel, ctaUrl } = opts;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0F1A22;font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;">
${preheader ? `<div style="display:none;visibility:hidden;mso-hide:all;font-size:1px;color:#0F1A22;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0F1A22;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#F7F1E5;border:1px solid #C9B891;">
      <tr><td align="center" style="padding:36px 48px 24px;"><img src="${LOGO_IMAGE}" alt="Cultimed" width="160" style="display:block;width:160px;max-width:60%;height:auto;border:0;margin:0 auto;" /></td></tr>
      <tr><td style="padding:0;line-height:0;"><img src="${HERO_IMAGE}" alt="Cultimed" width="600" style="display:block;width:100%;height:auto;border:0;" /></td></tr>
      <tr><td style="padding:36px 48px 24px;">
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#8b7d5c;">${kicker}</p>
        <h1 style="margin:0 0 6px;font-family:Georgia,serif;font-size:34px;font-weight:300;line-height:1.05;color:#1a1a1a;">${title}</h1>
        ${subtitle ? `<p style="margin:0;font-family:Georgia,serif;font-size:18px;font-style:italic;color:#5d544a;">${subtitle}</p>` : ""}
      </td></tr>
      <tr><td style="padding:0 48px 32px;font-family:Georgia,serif;font-size:16px;line-height:1.65;color:#3a3530;">
        <table role="presentation" width="100%" style="margin-bottom:28px;"><tr><td style="height:1px;background:#C9B891;"></td></tr></table>
        ${bodyHtml}
        ${ctaLabel && ctaUrl ? `<table role="presentation" style="margin:36px auto 16px;"><tr><td align="center" style="background:#0F1A22;"><a href="${ctaUrl}" style="display:inline-block;padding:18px 44px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#F7F1E5;text-decoration:none;">${ctaLabel}</a></td></tr></table>
        <p style="margin:8px 0 0;text-align:center;font-size:11px;color:#8b7d5c;">o copia: <span style="word-break:break-all;color:#5d544a;">${ctaUrl}</span></p>` : ""}
      </td></tr>
      <tr><td style="padding:24px 48px 36px;border-top:1px solid #C9B891;font-size:11px;color:#8b7d5c;">
        <p style="margin:0;">¿Dudas? contacto@dispensariocultimed.cl · WhatsApp +56 9 9317 7375</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;
}

const DOC_LABELS: Record<string, string> = {
  prescription_url: "Receta médica",
  id_front_url: "Carnet (frente)",
  id_back_url: "Carnet (reverso)",
  criminal_record_url: "Antecedentes penales",
  rights_assignment_url: "Comprobante de depósito",
};

export type OutreachTemplate =
  | "register_account"
  | "activation_reminder"
  | "upload_rx"
  | "resubmit_rx"
  | "upload_docs"
  | "complete_profile";

export function buildOutreachEmail(
  template: OutreachTemplate,
  opts: {
    fullName: string;
    ctaUrl: string;
    missingFields?: string[];
    missingDocs?: string[];
  }
): { subject: string; html: string; text: string } {
  const greet = firstName(opts.fullName);

  switch (template) {
    case "register_account":
      return {
        subject: "Activa tu cuenta en Cultimed (2 min)",
        html: layout({
          preheader: "Crea tu cuenta web para gestionar recetas y pedidos.",
          kicker: "Cultimed · Cuenta web",
          title: "Te falta tu <em style='font-style:italic;'>cuenta web</em>",
          subtitle: "Toma 2 minutos.",
          bodyHtml: `<p style="margin:0 0 16px;">${greet},</p><p style="margin:0;">Necesitas una cuenta en dispensariocultimed.cl para mantener tu ficha al día bajo normativa SANNA.</p>`,
          ctaLabel: "Crear mi cuenta",
          ctaUrl: opts.ctaUrl,
        }),
        text: `${greet}, crea tu cuenta: ${opts.ctaUrl}`,
      };
    case "activation_reminder":
      return {
        subject: "Recordatorio · Activa tu cuenta Cultimed",
        html: layout({
          kicker: "Cultimed · Recordatorio",
          title: "Tu cuenta te <em style='font-style:italic;'>espera</em>",
          bodyHtml: `<p style="margin:0 0 16px;">${greet},</p><p style="margin:0;">Define tu contraseña para acceder al catálogo. Link válido 14 días.</p>`,
          ctaLabel: "Definir contraseña",
          ctaUrl: opts.ctaUrl,
        }),
        text: `${greet}, activa: ${opts.ctaUrl}`,
      };
    case "resubmit_rx":
      return {
        subject: "Acción requerida: sube una nueva receta en Cultimed",
        html: layout({
          kicker: "Receta rechazada",
          title: "Sube una nueva <em style='font-style:italic;'>receta</em>",
          bodyHtml: `<p style="margin:0 0 16px;">${greet},</p><p style="margin:0;">Tu última receta no cumplió los criterios. Puedes resubirla sin límite.</p>`,
          ctaLabel: "Subir receta",
          ctaUrl: opts.ctaUrl,
        }),
        text: `${greet}, sube receta: ${opts.ctaUrl}`,
      };
    case "upload_rx":
      return {
        subject: "Acción requerida: receta médica vigente en Cultimed",
        html: layout({
          kicker: "Receta pendiente",
          title: "Necesitamos tu <em style='font-style:italic;'>receta vigente</em>",
          bodyHtml: `<p style="margin:0 0 16px;">${greet},</p><p style="margin:0;">No tenemos receta vigente en tu ficha. Sube una actualizada (PDF/JPG/PNG).</p>`,
          ctaLabel: "Subir receta",
          ctaUrl: opts.ctaUrl,
        }),
        text: `${greet}, sube receta: ${opts.ctaUrl}`,
      };
    case "upload_docs": {
      const docList = (opts.missingDocs || []).map((d) => DOC_LABELS[d] || d).join(", ");
      return {
        subject: "Acción requerida: sube tus documentos en Cultimed",
        html: layout({
          kicker: "Cultimed · Documentos",
          title: "Completa tus <em style='font-style:italic;'>documentos</em>",
          bodyHtml: `<p style="margin:0 0 16px;">${greet},</p><p style="margin:0;">Faltan: <strong>${docList}</strong>.</p>`,
          ctaLabel: "Subir documentos",
          ctaUrl: opts.ctaUrl,
        }),
        text: `${greet}, faltan ${docList}: ${opts.ctaUrl}`,
      };
    }
    case "complete_profile": {
      const fields = (opts.missingFields || []).join(", ");
      return {
        subject: "Acción requerida: completa tu ficha en Cultimed (2 min)",
        html: layout({
          kicker: "Cultimed · Ficha clínica",
          title: "Completa tu <em style='font-style:italic;'>ficha</em>",
          bodyHtml: `<p style="margin:0 0 16px;">${greet},</p><p style="margin:0;">Faltan en tu registro: <strong>${fields}</strong>.</p>`,
          ctaLabel: "Completar ficha",
          ctaUrl: opts.ctaUrl,
        }),
        text: `${greet}, completa ficha (${fields}): ${opts.ctaUrl}`,
      };
    }
  }
}