"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import FileUploadField from "./FileUploadField";
import { uploadAndAttach, UploadError, type UploadTarget } from "@/lib/client-upload";

type FieldStatus = "idle" | "uploading" | "done" | "error";

const DOC_FIELDS: Array<{ target: UploadTarget; label: string }> = [
  { target: "prescription", label: "Receta médica (foto o PDF)" },
  { target: "id_front", label: "Foto carnet por delante" },
  { target: "id_back", label: "Foto carnet por detrás" },
  { target: "criminal_record", label: "Antecedentes penales (captura o PDF)" },
  { target: "rights_assignment", label: "Comprobante de depósito (captura o PDF)" },
];

// Datos de transferencia del dispensario (env, NEXT_PUBLIC_). Se muestran junto
// al campo de "Comprobante de depósito" para que el paciente sepa a qué cuenta
// transferir antes de subir el comprobante.
const BANK = {
  name: process.env.NEXT_PUBLIC_BANK_NAME || "",
  accountType: process.env.NEXT_PUBLIC_BANK_ACCOUNT_TYPE || "",
  accountNumber: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || "",
  rut: process.env.NEXT_PUBLIC_BANK_RUT || "",
  holder: process.env.NEXT_PUBLIC_BANK_HOLDER || "",
  email: process.env.NEXT_PUBLIC_BANK_EMAIL || "",
};

const ERR: Record<string, string> = {
  missing: "Completa todos los campos obligatorios.",
  weak_password: "La contraseña debe tener al menos 6 caracteres.",
  duplicate_email: "Ya existe una cuenta con ese email. Intenta ingresar.",
  duplicate_rut: "Ya existe una cuenta registrada con ese RUT. Si es tuya, ingresa o recupera tu contraseña.",
  rut_invalid: "RUT inválido. Verifica el dígito verificador.",
};

