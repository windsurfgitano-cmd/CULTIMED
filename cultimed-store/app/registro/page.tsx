import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { registerCustomer, getCurrentCustomer } from "@/lib/auth";
import { isValidRut, formatRut, cleanRut } from "@/lib/rut";
import {
  attachReferralOnRegister,
  findActiveCode,
  REFERRAL_COOKIE_NAME,
} from "@/lib/referrals";
import { get } from "@/lib/db";
import { createCustomerResetToken } from "@/lib/password-reset";
import { sendEmail, emailLayout } from "@/lib/email";

async function registerAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const rutRaw = String(formData.get("rut") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const next = String(formData.get("next") || "/mi-cuenta");

  if (!email || !password || !fullName) {
    redirect("/registro?e=missing&next=" + encodeURIComponent(next));
  }
  if (rutRaw && !isValidRut(rutRaw)) {
    redirect("/registro?e=rut_invalid&next=" + encodeURIComponent(next));
  }
  const rut = rutRaw ? formatRut(cleanRut(rutRaw)) : undefined;

  const result = await registerCustomer({ email, password, full_name: fullName, rut, phone });
  if ("error" in result) {
    // Caso especial: usuario migrado que intenta registrarse — dispara email de activación auto
    if (result.error === "needs_activation") {
      const ip = headers().get("x-forwarded-for") || headers().get("x-real-ip") || null;
      const reset = await createCustomerResetToken({ email, ip: ip || undefined });
      if (reset) {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || `https://${headers().get("host") || "dispensariocultimed.cl"}`;
        const link = `${baseUrl}/recuperar/${reset.token}`;
        await sendEmail({
          to: email,
          subject: "Activa tu cuenta Cultimed",
          html: emailLayout({
            preheader: "Activa tu cuenta Cultimed — define tu contraseña",
            title: "Activa tu cuenta.",
            body: `<p>Hola,</p><p>Detectamos que intentaste registrarte con un email que ya tiene cuenta en Cultimed pero aún no la has activado.</p><p>Define tu contraseña con el enlace de abajo (válido 1 hora) y entra normalmente con email + nueva contraseña.</p>`,
            ctaLabel: "Definir mi contraseña",
            ctaUrl: link,
          }),
          text: `Detectamos que intentaste registrarte con un email que ya existe en Cultimed pero sin activar.\n\nDefine tu contraseña aquí (válido 1 hora):\n${link}\n\nCultimed`,
        });
      }
    }
    redirect(`/registro?e=${result.error}&next=${encodeURIComponent(next)}`);
  }

  // Tracking de referral: si hay cookie con código válido, asociar conversión.
  const refCode = cookies().get(REFERRAL_COOKIE_NAME)?.value;
  if (refCode) {
    await attachReferralOnRegister({ newAccountId: result.id, refCode });
    cookies().delete(REFERRAL_COOKIE_NAME);
  }

  redirect(next);
}

const ERR: Record<string, string> = {
  missing: "Completa todos los campos obligatorios.",
  weak_password: "La contraseña debe tener al menos 6 caracteres.",
  duplicate_email: "Ya existe una cuenta con ese email. Intenta ingresar.",
  needs_activation: "Tu cuenta existe pero aún no la has activado. Te enviamos email para crear tu contraseña — revisa tu inbox (y spam).",
  rut_invalid: "RUT inválido. Verifica el dígito verificador.",
};

