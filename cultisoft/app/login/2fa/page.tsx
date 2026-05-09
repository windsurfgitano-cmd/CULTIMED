// Verifica el segundo factor (TOTP) tras el login con password exitoso.
// Si la sesión actual NO está locked, redirige al dashboard.
import { redirect } from "next/navigation";
import { getLockedStaff, getCurrentStaff, unlockSession } from "@/lib/auth";
import { get } from "@/lib/db";
import { verifyToken } from "@/lib/totp";
import { logAudit } from "@/lib/audit";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

async function verifyAction(formData: FormData) {
  "use server";
  const locked = await getLockedStaff();
  if (!locked) redirect("/login");

  const code = String(formData.get("code") || "").trim();
  if (!/^\d{6}$/.test(code)) redirect("/login/2fa?e=bad_code");

  const row = await get<{ totp_secret: string }>(
    `SELECT totp_secret FROM staff WHERE id = ?`,
    locked.id
  );
  if (!row?.totp_secret) {
    // Inconsistencia: el flag dice activado pero no hay secret. Logout safe.
    cookies().delete("cultisoft_session");
    redirect("/login?e=2fa_misconfigured");
  }

  const ok = verifyToken(code, row!.totp_secret);
  if (!ok) {
    await logAudit({ staffId: locked.id, action: "totp_verify_failed", entityType: "staff", entityId: locked.id });
    redirect("/login/2fa?e=invalid");
  }

  await unlockSession();
  await logAudit({ staffId: locked.id, action: "totp_verify_success", entityType: "staff", entityId: locked.id });
  redirect("/dashboard");
}

export default async function TwoFactorVerifyPage({
  searchParams,
}: {
  searchParams: { e?: string };
}) {
  // Si ya está totalmente auth'd, mandar al dashboard
  const ok = await getCurrentStaff();
  if (ok) redirect("/dashboard");

  const locked = await getLockedStaff();
  if (!locked) redirect("/login");

  const errorMsg = searchParams.e === "invalid" ? "Código inválido. Verifica el código de 6 dígitos en tu app autenticadora."
    : searchParams.e === "bad_code" ? "Ingresa exactamente 6 dígitos."
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <p className="font-display text-3xl">
            <span className="font-light">Culti</span>
            <span className="italic text-brass-dim">soft</span>
          </p>
          <p className="eyebrow text-ink-subtle mt-2">— Verificación de dos pasos</p>
        </div>

        <div className="bg-paper-bright border border-rule p-7">
          <h1 className="font-display text-2xl mb-2 leading-tight">
            <span className="font-light">Código de</span>{" "}
            <span className="italic font-normal">tu autenticador</span>
          </h1>
          <p className="text-sm text-ink-muted mb-5">
            Bienvenido <strong>{locked.full_name.split(" ")[0]}</strong>. Ingresa el código de 6 dígitos
            de tu app (Google Authenticator, Authy, 1Password).
          </p>

          {errorMsg && (
            <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg">
              <p className="text-sm text-on-error-container">{errorMsg}</p>
            </div>
          )}

          <form action={verifyAction}>
            <label htmlFor="code" className="sr-only">Código TOTP</label>
            <input
              type="text"
              id="code"
              name="code"
              autoFocus
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              required
              placeholder="• • • • • •"
              className="input-field text-center font-mono nums-lining text-2xl tracking-[8px] py-4"
            />
            <button type="submit" className="btn-primary w-full mt-5">
              Verificar
              <span aria-hidden>→</span>
            </button>
          </form>

          <form action="/api/logout" method="POST" className="mt-5 text-center">
            <button type="submit" className="text-[12px] font-mono uppercase tracking-widest text-ink-muted hover:text-ink">
              ← Cancelar y salir
            </button>
          </form>
        </div>

        <p className="mt-8 text-[11px] font-mono text-ink-subtle text-center">
          ¿Perdiste acceso a tu app autenticadora? Contacta al super admin.
        </p>
      </div>
    </div>
  );
}
