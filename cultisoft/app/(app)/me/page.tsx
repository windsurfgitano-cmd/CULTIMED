// Página personal del staff: cambiar password + gestionar 2FA.
// Cualquier staff autenticado accede a la suya.
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import PageHeader from "@/components/PageHeader";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "Super Admin",
  admin: "Administrador",
  doctor: "Médico",
  pharmacist: "Químico Farmacéutico",
  dispenser: "Dispensador",
};

async function changePassword(formData: FormData) {
  "use server";
  const me = await requireStaff();

  const current = String(formData.get("current_password") || "");
  const next = String(formData.get("new_password") || "");
  const confirm = String(formData.get("confirm_password") || "");

  if (!current) redirect("/me?e=missing_current");
  if (next.length < 8) redirect("/me?e=too_short");
  if (next !== confirm) redirect("/me?e=mismatch");
  if (next === current) redirect("/me?e=same");

  // Verifica password actual
  const fresh = await get<{ password_hash: string }>(
    `SELECT password_hash FROM staff WHERE id = ?`,
    me.id
  );
  if (!fresh) redirect("/me?e=user_gone");

  const ok = await bcrypt.compare(current, fresh!.password_hash);
  if (!ok) redirect("/me?e=current_wrong");

  const newHash = await bcrypt.hash(next, 10);
  await run(
    `UPDATE staff SET password_hash = ?, updated_at = NOW() WHERE id = ?`,
    newHash, me.id
  );

  await logAudit({
    staffId: me.id,
    action: "staff_password_changed",
    entityType: "staff",
    entityId: me.id,
  });

  redirect("/me?ok=1");
}

const ERR: Record<string, string> = {
  missing_current: "Falta tu contraseña actual.",
  too_short: "La nueva contraseña debe tener al menos 8 caracteres.",
  mismatch: "La nueva contraseña y su confirmación no coinciden.",
  same: "La nueva contraseña debe ser distinta a la actual.",
  user_gone: "Tu cuenta fue desactivada. Contacta al administrador.",
  current_wrong: "Contraseña actual incorrecta.",
};

export default async function MyAccountPage({
  searchParams,
}: {
  searchParams: { ok?: string; e?: string };
}) {
  const me = await requireStaff();
  const error = searchParams.e ? ERR[searchParams.e] : null;
  const success = searchParams.ok === "1";

  const totp = await get<{ totp_enabled: number }>(
    `SELECT totp_enabled FROM staff WHERE id = ?`,
    me.id
  );
  const totpEnabled = totp?.totp_enabled === 1;

  return (
    <>
      <PageHeader
        title="Mi cuenta"
        subtitle={`${me.full_name} · ${ROLE_LABEL[me.role] || me.role}`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <aside className="lg:col-span-1">
          <div className="clinical-card p-6 space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Email</p>
              <p className="font-mono text-sm">{me.email}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Nombre</p>
              <p className="text-sm">{me.full_name}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Rol</p>
              <p className="text-sm">{ROLE_LABEL[me.role] || me.role}</p>
            </div>
            {me.professional_license && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">Licencia profesional</p>
                <p className="font-mono text-sm">{me.professional_license}</p>
              </div>
            )}
          </div>
        </aside>

        <div className="lg:col-span-2">
          <div className="clinical-card p-6">
            <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-5 pb-3 border-b border-outline-variant/40">
              <span className="material-symbols-outlined text-primary text-[20px]">lock_reset</span>
              Cambiar contraseña
            </h2>

            {success && (
              <div className="mb-5 px-4 py-3 bg-success/10 border-l-4 border-success rounded-r-lg flex gap-2 items-start">
                <span className="material-symbols-outlined text-success mt-0.5">check_circle</span>
                <p className="text-sm">Contraseña actualizada correctamente.</p>
              </div>
            )}
            {error && (
              <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg flex gap-2 items-start">
                <span className="material-symbols-outlined text-error mt-0.5">error</span>
                <p className="text-sm text-on-error-container">{error}</p>
              </div>
            )}

            <form action={changePassword} className="space-y-5 max-w-md">
              <div>
                <label htmlFor="current_password" className="input-label">Contraseña actual *</label>
                <input
                  type="password"
                  id="current_password"
                  name="current_password"
                  required
                  className="input-field"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label htmlFor="new_password" className="input-label">Nueva contraseña * (mín. 8 caracteres)</label>
                <input
                  type="password"
                  id="new_password"
                  name="new_password"
                  required
                  minLength={8}
                  className="input-field"
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
                  minLength={8}
                  className="input-field"
                  autoComplete="new-password"
                />
              </div>
              <div className="flex justify-end pt-2">
                <button type="submit" className="btn-primary">
                  <span className="material-symbols-outlined text-base">save</span>
                  Actualizar contraseña
                </button>
              </div>
            </form>

            <p className="mt-6 text-[11px] text-on-surface-variant leading-relaxed">
              El cambio queda registrado en la bitácora de auditoría con tu cuenta y la fecha/hora.
              Tu sesión actual sigue activa después del cambio.
            </p>
          </div>

          {/* 2FA section */}
          <div className="clinical-card p-6 mt-6">
            <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-3 pb-3 border-b border-outline-variant/40">
              <span className="material-symbols-outlined text-primary text-[20px]">verified_user</span>
              Verificación en dos pasos (2FA)
            </h2>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                {totpEnabled ? (
                  <>
                    <p className="text-sm font-semibold text-success flex items-center gap-2">
                      <span className="material-symbols-outlined text-base">check_circle</span>
                      Activo
                    </p>
                    <p className="text-[12px] text-on-surface-variant mt-1 leading-relaxed">
                      Cada inicio de sesión te pide un código de 6 dígitos de tu app autenticadora.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-warning flex items-center gap-2">
                      <span className="material-symbols-outlined text-base">warning</span>
                      No activado
                    </p>
                    <p className="text-[12px] text-on-surface-variant mt-1 leading-relaxed">
                      Tu cuenta está protegida solo con contraseña. Recomendamos activar 2FA por compliance Ley 19.628 y para proteger datos clínicos.
                    </p>
                  </>
                )}
              </div>
              <Link href="/me/2fa" className={totpEnabled ? "btn-secondary shrink-0" : "btn-primary shrink-0"}>
                {totpEnabled ? "Gestionar" : "Activar 2FA"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
