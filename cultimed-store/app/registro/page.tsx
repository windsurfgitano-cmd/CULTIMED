import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { registerCustomer, getCurrentCustomer } from "@/lib/auth";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { isValidRut, formatRut, cleanRut } from "@/lib/rut";
import {
  attachReferralOnRegister,
  findActiveCode,
  REFERRAL_COOKIE_NAME,
} from "@/lib/referrals";
import { get, run } from "@/lib/db";
import { saveUploadedFile } from "@/lib/uploads";
import { createCustomerResetToken } from "@/lib/password-reset";
import { sendEmail, emailLayout } from "@/lib/email";
import RegisterForm from "@/components/RegisterForm";

async function registerAction(formData: FormData) {
  "use server";
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const rutRaw = String(formData.get("rut") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const next = safeRedirectPath(String(formData.get("next") || ""));

  if (!email || !password || !fullName || !rutRaw || !phone) {
    redirect("/registro?e=missing&next=" + encodeURIComponent(next));
  }
  if (!isValidRut(rutRaw)) {
    redirect("/registro?e=rut_invalid&next=" + encodeURIComponent(next));
  }
  const rut = formatRut(cleanRut(rutRaw));

  // Subir documentos primero
  const docFields = [
    { key: "prescription", column: "prescription_url", docType: "receta" },
    { key: "id_front", column: "id_front_url", docType: "carnet-frente" },
    { key: "id_back", column: "id_back_url", docType: "carnet-dorso" },
    { key: "criminal_record", column: "criminal_record_url", docType: "antecedentes" },
    { key: "rights_assignment", column: "rights_assignment_url", docType: "deposito" },
  ] as const;

  const docUrls: Record<string, string> = {};
  for (const doc of docFields) {
    const file = formData.get(doc.key) as File | null;
    if (!file || file.size === 0) {
      redirect("/registro?e=missing_docs&next=" + encodeURIComponent(next));
    }
    if (file.size > 8 * 1024 * 1024) {
      redirect("/registro?e=file_too_big&next=" + encodeURIComponent(next));
    }
    // Necesitamos el ID del customer para la ruta — primero creamos cuenta, luego actualizamos
    docUrls[doc.key] = ""; // placeholder, se sube después de crear cuenta
  }

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
    redirect(`/registro?e=${result.error}&next=${encodeURIComponent(next)}`);
  }

  const customerId = result.id;

  try {
    // Subir cada documento con el customer ID real
    const updates: string[] = [];
    const params: any[] = [];
    for (const doc of docFields) {
      const file = formData.get(doc.key) as File;
      const url = await saveUploadedFile(file, "patient-documents", String(customerId), doc.docType);
      updates.push(`${doc.column} = ?`);
      params.push(url);
    }
    // Marcar prescription_status = pending automáticamente
    updates.push("prescription_status = ?");
    params.push("pending");
    params.push(customerId);

    await run(
      `UPDATE customer_accounts SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ...params
    );
  } catch (uploadError: any) {
    // Si falla el upload, borrar la cuenta creada (rollback)
    await run(`DELETE FROM customer_accounts WHERE id = ?`, customerId);
    console.error("Upload failed:", uploadError);
    redirect(`/registro?e=upload_failed&next=${encodeURIComponent(next)}`);
  }

  // Crear o vincular ficha clínica automáticamente
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
  await run(
    `UPDATE customer_accounts SET patient_id = ? WHERE id = ?`,
    patientId, customerId
  );

  // Tracking de referral
  const refCode = cookies().get(REFERRAL_COOKIE_NAME)?.value;
  if (refCode) {
    await attachReferralOnRegister({ newAccountId: customerId, refCode });
    cookies().delete(REFERRAL_COOKIE_NAME);
  }

  redirect(next);
}

const ERR: Record<string, string> = {
  missing: "Completa todos los campos obligatorios.",
  missing_docs: "Debes subir los 5 documentos requeridos.",
  file_too_big: "Uno de los archivos supera 8 MB. Comprímelo o usa otro formato.",
  weak_password: "La contraseña debe tener al menos 6 caracteres.",
  duplicate_email: "Ya existe una cuenta con ese email. Intenta ingresar.",
  duplicate_rut: "Ya existe una cuenta registrada con ese RUT. Si es tuya, ingresa o recupera tu contraseña.",
  needs_activation: "Tu cuenta existe pero aún no la has activado. Te enviamos email para crear tu contraseña — revisa tu inbox (y spam).",
  rut_invalid: "RUT inválido. Verifica el dígito verificador.",
  upload_failed: "Error al subir documentos. Intenta de nuevo o contacta soporte.",
};

export default async function RegisterPage({ searchParams }: { searchParams: { e?: string; next?: string; invitado?: string } }) {
  if (await getCurrentCustomer()) redirect(searchParams.next || "/mi-cuenta");
  const error = searchParams.e ? ERR[searchParams.e] : null;
  const next = searchParams.next || "/mi-cuenta";

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
      action={registerAction}
      next={next}
      error={error}
      inviter={inviter}
    />
  );
}