export default async function RegisterPage({ searchParams }: { searchParams: { e?: string; next?: string; invitado?: string } }) {
  if (await getCurrentCustomer()) redirect(searchParams.next || "/mi-cuenta");
  const error = searchParams.e ? ERR[searchParams.e] : null;
  const next = searchParams.next || "/mi-cuenta";

  // ¿Vino con un código de referido válido?
  const refCode = cookies().get(REFERRAL_COOKIE_NAME)?.value;
  let inviter: { name: string | null } | null = null;
  if (refCode) {
    const code = await findActiveCode(refCode);
    if (code) {
      const ambassador = await get<{ full_name: string | null }>(
        `SELECT full_name FROM customer_accounts WHERE id = ?`,
        code.ambassador_account_id
      );
      inviter = { name: ambassador?.full_name || null };
    }
  }

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24 min-h-[80vh]">
      {inviter && (
        <div className="mb-10 p-5 lg:p-6 border-l-2 border-brass bg-brass/5 max-w-3xl">
          <p className="eyebrow text-brass-dim mb-2">— Te invitaron</p>
          <p className="font-display text-2xl italic mb-1 text-balance">
            {inviter.name ? `${inviter.name.split(" ")[0]} te recomienda Cultimed.` : "Un paciente Cultimed te recomienda."}
          </p>
          <p className="text-sm text-ink-muted leading-relaxed">
            Al crear tu cuenta y completar tu primera dispensación tendrás{" "}
            <strong>5% de descuento</strong> aplicado automáticamente.
          </p>
        </div>
      )}
      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        {/* Left — Editorial promise */}
        <div className="col-span-12 lg:col-span-5 lg:sticky lg:top-32 self-start">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— 01</span>
            <span className="eyebrow">Crear cuenta</span>
          </div>
          <h1 className="font-display text-display-2 leading-[0.98] mb-8 text-balance">
            <span className="font-light">Tu acceso</span>{" "}
            <span className="italic font-normal">privado</span>{" "}
            <span className="font-light">al dispensario.</span>
          </h1>
          <p className="text-base leading-relaxed text-ink-muted mb-10 max-w-md">
            Una cuenta para gestionar tus recetas, hacer seguimiento de tratamientos,
            y dispensar con la trazabilidad que requiere la Ley 20.850.
          </p>
          <div className="space-y-4">
            {[
              { n: "I", t: "Registro", d: "Identidad básica + RUT chileno" },
              { n: "II", t: "Receta", d: "Carga PDF/imagen de tu receta vigente" },
              { n: "III", t: "Validación", d: "Nuestro QF revisa y aprueba (24h hábiles)" },
              { n: "IV", t: "Acceso", d: "Catálogo completo desbloqueado" },
            ].map((s) => (
              <div key={s.n} className="flex items-baseline gap-4 pb-4 border-b border-rule-soft">
                <span className="editorial-numeral text-base text-ink-subtle w-8">{s.n}</span>
                <div>
                  <p className="font-display text-lg italic">{s.t}</p>
                  <p className="text-sm text-ink-muted">{s.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Form */}
        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          {error && (
            <div className="mb-8 p-5 bg-sangria/10 border-l-2 border-sangria">
              <p className="eyebrow text-sangria mb-1">— Error</p>
              <p className="text-sm text-ink">{error}</p>
            </div>
          )}

          <form action={registerAction} className="space-y-7">
            <input type="hidden" name="next" value={next} />

            <div>
              <label htmlFor="full_name" className="input-label">Nombre completo *</label>
              <input id="full_name" name="full_name" required autoFocus className="input-editorial" placeholder="Como aparece en tu cédula" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">
              <div>
                <label htmlFor="rut" className="input-label">RUT</label>
                <input id="rut" name="rut" className="input-editorial nums-lining" placeholder="12.345.678-9" />
              </div>
              <div>
                <label htmlFor="phone" className="input-label">Teléfono / WhatsApp</label>
                <input id="phone" name="phone" type="tel" className="input-editorial" placeholder="+56 9 XXXX XXXX" />
              </div>
            </div>

            <div>
              <label htmlFor="email" className="input-label">Email *</label>
              <input id="email" name="email" type="email" required autoComplete="email" className="input-editorial" placeholder="tu@correo.cl" />
            </div>

            <div>
              <label htmlFor="password" className="input-label">Contraseña *</label>
              <input id="password" name="password" type="password" required minLength={6} autoComplete="new-password" className="input-editorial" placeholder="Mínimo 6 caracteres" />
            </div>

            <div className="hairline" />

            <p className="text-xs text-ink-muted leading-relaxed">
              Al crear cuenta aceptas la{" "}
              <Link href="/privacidad" className="underline underline-offset-4 decoration-ink/40 hover:decoration-ink">Política de Privacidad</Link>{" "}
              y los{" "}
              <Link href="/terminos" className="underline underline-offset-4 decoration-ink/40 hover:decoration-ink">Términos de Uso</Link>.
              Tus datos de salud están clasificados como sensibles y reciben protección reforzada conforme al art. 11 de la Ley 19.628.
            </p>

            <div className="flex flex-col gap-3 pt-2">
              <button type="submit" className="btn-brass">Crear cuenta</button>
              <Link href={`/ingresar?next=${encodeURIComponent(next)}`} className="btn-link justify-center">
                Ya tengo cuenta · Ingresar →
              </Link>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
