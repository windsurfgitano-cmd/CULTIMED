import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { get } from "@/lib/db";
import { findActiveCode, REFERRAL_COOKIE_NAME } from "@/lib/referrals";
import RegisterForm from "@/components/RegisterForm";

// El registro se ejecuta enteramente client-side (ver RegisterForm.tsx):
// 1) POST JSON a /api/auth/register (crea cuenta + sesión, sin archivos)
// 2) cada documento se sube DIRECTO a Supabase Storage vía /api/uploads/sign
//    + /api/uploads/attach, ya autenticado.
// Esto evita el límite duro de ~4.5MB por request que Vercel impone a las
// funciones serverless — el flujo anterior mandaba 5 archivos en un solo
// POST multipart y fallaba en silencio con fotos reales de celular.

const ERR: Record<string, string> = {
  missing: "Completa todos los campos obligatorios.",
  weak_password: "La contraseña debe tener al menos 6 caracteres.",
  duplicate_email: "Ya existe una cuenta con ese email. Intenta ingresar.",
  duplicate_rut: "Ya existe una cuenta registrada con ese RUT. Si es tuya, ingresa o recupera tu contraseña.",
  needs_activation: "Tu cuenta existe pero aún no la has activado. Te enviamos email para crear tu contraseña — revisa tu inbox (y spam).",
  rut_invalid: "RUT inválido. Verifica el dígito verificador.",
};

export default async function RegisterPage({ searchParams }: { searchParams: { e?: string; next?: string; invitado?: string } }) {
  if (await getCurrentCustomer()) redirect(safeRedirectPath(searchParams.next || "") || "/mi-cuenta");
  const error = searchParams.e ? ERR[searchParams.e] : null;
  const next = safeRedirectPath(searchParams.next || "") || "/mi-cuenta";

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
    <RegisterForm
      next={next}
      error={error}
      inviter={inviter}
    />
  );
}
