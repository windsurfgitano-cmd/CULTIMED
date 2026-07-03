// Creación de cuenta — SOLO campos de texto (JSON), sin archivos.
// Se separó del flujo antiguo (un solo POST multipart con 5 archivos + texto)
// porque ese POST superaba fácilmente el límite duro de ~4.5MB que Vercel
// impone a las funciones serverless, y la mayoría de los registros con fotos
// reales de carnet/receta/antecedentes fallaban en silencio.
//
// Flujo nuevo: 1) este endpoint crea la cuenta y deja sesión activa (cookie):
// 2) el cliente sube cada documento DIRECTO a Supabase Storage vía
//    /api/uploads/sign + /api/uploads/attach, ya autenticado.
import { NextResponse, type NextRequest } from "next/server";
import { cookies, headers } from "next/headers";
import { registerCustomer } from "@/lib/auth";
import { isValidRut, formatRut, cleanRut } from "@/lib/rut";
import { attachReferralOnRegister, REFERRAL_COOKIE_NAME } from "@/lib/referrals";
import { get, run } from "@/lib/db";
import { createCustomerResetToken } from "@/lib/password-reset";
import { sendEmail, emailLayout } from "@/lib/email";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string; full_name?: string; rut?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";
  const fullName = (body.full_name || "").trim();
  const rutRaw = (body.rut || "").trim();
  const phone = (body.phone || "").trim();

  if (!email || !password || !fullName || !rutRaw || !phone) {
    return NextResponse.json({ error: "missing" }, { status: 400 });
  }
  if (!isValidRut(rutRaw)) {
    return NextResponse.json({ error: "rut_invalid" }, { status: 400 });
  }
  const rut = formatRut(cleanRut(rutRaw));

  const result = await registerCustomer({ email, password, full_name: fullName, rut, phone });
  if ("error" in result) {
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
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  const customerId = result.id;

  // Crear o vincular ficha clínica por RUT.
  const existingPatient = await get<{ id: number }>(`SELECT id FROM patients WHERE rut = ?`, rut);
  let patientId = existingPatient?.id || 0;
  if (patientId) {
    await run(
      `UPDATE patients
         SET full_name = COALESCE(NULLIF(full_name, ''), ?),
             email = COALESCE(email, ?),
             phone = COALESCE(phone, ?),
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      fullName, email, phone, patientId
    );
  } else {
    const patientRes = await run(
      `INSERT INTO patients (rut, full_name, email, phone, membership_status, membership_started_at)
       VALUES (?, ?, ?, ?, 'active', CURRENT_TIMESTAMP)
       RETURNING id`,
      rut, fullName, email, phone
    );
    patientId = Number(patientRes.lastInsertRowid);
  }
  await run(`UPDATE customer_accounts SET patient_id = ? WHERE id = ?`, patientId, customerId);

  // Tracking de referral (cookie seteada al entrar por /r/CODIGO).
  const refCode = cookies().get(REFERRAL_COOKIE_NAME)?.value;
  if (refCode) {
    await attachReferralOnRegister({ newAccountId: customerId, refCode });
    cookies().delete(REFERRAL_COOKIE_NAME);
  }

  // registerCustomer() ya dejó la cookie de sesión seteada — el cliente queda
  // autenticado para los siguientes uploads directos a Storage.
  return NextResponse.json({ ok: true, customerId });
}
