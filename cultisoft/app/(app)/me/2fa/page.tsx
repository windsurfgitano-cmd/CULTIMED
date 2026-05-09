// Enrolamiento 2FA TOTP del staff propio.
// Genera secret, muestra QR, espera verificación con código → activa.
// Permite desactivar (require código actual válido).
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { generateSecret, generateOtpauthUrl, verifyToken } from "@/lib/totp";
import PageHeader from "@/components/PageHeader";
import QRCode from "qrcode";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function enrollAction(formData: FormData) {
  "use server";
  const me = await requireStaff();
  const code = String(formData.get("code") || "").trim();
  const candidateSecret = String(formData.get("candidate_secret") || "").trim();

  if (!candidateSecret) redirect("/me/2fa?e=no_secret");
  if (!/^\d{6}$/.test(code)) redirect(`/me/2fa?e=bad_code&s=${encodeURIComponent(candidateSecret)}`);

  if (!verifyToken(code, candidateSecret)) {
    redirect(`/me/2fa?e=invalid&s=${encodeURIComponent(candidateSecret)}`);
  }

  await run(
    `UPDATE staff SET totp_secret = ?, totp_enabled = 1, updated_at = NOW() WHERE id = ?`,
    candidateSecret, me.id
  );
  await logAudit({ staffId: me.id, action: "totp_enabled", entityType: "staff", entityId: me.id });
  redirect("/me/2fa?ok=enrolled");
}

async function disableAction(formData: FormData) {
  "use server";
  const me = await requireStaff();
  const code = String(formData.get("code") || "").trim();
  if (!/^\d{6}$/.test(code)) redirect("/me/2fa?e=bad_code");

  const row = await get<{ totp_secret: string | null; totp_enabled: number }>(
    `SELECT totp_secret, totp_enabled FROM staff WHERE id = ?`,
    me.id
  );
  if (!row?.totp_enabled || !row.totp_secret) redirect("/me/2fa");

  if (!verifyToken(code, row!.totp_secret!)) {
    redirect("/me/2fa?e=invalid_disable");
  }

  await run(
    `UPDATE staff SET totp_secret = NULL, totp_enabled = 0, updated_at = NOW() WHERE id = ?`,
    me.id
  );
  await logAudit({ staffId: me.id, action: "totp_disabled", entityType: "staff", entityId: me.id });
  redirect("/me/2fa?ok=disabled");
}

const ERR: Record<string, string> = {
  no_secret: "Genera un nuevo secret e intenta de nuevo.",
  bad_code: "Ingresa exactamente 6 dígitos.",
  invalid: "Código inválido. Verifica que el reloj de tu dispositivo esté correcto.",
  invalid_disable: "Código inválido. No se desactivó 2FA.",
};

