// Cambiar contraseña desde la cuenta logueada del paciente.
// Valida password actual antes de cambiar. Audita el evento.
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { get, run } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

async function changePasswordAction(formData: FormData) {
  "use server";
  const me = await requireCustomer();

  const current = String(formData.get("current_password") || "");
  const next = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm_password") || "");

  if (!current) redirect("/mi-cuenta/cambiar-contrasena?e=missing_current");
  if (next.length < 6) redirect("/mi-cuenta/cambiar-contrasena?e=too_short");
  if (next !== confirm) redirect("/mi-cuenta/cambiar-contrasena?e=mismatch");
  if (next === current) redirect("/mi-cuenta/cambiar-contrasena?e=same");

  const acc = await get<{ password_hash: string }>(
    `SELECT password_hash FROM customer_accounts WHERE id = ?`,
    me.id
  );
  if (!acc) redirect("/ingresar");

  // Si password_hash vacío (cuenta migrada sin activar), no podemos verificar "actual"
  if (!acc.password_hash) redirect("/mi-cuenta/cambiar-contrasena?e=never_set");

  const ok = await bcrypt.compare(current, acc!.password_hash);
  if (!ok) redirect("/mi-cuenta/cambiar-contrasena?e=current_wrong");

  const newHash = await bcrypt.hash(next, 10);
  await run(
    `UPDATE customer_accounts SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    newHash, me.id
  );

  redirect("/mi-cuenta/cambiar-contrasena?ok=1");
}

const ERR: Record<string, string> = {
  missing_current: "Ingresa tu contraseña actual.",
  too_short: "La nueva contraseña debe tener al menos 6 caracteres.",
  mismatch: "Las contraseñas no coinciden.",
  same: "La nueva contraseña debe ser distinta a la actual.",
  current_wrong: "La contraseña actual es incorrecta.",
  never_set: "Tu cuenta no tiene contraseña configurada. Usa el flujo de Olvidé mi contraseña para crearla.",
};

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams: { e?: string; ok?: string };
}) {
  const me = await requireCustomer();
  const error = searchParams.e ? ERR[searchParams.e] : null;
  const success = searchParams.ok === "1";

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-12 lg:py-20 min-h-[70vh]">
      <nav className="mb-8 text-[11px] font-mono uppercase tracking-widest text-ink-muted">
        <Link href="/mi-cuenta" className="hover:text-ink transition-colors">Mi cuenta</Link>
        <span className="mx-2 text-ink-subtle">/</span>
        <span className="text-ink">Cambiar contraseña</span>
      </nav>

      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        <div className="col-span-12 lg:col-span-5 lg:sticky lg:top-32 self-start">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— Seguridad</span>
          </div>
          <h1 className="font-display text-display-2 leading-[0.98] mb-6 text-balance">
            <span className="font-light">Cambia tu</span>{" "}
            <span className="italic font-normal">contraseña</span>
            <span className="font-light">.</span>
          </h1>
          <p className="text-base leading-relaxed text-ink-muted mb-6 max-w-md">
            Por seguridad, te pedimos tu contraseña actual antes de cambiarla. Si la olvidaste,
            puedes usar el flujo de <Link href="/recuperar" className="underline">recuperar
            contraseña</Link> con tu email.
          </p>
          <p className="text-[11px] font-mono text-ink-muted leading-relaxed max-w-md">
            Tu sesión actual se mantiene activa después del cambio. Si crees que alguien más
            tiene acceso a tu cuenta, cambia la contraseña y cierra sesión en otros dispositivos.
          </p>
        </div>

        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <div className="p-7 lg:p-8 border border-rule bg-paper-bright">
            <p className="eyebrow mb-6">— Cuenta · {me.email}</p>

            {success && (
              <div className="mb-6 px-4 py-3 border-l-2 border-forest bg-forest/5">
                <p className="text-sm text-ink">✓ Contraseña actualizada correctamente.</p>
              </div>
            )}
            {error && (
              <div className="mb-6 px-4 py-3 border-l-2 border-sangria bg-sangria/5">
                <p className="text-sm text-ink">{error}</p>
                {searchParams.e === "never_set" && (
                  <p className="mt-2 text-sm">
                    <Link href="/recuperar" className="btn-link">Crear contraseña por email →</Link>
                  </p>
                )}
              </div>
            )}

            <form action={changePasswordAction} className="space-y-5">
              <div>
                <label htmlFor="current_password" className="input-label">Contraseña actual *</label>
                <input
                  type="password"
                  id="current_password"
                  name="current_password"
                  required
                  className="input-editorial"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label htmlFor="new_password" className="input-label">Nueva contraseña * (mín. 6 caracteres)</label>
                <input
                  type="password"
                  id="new_password"
                  name="new_password"
                  required
                  minLength={6}
                  className="input-editorial"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label htmlFor="confirm_password" className="input-label">Confirma nueva contraseña *</label>
                <input
                  type="password"
                  id="confirm_password"
                  name="confirm_password"
                  required
                  minLength={6}
                  className="input-editorial"
                  autoComplete="new-password"
                />
              </div>
              <div className="flex items-center gap-4 pt-2">
                <button type="submit" className="btn-brass">
                  Actualizar contraseña
                </button>
                <Link href="/mi-cuenta" className="btn-link">Cancelar</Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}
