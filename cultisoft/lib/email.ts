// Email sender — Resend con fallback a consola si no hay API key.
// Sign up gratis en https://resend.com (3000 emails/mes).
// Set RESEND_API_KEY y EMAIL_FROM en variables de entorno.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Cultimed <onboarding@resend.dev>";
// Reply-To: respuestas humanas van al inbox real, no al alias técnico de envío.
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "contacto@dispensariocultimed.cl";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    // Fallback dev/sin API key: log a consola del server
    console.log("\n=== EMAIL (RESEND_API_KEY no configurada, log only) ===");
    console.log("To:", input.to);
    console.log("Subject:", input.subject);
    console.log("Text:", input.text || input.html.replace(/<[^>]*>/g, ""));
    console.log("=== /EMAIL ===\n");
    return { ok: true, id: "console-log-fallback" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [input.to],
        reply_to: input.replyTo || EMAIL_REPLY_TO,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    const json: any = await res.json();
    if (!res.ok) {
      console.error("Resend error:", json);
      return { ok: false, error: json?.message || "send failed" };
    }
    return { ok: true, id: json.id };
  } catch (e: any) {
    console.error("Email send exception:", e);
    return { ok: false, error: e?.message };
  }
}

/** Plantilla editorial de email Cultimed. */
export function emailLayout(opts: {
  preheader?: string;
  title: string;
  body: string; // HTML body
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}): string {
  const { preheader, title, body, ctaLabel, ctaUrl, footerNote } = opts;
  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F2EEE6;font-family:Georgia,serif;color:#1a1a1a;">
${preheader ? `<div style="display:none;visibility:hidden;mso-hide:all;font-size:1px;color:#F2EEE6;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${preheader}</div>` : ""}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F2EEE6;">
  <tr><td align="center" style="padding:48px 24px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#FAF6EE;border:1px solid #DCD3C4;">
      <tr><td style="padding:40px 48px 24px;">
        <p style="margin:0 0 8px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7a7066;">Cultimed · Dispensario</p>
        <h1 style="margin:16px 0 0;font-size:32px;font-weight:300;line-height:1.1;color:#1a1a1a;">${title}</h1>
      </td></tr>
      <tr><td style="padding:0 48px 32px;font-size:16px;line-height:1.6;color:#3a3530;">
        ${body}
        ${ctaLabel && ctaUrl ? `
        <div style="margin:32px 0 8px;">
          <a href="${ctaUrl}" style="display:inline-block;background:#1a1a1a;color:#F2EEE6;padding:14px 32px;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:1px;text-transform:uppercase;">${ctaLabel}</a>
        </div>
        <p style="margin:8px 0 0;font-size:12px;color:#7a7066;font-family:monospace;word-break:break-all;">O copia este enlace: ${ctaUrl}</p>` : ""}
      </td></tr>
      <tr><td style="padding:24px 48px 40px;border-top:1px solid #DCD3C4;font-size:11px;line-height:1.6;color:#7a7066;font-family:Helvetica,Arial,sans-serif;">
        ${footerNote || "Si no esperabas este mensaje, ignóralo. Tu cuenta sigue segura."}
        <br><br>
        Cultimed · dispensariocultimed.cl<br>
        Datos clínicos protegidos bajo Ley 19.628.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
