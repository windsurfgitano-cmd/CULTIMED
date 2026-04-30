import { redirect } from "next/navigation";
import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { run } from "@/lib/db";
import { isValidRut, formatRut, cleanRut } from "@/lib/rut";
import { logAudit } from "@/lib/audit";
import PageHeader from "@/components/PageHeader";

async function createPatient(formData: FormData) {
  "use server";
  const staff = requireStaff();

  const rutRaw = String(formData.get("rut") || "").trim();
  const fullName = String(formData.get("full_name") || "").trim();
  const dob = String(formData.get("date_of_birth") || "") || null;
  const gender = String(formData.get("gender") || "") || null;
  const email = String(formData.get("email") || "").trim().toLowerCase() || null;
  const phone = String(formData.get("phone") || "").trim() || null;
  const address = String(formData.get("address") || "").trim() || null;
  const city = String(formData.get("city") || "").trim() || null;
  const ecName = String(formData.get("emergency_contact_name") || "").trim() || null;
  const ecPhone = String(formData.get("emergency_contact_phone") || "").trim() || null;
  const allergies = String(formData.get("allergies") || "").trim() || null;
  const conditions = String(formData.get("chronic_conditions") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const membershipStatus = String(formData.get("membership_status") || "active");

  if (!fullName) redirect("/patients/new?e=name");
  if (!rutRaw) redirect("/patients/new?e=rut_missing");
  if (!isValidRut(rutRaw)) redirect("/patients/new?e=rut_invalid");
  const rut = formatRut(cleanRut(rutRaw));

  try {
    const r = run(
      `INSERT INTO patients (rut, full_name, date_of_birth, gender, email, phone, address, city,
        emergency_contact_name, emergency_contact_phone, allergies, chronic_conditions, notes,
        membership_status, membership_started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      rut, fullName, dob, gender, email, phone, address, city,
      ecName, ecPhone, allergies, conditions, notes,
      membershipStatus, membershipStatus === "active" ? new Date().toISOString() : null
    );
    logAudit({
      staffId: staff.id,
      action: "patient_created",
      entityType: "patient",
      entityId: Number(r.lastInsertRowid),
      details: { rut, fullName },
    });
    redirect(`/patients/${r.lastInsertRowid}`);
  } catch (err: any) {
    if (String(err).includes("UNIQUE")) {
      redirect("/patients/new?e=duplicate");
    }
    throw err;
  }
}

const ERR_MSG: Record<string, string> = {
  name: "Nombre completo es requerido.",
  rut_missing: "RUT es requerido.",
  rut_invalid: "RUT inválido. Verifica el dígito verificador.",
  duplicate: "Ya existe un paciente con ese RUT.",
};

export default function NewPatientPage({ searchParams }: { searchParams: { e?: string } }) {
  requireStaff();
  const error = searchParams.e ? ERR_MSG[searchParams.e] : null;

  return (
    <>
      <PageHeader
        title="Registrar nuevo paciente"
        subtitle="Completa los datos del socio. Los campos marcados con * son obligatorios."
        actions={
          <Link href="/patients" className="btn-secondary">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Volver
          </Link>
        }
      />

      {error && (
        <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg flex gap-2 items-start">
          <span className="material-symbols-outlined ms-fill text-error mt-0.5">error</span>
          <p className="text-sm text-on-error-container">{error}</p>
        </div>
      )}

      <form action={createPatient} className="space-y-6">
        <Section title="Identificación" icon="badge">
          <Field label="RUT *" name="rut" placeholder="12.345.678-9" required pattern="[0-9.\-kK]+" />
          <Field label="Nombre completo *" name="full_name" required colSpan={2} />
          <Field label="Fecha de nacimiento" name="date_of_birth" type="date" />
          <SelectField label="Género" name="gender" options={[
            { v: "", l: "—" }, { v: "F", l: "Femenino" }, { v: "M", l: "Masculino" }, { v: "X", l: "Otro / Prefiere no decir" },
          ]} />
        </Section>

        <Section title="Contacto" icon="contact_mail">
          <Field label="Email" name="email" type="email" />
          <Field label="Teléfono" name="phone" type="tel" placeholder="+56 9 XXXX XXXX" />
          <Field label="Dirección" name="address" colSpan={2} />
          <Field label="Ciudad / Comuna" name="city" />
        </Section>

        <Section title="Contacto de emergencia" icon="emergency">
          <Field label="Nombre" name="emergency_contact_name" />
          <Field label="Teléfono" name="emergency_contact_phone" type="tel" />
        </Section>

        <Section title="Información clínica" icon="medical_information">
          <Field label="Alergias" name="allergies" placeholder="Ej: Penicilina, AAS" colSpan={2} />
          <Field label="Condiciones crónicas" name="chronic_conditions" placeholder="Ej: Hipertensión, Diabetes" colSpan={2} />
          <Field label="Notas adicionales" name="notes" colSpan={2} />
        </Section>

        <Section title="Estado de membresía" icon="verified_user">
          <SelectField label="Estado" name="membership_status" defaultValue="active" options={[
            { v: "active", l: "Activo" },
            { v: "pending", l: "Pendiente verificación" },
            { v: "suspended", l: "Suspendido" },
          ]} />
        </Section>

        <div className="flex justify-end gap-3 pt-2">
          <Link href="/patients" className="btn-secondary">Cancelar</Link>
          <button type="submit" className="btn-primary">
            <span className="material-symbols-outlined text-base">save</span>
            Crear paciente
          </button>
        </div>
      </form>
    </>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="clinical-card p-6">
      <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-5 pb-3 border-b border-outline-variant/40">
        <span className="material-symbols-outlined text-primary text-[20px]">{icon}</span>
        {title}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">{children}</div>
    </div>
  );
}

function Field({
  label, name, type = "text", required = false, placeholder, pattern, colSpan,
}: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string; pattern?: string; colSpan?: number;
}) {
  return (
    <div className={colSpan === 2 ? "md:col-span-2" : ""}>
      <label className="input-label" htmlFor={name}>{label}</label>
      <input id={name} name={name} type={type} required={required} placeholder={placeholder} pattern={pattern} className="input-field" />
    </div>
  );
}

function SelectField({
  label, name, defaultValue, options,
}: {
  label: string; name: string; defaultValue?: string; options: Array<{ v: string; l: string }>;
}) {
  return (
    <div>
      <label className="input-label" htmlFor={name}>{label}</label>
      <select id={name} name={name} defaultValue={defaultValue} className="input-field">
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}
