// Set new password page — paciente con token válido define nueva contraseña.

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  validateResetToken,
  consumeTokenAndResetPassword,
} from "@/lib/password-reset";

async function setPasswordAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") || "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm") || "");

  if (!token) redirect(`/recuperar?e=missing`);
  if (password.length < 6) redirect(`/recuperar/${token}?e=weak`);
  if (password !== confirm) redirect(`/recuperar/${token}?e=mismatch`);

  const r = await consumeTokenAndResetPassword({ token, newPassword: password });
  if (!r.ok) {
    if (r.error === "invalid_or_expired") redirect(`/recuperar/${token}?e=expired`);
    redirect(`/recuperar/${token}?e=${r.error || "unknown"}`);
  }

  redirect("/ingresar?reset=ok");
}

export default async function ResetTokenPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { e?: string };
}) {
  const valid = await validateResetToken(params.token);

  const ERR: Record<string, string> = {
    weak: "La contraseña debe tener al menos 6 caracteres.",
    mismatch: "Las contraseñas no coinciden.",
    expired: "Este enlace ya no es válido. Pide uno nuevo.",
    unknown: "No pudimos restablecer la contraseña. Intenta de nuevo.",
  };
  const errorMsg = searchParams.e ? ERR[searchParams.e] : null;

  if (!valid) {
    return (
      <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-20 lg:py-28">
        <div className="max-w-2xl">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— Enlace inválido</span>
          </div>
          <h1 className="font-display text-display-2 leading-[0.98] text-balance mb-6">
            <span className="font-light">Este enlace</span>{" "}
            <span className="italic font-normal">caducó</span>{" "}
            <span className="font-light">o ya fue usado.</span>
          </h1>
          <p className="text-base text-ink-muted leading-relaxed mb-8">
            Por seguridad, los enlaces de recuperación caducan en 1 hora y solo se pueden usar
            una vez. Pide uno nuevo y revísalo apenas te llegue.
          </p>
          <Link href="/recuperar" className="btn-brass">
            Pedir nuevo enlace
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24 min-h-[80vh]">
      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        <div className="col-span-12 lg:col-span-5 lg:sticky lg:top-32 self-start">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— 02</span>
            <span className="eyebrow">Nueva contraseña</span>
          </div>
          <h1 className="font-display text-display-2 leading-[0.98] mb-8 text-balance">
            <span className="font-light">Define una</span>{" "}
            <span className="italic font-normal">nueva</span>{" "}
            <span className="font-light">contraseña.</span>
          </h1>
          <p className="text-base leading-relaxed text-ink-muted mb-4 max-w-md">
            Cuenta: <span className="font-mono text-ink">{valid.email}</span>
          </p>
          <p className="text-sm text-ink-muted leading-relaxed max-w-md">
            Mínimo 6 caracteres. Una vez guardada, podrás ingresar con la nueva contraseña.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          {errorMsg && (
            <div className="mb-8 p-5 bg-sangria/10 border-l-2 border-sangria">
              <p className="eyebrow text-sangria mb-1">— Error</p>
              <p className="text-sm text-ink">{errorMsg}</p>
            </div>
          )}

          <form action={setPasswordAction} className="space-y-7">
            <input type="hidden" name="token" value={params.token} />
            <div>
              <label htmlFor="password" className="input-label">Nueva contraseña *</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={6}
                autoFocus
                autoComplete="new-password"
                className="input-editorial"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
            <div>
              <label htmlFor="confirm" className="input-label">Confirmar contraseña *</label>
              <input
                id="confirm"
                name="confirm"
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                className="input-editorial"
                placeholder="Repite la contraseña"
              />
            </div>

            <div className="flex flex-col gap-3 pt-2">
              <button type="submit" className="btn-brass">Guardar contraseña</button>
              <Link href="/ingresar" className="btn-link justify-center">
                ← Cancelar
              </Link>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}
