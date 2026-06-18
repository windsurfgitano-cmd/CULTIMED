"use client";

import { useState } from "react";
import Link from "next/link";
import FormSubmitButton from "./FormSubmitButton";
import FileUploadField from "./FileUploadField";

export default function RegisterForm({
  action,
  next,
  error,
  inviter,
}: {
  action: (formData: FormData) => Promise<void>;
  next: string;
  error: string | null;
  inviter: { name: string | null } | null;
}) {
  const [filesSelected, setFilesSelected] = useState(0);
  const totalFiles = 5;

  const handleFileChange = (hasFile: boolean) => {
    setFilesSelected((prev) => hasFile ? prev + 1 : prev - 1);
  };

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
              <p className="text-sm text-ink">{error}</p>
            </div>
          )}

          <form action={action} className="space-y-7" encType="multipart/form-data">
            <input type="hidden" name="next" value={next} />

            <div>
              <label htmlFor="full_name" className="input-label">Nombre completo *</label>
              <input id="full_name" name="full_name" type="text" required className="input-field" />
            </div>

            <div>
              <label htmlFor="rut" className="input-label">RUT *</label>
              <input id="rut" name="rut" type="text" required placeholder="12.345.678-9" className="input-field" />
              <p className="mt-1 text-xs text-ink-muted">Ej: 12.345.678‑9 (con guion)</p>
            </div>

            <div>
              <label htmlFor="phone" className="input-label">Teléfono *</label>
              <input id="phone" name="phone" type="tel" required placeholder="+56 9 1234 5678" className="input-field" />
            </div>

            <div>
              <label htmlFor="email" className="input-label">Email *</label>
              <input id="email" name="email" type="email" required placeholder="tu@email.com" className="input-field" />
            </div>

            <div>
              <label htmlFor="password" className="input-label">Contraseña *</label>
              <input id="password" name="password" type="password" required minLength={6} className="input-field" />
              <p className="mt-1 text-xs text-ink-muted">Mínimo 6 caracteres</p>
            </div>

            <div className="hairline" />

            <p className="eyebrow">Documentos requeridos</p>
            <p className="text-sm text-ink-muted mb-5">Cada uno debe ser un archivo individual (PDF, JPG o PNG) · máx 8 MB</p>

            <FileUploadField name="prescription" label="Receta médica (foto o PDF)" required onFileChange={handleFileChange} />
            <FileUploadField name="id_front" label="Foto carnet por delante" required onFileChange={handleFileChange} />
            <FileUploadField name="id_back" label="Foto carnet por detrás" required onFileChange={handleFileChange} />
            <FileUploadField name="criminal_record" label="Antecedentes penales (captura o PDF)" required onFileChange={handleFileChange} />
            <FileUploadField name="rights_assignment" label="Comprobante de depósito (captura o PDF)" required onFileChange={handleFileChange} />

            <div className="hairline" />

            <p className="text-xs text-ink-muted leading-relaxed">
              Al crear cuenta aceptas la{" "}
              <Link href="/privacidad" className="underline underline-offset-4 decoration-ink/40 hover:decoration-ink">Política de Privacidad</Link>{" "}
              y los{" "}
              <Link href="/terminos" className="underline underline-offset-4 decoration-ink/40 hover:decoration-ink">Términos de Uso</Link>.
              Tus datos de salud están clasificados como sensibles y reciben protección reforzada conforme al art. 11 de la Ley 19.628.
            </p>

            <div className="flex flex-col gap-3 pt-2">
              <FormSubmitButton pendingLabel="Creando cuenta…">
                Crear cuenta
              </FormSubmitButton>
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
