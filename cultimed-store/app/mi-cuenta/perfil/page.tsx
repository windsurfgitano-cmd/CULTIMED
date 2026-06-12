import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { get, run } from "@/lib/db";

interface PatientData {
  id: number;
  address: string | null;
  city: string | null;
  phone: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

interface AccountDocs {
  prescription_status: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  criminal_record_url: string | null;
  prescription_url: string | null;
  rights_assignment_url: string | null;
  prescription_reviewer_notes: string | null;
}

const DOC_LABELS: { key: keyof AccountDocs; label: string }[] = [
  { key: "id_front_url", label: "Carnet por delante" },
  { key: "id_back_url", label: "Carnet por detrás" },
  { key: "criminal_record_url", label: "Antecedentes penales" },
  { key: "prescription_url", label: "Receta médica" },
  { key: "rights_assignment_url", label: "Cesión de derechos" },
];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pendiente",  cls: "pill-warning" },
  aprobada:  { label: "Aprobada",   cls: "pill-success" },
  rechazada: { label: "Rechazada",  cls: "pill-error"   },
  none:      { label: "Sin receta", cls: "pill-neutral" },
};

async function updateProfile(formData: FormData) {
  "use server";
  const customer = await requireCustomer();
  if (!customer.patient_id) redirect("/mi-cuenta/perfil?e=no_patient");

  const phone = String(formData.get("phone") || "").trim() || null;
  const address = String(formData.get("address") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const ecName = String(formData.get("emergency_contact_name") || "").trim() || null;
  const ecPhone = String(formData.get("emergency_contact_phone") || "").trim() || null;

  await run(
    `UPDATE patients SET phone = ?, address = ?, city = ?,
       emergency_contact_name = ?, emergency_contact_phone = ?,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    phone, address, city, ecName, ecPhone, customer.patient_id
  );

  redirect("/mi-cuenta/perfil?ok=1");
}

const ERR_MSG: Record<string, string> = {
  no_patient: "No encontramos tu ficha de paciente. Contacta a soporte.",
};

export default async function PerfilPage({ searchParams }: { searchParams: { ok?: string; e?: string } }) {
  const customer = await requireCustomer();
  const success = searchParams.ok === "1";
  const error = searchParams.e ? ERR_MSG[searchParams.e] : null;

  let patient: PatientData | null = null;
  if (customer.patient_id) {
    patient = (await get<PatientData>(
      `SELECT id, address, city, phone, emergency_contact_name, emergency_contact_phone
       FROM patients WHERE id = ?`,
      customer.patient_id
    )) || null;
  }

  const docs = await get<AccountDocs>(
    `SELECT prescription_status, id_front_url, id_back_url,
       criminal_record_url, prescription_url, rights_assignment_url,
       prescription_reviewer_notes
     FROM customer_accounts WHERE id = ?`,
    customer.id
  );

  const uploadedCount = docs
    ? [docs.id_front_url, docs.id_back_url, docs.criminal_record_url, docs.prescription_url, docs.rights_assignment_url].filter(Boolean).length
    : 0;
  const docMeta = docs ? (STATUS_META[docs.prescription_status ?? "none"] ?? STATUS_META.none) : null;

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24">
      <div className="mb-12 lg:mb-16">
        <Link href="/mi-cuenta" className="text-xs uppercase tracking-widest font-mono text-ink-muted hover:text-ink mb-6 inline-block">
          ← Mi cuenta
        </Link>
        <div className="flex items-baseline gap-6 mb-6">
          <span className="editorial-numeral text-2xl text-ink-subtle">— I</span>
          <span className="eyebrow">Mi perfil</span>
        </div>
        <h1 className="font-display text-display-2 leading-[0.98] text-balance max-w-3xl">
          <span className="font-light">Tus</span>{" "}
          <span className="italic font-normal">datos personales</span>
          <span className="font-light">.</span>
        </h1>
      </div>

      {success && (
        <div className="mb-8 p-5 bg-forest/10 border-l-2 border-forest">
          <p className="text-sm text-ink">Perfil actualizado correctamente.</p>
        </div>
      )}
      {error && (
        <div className="mb-8 p-5 bg-sangria/10 border-l-2 border-sangria">
          <p className="eyebrow text-sangria mb-1">— Error</p>
          <p className="text-sm text-ink">{error}</p>
        </div>
      )}

      {!patient ? (
        <div className="p-12 border border-rule bg-paper-bright text-center">
          <p className="font-display text-3xl italic text-ink-muted mb-4">
            No encontramos tu ficha.
          </p>
          <p className="text-sm text-ink-muted max-w-sm mx-auto">
            Para actualizar tus datos, contacta a nuestro equipo de soporte.
          </p>
        </div>
      ) : (
        <form action={updateProfile} className="max-w-xl space-y-7">
          <div>
            <label htmlFor="phone" className="input-label">Teléfono / WhatsApp</label>
            <input
              id="phone" name="phone" type="tel"
              className="input-editorial"
              placeholder="+56 9 XXXX XXXX"
              defaultValue={patient.phone || customer.phone || ""}
            />
          </div>

          <div>
            <label htmlFor="address" className="input-label">Dirección</label>
            <input
              id="address" name="address"
              className="input-editorial"
              placeholder="Av. Providencia 1234, Dpto 502"
              defaultValue={patient.address || ""}
            />
          </div>

          <div>
            <label htmlFor="city" className="input-label">Ciudad / Comuna</label>
            <input
              id="city" name="city"
              className="input-editorial"
              placeholder="Santiago, Providencia"
              defaultValue={patient.city || ""}
            />
          </div>

          <div className="hairline" />

          <p className="text-sm font-medium text-ink-muted">
            Contacto de emergencia (opcional)
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-7">
            <div>
              <label htmlFor="emergency_contact_name" className="input-label">Nombre</label>
              <input
                id="emergency_contact_name" name="emergency_contact_name"
                className="input-editorial"
                placeholder="Nombre completo"
                defaultValue={patient.emergency_contact_name || ""}
              />
            </div>
            <div>
              <label htmlFor="emergency_contact_phone" className="input-label">Teléfono</label>
              <input
                id="emergency_contact_phone" name="emergency_contact_phone" type="tel"
                className="input-editorial"
                placeholder="+56 9 XXXX XXXX"
                defaultValue={patient.emergency_contact_phone || ""}
              />
            </div>
          </div>

          <div className="hairline" />

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button type="submit" className="btn-brass">
              Guardar cambios
            </button>
            <Link href="/mi-cuenta" className="btn-link justify-center">
              Cancelar
            </Link>
          </div>
        </form>
      )}

      {/* Documentos requeridos */}
      {docs && (
        <section className="mt-16 max-w-xl">
          <div className="flex items-baseline gap-6 mb-6">
            <span className="editorial-numeral text-2xl text-ink-subtle">— II</span>
            <span className="eyebrow">Documentos requeridos</span>
          </div>
          <p className="font-display text-display-2 leading-[0.98] text-balance max-w-3xl mb-8">
            <span className="font-light">{uploadedCount}/5</span>{" "}
            <span className="italic font-normal">documentos subidos</span>
            <span className="font-light">.</span>
          </p>

          {docMeta && (
            <div className="mb-5">
              <span className={`pill ${docMeta.cls}`}>{docMeta.label}</span>
              {docs.prescription_reviewer_notes && (
                <p className="text-sm text-ink-muted mt-2 whitespace-pre-wrap">
                  {docs.prescription_reviewer_notes}
                </p>
              )}
            </div>
          )}

          <div className="space-y-3">
            {DOC_LABELS.map((d) => {
              const uploaded = Boolean(docs[d.key]);
              return (
                <div key={d.key} className="flex items-center justify-between py-3 border-b border-rule-soft">
                  <span className="text-sm text-ink">{d.label}</span>
                  <span className={`text-xs font-mono ${uploaded ? "text-forest" : "text-ink-subtle"}`}>
                    {uploaded ? "Subido" : "Falta"}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="text-xs text-ink-muted mt-6 leading-relaxed">
            Si falta algún documento, súbelo desde{" "}
            <Link href="/mi-cuenta/recetas" className="underline underline-offset-4 hover:text-ink">
              Mis recetas
            </Link>
            . La documentación completa es necesaria para acceder al catálogo.
          </p>
        </section>
      )}
    </section>
  );
}