export default async function TwoFactorEnrollPage({
  searchParams,
}: {
  searchParams: { e?: string; ok?: string; s?: string };
}) {
  const me = await requireStaff();

  const status = await get<{ totp_enabled: number }>(
    `SELECT totp_enabled FROM staff WHERE id = ?`,
    me.id
  );
  const enabled = status?.totp_enabled === 1;

  // Si ya está activado, muestra estado + form de desactivar.
  if (enabled) {
    const error = searchParams.e ? ERR[searchParams.e] : null;
    return (
      <>
        <PageHeader
          title="Verificación en dos pasos"
          subtitle="2FA TOTP está activo en tu cuenta. Ingresa un código actual para desactivar."
          actions={<Link href="/me" className="btn-secondary">← Volver</Link>}
        />

        {searchParams.ok === "disabled" && (
          <div className="mb-5 px-4 py-3 bg-warning/10 border-l-4 border-warning rounded-r-lg">
            <p className="text-sm">2FA fue desactivado. Solo se requiere contraseña para entrar.</p>
          </div>
        )}
        {error && (
          <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg">
            <p className="text-sm text-on-error-container">{error}</p>
          </div>
        )}

        <div className="clinical-card p-6 max-w-md">
          <div className="flex items-center gap-3 mb-5 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-success text-[24px]">verified_user</span>
            <div>
              <p className="font-bold text-on-surface">2FA activo</p>
              <p className="text-[11px] text-on-surface-variant">Cada inicio de sesión pide código de tu app autenticadora.</p>
            </div>
          </div>

          <form action={disableAction} className="space-y-4">
            <div>
              <label htmlFor="code" className="input-label">Código actual de 6 dígitos para desactivar</label>
              <input
                type="text"
                id="code"
                name="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                placeholder="• • • • • •"
                className="input-field text-center font-mono text-xl tracking-[6px] py-3"
              />
            </div>
            <button type="submit" className="px-4 py-3 border border-error text-error font-mono text-[11px] uppercase tracking-widest hover:bg-error hover:text-on-error transition-colors w-full">
              Desactivar 2FA
            </button>
            <p className="text-[11px] text-on-surface-variant text-center">
              Recomendamos mantener 2FA activado por compliance Ley 19.628.
            </p>
          </form>
        </div>
      </>
    );
  }

  // Enrolamiento: genera (o reusa) secret candidato + QR
  const candidateSecret = searchParams.s || generateSecret();
  const otpauthUrl = generateOtpauthUrl(me.email, candidateSecret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
    color: { dark: "#0F1A22", light: "#F7F1E5" },
  });

  const error = searchParams.e ? ERR[searchParams.e] : null;

  return (
    <>
      <PageHeader
        title="Activar verificación en dos pasos"
        subtitle="Protege tu cuenta con un código de 6 dígitos generado por tu app autenticadora."
        actions={<Link href="/me" className="btn-secondary">← Volver</Link>}
      />

      {searchParams.ok === "enrolled" && (
        <div className="mb-5 px-4 py-3 bg-success/10 border-l-4 border-success rounded-r-lg">
          <p className="text-sm">2FA activado correctamente. La próxima vez que inicies sesión te pedirá el código.</p>
        </div>
      )}
      {error && (
        <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg">
          <p className="text-sm text-on-error-container">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="clinical-card p-6">
          <h2 className="text-sm font-bold mb-5 pb-3 border-b border-outline-variant/40 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">qr_code_2</span>
            Paso 1 · Escanea el QR
          </h2>
          <div className="flex justify-center bg-paper-bright p-4 border border-rule">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR para escanear con app autenticadora" width={320} height={320} className="block" />
          </div>
          <p className="text-[12px] text-on-surface-variant mt-4 text-center">
            Apps recomendadas: Google Authenticator, Authy, 1Password, Bitwarden.
          </p>
          <details className="mt-4">
            <summary className="text-[12px] text-on-surface-variant cursor-pointer hover:text-on-surface">¿No puedes escanear? Copia el código manualmente</summary>
            <p className="mt-2 font-mono text-xs bg-paper-dim/50 p-3 break-all">{candidateSecret}</p>
          </details>
        </div>

        <div className="clinical-card p-6">
          <h2 className="text-sm font-bold mb-5 pb-3 border-b border-outline-variant/40 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">verified</span>
            Paso 2 · Confirma con un código
          </h2>
          <form action={enrollAction} className="space-y-4">
            <input type="hidden" name="candidate_secret" value={candidateSecret} />
            <div>
              <label htmlFor="code" className="input-label">Código de 6 dígitos generado por la app</label>
              <input
                type="text"
                id="code"
                name="code"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                placeholder="• • • • • •"
                className="input-field text-center font-mono nums-lining text-2xl tracking-[8px] py-4"
                autoFocus
              />
            </div>
            <button type="submit" className="btn-primary w-full">
              Activar 2FA
            </button>
            <p className="text-[11px] text-on-surface-variant">
              Después de activar, cada inicio de sesión te pedirá un código nuevo.
            </p>
          </form>
        </div>
      </div>
    </>
  );
}
