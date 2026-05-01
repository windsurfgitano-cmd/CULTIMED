// Forgot password — paciente solicita link de recuperación a su email.

import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createCustomerResetToken } from "@/lib/password-reset";
import { sendEmail, emailLayout } from "@/lib/email";

async function requestResetAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) redirect("/recuperar?e=missing");

  const ip = headers().get("x-forwarded-for") || headers().get("x-real-ip") || null;

  const result = await createCustomerResetToken({ email, ip: ip || undefined });

  // Por seguridad: respondemos lo mismo aunque la cuenta no exista (anti-enumeration).
  if (result) {
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ||
      `https://${headers().get("host") || "dispensariocultimed.cl"}`;
    const link = `${baseUrl}/recuperar/${result.token}`;

    await sendEmail({
      to: result.email,
      subject: "Recupera tu contraseña · Cultimed",
      html: emailLayout({
        preheader: "Restablece tu contraseña en Cultimed",
        title: "Restablece tu contraseña.",
        body: `
<p>Hola,</p>
<p>Recibimos una solicitud para restablecer la contraseña de tu cuenta Cultimed (${result.email}).</p>
<p>El enlace es válido por 1 hora y solo se puede usar una vez.</p>
        `,
        ctaLabel: "Restablecer contraseña",
        ctaUrl: link,
        footerNote: "Si tú no solicitaste este cambio, puedes ignorar este mensaje. Tu contraseña actual sigue activa.",
      }),
      text: `Restablece tu contraseña Cultimed.\n\nAbre este enlace en 1 hora:\n${link}\n\nSi no fuiste tú, ignora este mensaje.`,
    });
  }

  redirect("/recuperar?ok=1");
}

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { e?: string; ok?: string };
}) {
  const success = searchParams.ok === "1";
  const error = searchParams.e === "missing" ? "Ingresa tu email." : null;

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24 min-h-[80vh]">
      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        <div className="col-span-12 lg:col-span-5 lg:sticky lg:top-32 self-start">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— 01</span>
            <span className="eyebrow">Recuperar contraseña</span>
          </div>
          <h1 className="font-display text-display-2 leading-[0.98] mb-8 text-balance">
            <span className="font-light">¿Olvidaste tu</span>{" "}
            <span className="italic font-normal">contraseña</span>
            <span className="font-light">?</span>
          </h1>
          <p className="text-base leading-relaxed text-ink-muted mb-10 max-w-md">
            Ingresa el email con el que registraste tu cuenta. Te enviamos un enlace para
            crear una nueva contraseña. El enlace caduca en 1 hora.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          {success ? (
            <div className="p-7 lg:p-8 border border-forest bg-forest/5">
              <p className="eyebrow text-forest mb-3">— Solicitud recibida</p>
              <h2 className="font-display text-3xl leading-tight mb-4 text-balance">
                Si esa cuenta <span className="italic">existe</span>, te llegó un email.
              </h2>
              <p className="text-sm text-ink-muted leading-relaxed mb-6">
                Revisa tu bandeja de entrada (y spam). Te mandamos un enlace válido por 1 hora
                para restablecer tu contraseña.
              </p>
              <p className="text-[11px] font-mono text-ink-subtle mb-2">
                ¿No te llegó? Verifica que el email esté escrito correctamente, o contacta a soporte.
              </p>
              <Link href="/ingresar" className="btn-link mt-6 inline-block">
                ← Volver a ingresar
              </Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-8 p-5 bg-sangria/10 border-l-2 border-sangria">
                  <p className="eyebrow text-sangria mb-1">— Error</p>
                  <p className="text-sm text-ink">{error}</p>
                </div>
              )}
              <form action={requestResetAction} className="space-y-7">
                <div>
                  <label htmlFor="email" className="input-label">Email *</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoFocus
                    autoComplete="email"
                    className="input-editorial"
                    placeholder="tu@correo.cl"
                  />
                </div>

                <div className="flex flex-col gap-3 pt-2">
                  <button type="submit" className="btn-brass">Enviar enlace de recuperación</button>
                  <Link href="/ingresar" className="btn-link justify-center">
                    ← Volver a ingresar
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