export default function RegisterForm({
  next,
  error: initialError,
  inviter,
}: {
  next: string;
  error: string | null;
  inviter: { name: string | null } | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  const [files, setFiles] = useState<Partial<Record<UploadTarget, File>>>({});
  const [fieldStatus, setFieldStatus] = useState<Partial<Record<UploadTarget, FieldStatus>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [stageLabel, setStageLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(initialError);

  // Persistidos entre reintentos: una vez creada la cuenta, no la recreamos;
  // una vez subido un documento, no lo volvemos a subir.
  const customerIdRef = useRef<number | null>(null);
  const uploadedRef = useRef<Set<UploadTarget>>(new Set());
  const emailRef = useRef<string>("");

  const filesSelected = Object.keys(files).length;
  const totalFiles = DOC_FIELDS.length;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const password = String(fd.get("password") || "");
    const fullName = String(fd.get("full_name") || "").trim();
    const rut = String(fd.get("rut") || "").trim();
    const phone = String(fd.get("phone") || "").trim();
    emailRef.current = email;

    for (const { target, label } of DOC_FIELDS) {
      if (!files[target] && !uploadedRef.current.has(target)) {
        setError(`Falta subir: ${label}.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      // 1) Crear cuenta (solo si no se creó ya en un intento anterior)
      if (!customerIdRef.current) {
        setStageLabel("Creando tu cuenta…");
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, full_name: fullName, rut, phone }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (json.error === "needs_activation") {
            router.push(`/recuperar?activar=1&email=${encodeURIComponent(email)}`);
            return;
          }
          setError(ERR[json.error] || "No pudimos crear tu cuenta. Intenta de nuevo.");
          setSubmitting(false);
          setStageLabel(null);
          return;
        }
        customerIdRef.current = json.customerId;
      }

      // 2) Subir cada documento directo a Storage (bypass del límite de Vercel)
      for (const { target, label } of DOC_FIELDS) {
        if (uploadedRef.current.has(target)) continue;
        const file = files[target];
        if (!file) continue;

        setFieldStatus((s) => ({ ...s, [target]: "uploading" }));
        setStageLabel(`Subiendo: ${label}…`);
        try {
          await uploadAndAttach(target, file);
          uploadedRef.current.add(target);
          setFieldStatus((s) => ({ ...s, [target]: "done" }));
        } catch (err) {
          setFieldStatus((s) => ({ ...s, [target]: "error" }));
          const msg = err instanceof UploadError ? err.message : "Error al subir el archivo.";
          setError(`${label}: ${msg} Tu cuenta ya está creada — corrige el archivo y presiona "Crear cuenta" de nuevo, solo reintentará lo pendiente.`);
          setSubmitting(false);
          setStageLabel(null);
          return;
        }
      }

      // 3) Todo listo
      setStageLabel("Listo. Redirigiendo…");
      router.push(next);
    } catch (err) {
      setError("Ocurrió un error inesperado. Intenta de nuevo.");
      setSubmitting(false);
      setStageLabel(null);
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
        {/* Left — Editorial steps */}
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
              { n: "I", t: "Datos personales", d: "Nombre completo, RUT, teléfono y email" },
              { n: "II", t: "Documentos requeridos", d: "Carnet, receta médica, antecedentes y comprobante de depósito" },
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
              <p className="text-sm text-ink whitespace-pre-line">{error}</p>
            </div>
          )}
          {stageLabel && !error && (
            <div className="mb-8 p-5 bg-forest/5 border-l-2 border-forest flex items-center gap-3">
              <span className="w-4 h-4 border-2 border-forest border-t-transparent rounded-full animate-spin shrink-0" aria-hidden />
              <p className="text-sm text-ink">{stageLabel}</p>
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-7">
            <input type="hidden" name="next" value={next} />

            <div>
              <label htmlFor="full_name" className="input-label">Nombre completo *</label>
              <input id="full_name" name="full_name" type="text" required disabled={submitting} className="input-field" />
            </div>

            <div>
              <label htmlFor="rut" className="input-label">RUT *</label>
              <input id="rut" name="rut" type="text" required disabled={submitting} placeholder="12.345.678-9" className="input-field" />
              <p className="mt-1 text-xs text-ink-muted">Ej: 12.345.678‑9 (con guion)</p>
            </div>

            <div>
              <label htmlFor="phone" className="input-label">Teléfono *</label>
              <input id="phone" name="phone" type="tel" required disabled={submitting} placeholder="+56 9 1234 5678" className="input-field" />
            </div>

            <div>
              <label htmlFor="email" className="input-label">Email *</label>
              <input id="email" name="email" type="email" required disabled={submitting} placeholder="tu@email.com" className="input-field" />
            </div>

            <div>
              <label htmlFor="password" className="input-label">Contraseña *</label>
              <input id="password" name="password" type="password" required disabled={submitting} minLength={6} className="input-field" />
              <p className="mt-1 text-xs text-ink-muted">Mínimo 6 caracteres</p>
            </div>

            <div className="hairline" />

            <p className="eyebrow">Documentos requeridos</p>
            <p className="text-sm text-ink-muted mb-5">
              Cada uno debe ser un archivo individual (PDF, JPG o PNG) · máx 8 MB · {filesSelected}/{totalFiles} seleccionados
            </p>

            {DOC_FIELDS.map(({ target, label }) => (
              <div key={target}>
                {target === "rights_assignment" && BANK.accountNumber && (
                  <div className="mb-3 border border-ink/15 bg-paper-dim/60 p-4">
                    <p className="eyebrow mb-2">— Datos para tu depósito de inscripción</p>
                    <p className="text-xs text-ink-muted mb-3 leading-relaxed">
                      Transfiere el valor de inscripción a esta cuenta y sube el comprobante aquí abajo.
                    </p>
                    <dl className="text-sm space-y-1.5">
                      <div className="flex justify-between gap-3"><dt className="text-ink-muted shrink-0">Titular</dt><dd className="text-ink text-right">{BANK.holder}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-ink-muted shrink-0">RUT</dt><dd className="text-ink text-right font-mono nums-lining">{BANK.rut}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-ink-muted shrink-0">Banco</dt><dd className="text-ink text-right">{BANK.name}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-ink-muted shrink-0">Tipo de cuenta</dt><dd className="text-ink text-right">{BANK.accountType}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-ink-muted shrink-0">N° de cuenta</dt><dd className="text-ink text-right font-mono nums-lining">{BANK.accountNumber}</dd></div>
                      <div className="flex justify-between gap-3"><dt className="text-ink-muted shrink-0">Enviar comprobante a</dt><dd className="text-ink text-right break-all">{BANK.email}</dd></div>
                    </dl>
                  </div>
                )}
                <FileUploadField
                  name={target}
                  label={label}
                  required
                  status={fieldStatus[target] || "idle"}
                  onFileChange={(file) => {
                    setFiles((prev) => {
                      const next = { ...prev };
                      if (file) next[target] = file;
                      else delete next[target];
                      return next;
                    });
                    // Si el usuario reemplaza un archivo ya subido, hay que re-subirlo.
                    uploadedRef.current.delete(target);
                    setFieldStatus((s) => ({ ...s, [target]: "idle" }));
                  }}
                />
              </div>
            ))}

            <div className="hairline" />

            <p className="text-xs text-ink-muted leading-relaxed">
              Al crear cuenta aceptas la{" "}
              <Link href="/privacidad" className="underline underline-offset-4 decoration-ink/40 hover:decoration-ink">Política de Privacidad</Link>{" "}
              y los{" "}
              <Link href="/terminos" className="underline underline-offset-4 decoration-ink/40 hover:decoration-ink">Términos de Uso</Link>.
              Tus datos de salud están clasificados como sensibles y reciben protección reforzada conforme al art. 11 de la Ley 19.628.
            </p>

            <div className="flex flex-col gap-3 pt-2">
              <button type="submit" disabled={submitting || filesSelected < totalFiles} className="btn-brass disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? "Creando cuenta…" : "Crear cuenta"}
              </button>
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
