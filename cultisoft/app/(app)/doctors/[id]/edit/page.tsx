import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface Doctor {
  id: number;
  full_name: string;
  rut: string | null;
  professional_license: string | null;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  is_active: number;
}

async function updateDoctor(formData: FormData) {
  "use server";
  const staff = await requireRole("admin", "superadmin", "doctor", "pharmacist");
  const id = Number(formData.get("id"));
  if (!id) redirect("/doctors");

  const fullName = String(formData.get("full_name") || "").trim();
  const rut = String(formData.get("rut") || "").trim() || null;
  const professionalLicense = String(formData.get("professional_license") || "").trim() || null;
  const specialty = String(formData.get("specialty") || "").trim() || null;
  const email = String(formData.get("email") || "").trim().toLowerCase() || null;
  const phone = String(formData.get("phone") || "").trim() || null;

  if (!fullName) redirect(`/doctors/${id}/edit?e=name`);

  const before = await get<{ full_name: string }>(`SELECT full_name FROM doctors WHERE id = ?`, id);

  await run(
    `UPDATE doctors SET full_name = ?, rut = ?, professional_license = ?, specialty = ?, email = ?, phone = ? WHERE id = ?`,
    fullName, rut, professionalLicense, specialty, email, phone, id
  );
  await logAudit({
    staffId: staff.id,
    action: "doctor_updated",
    entityType: "doctor",
    entityId: id,
    details: { before: before?.full_name, after: fullName },
  });

  redirect(`/doctors?ok=updated`);
}

const ERR_MSG: Record<string, string> = {
  name: "Nombre completo es requerido.",
};

export default async function EditDoctorPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { e?: string };
}) {
  await requireRole("admin", "superadmin", "doctor", "pharmacist");

  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const d = await get<Doctor>(`SELECT * FROM doctors WHERE id = ?`, id);
  if (!d) notFound();

  const error = searchParams.e ? ERR_MSG[searchParams.e] : null;
  const isPlaceholder = d.full_name === "(Actualizar nombre doctor)";

  return (
    <>
      <PageHeader
        title={isPlaceholder ? "Actualizar nombre de doctor" : `Editar doctor: ${d.full_name}`}
        subtitle="Corrige los datos del médico. Los cambios quedan registrados en bitácora de auditoría."
        actions={
          <Link href="/doctors" className="btn-secondary">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Volver
          </Link>
        }
      />

      {isPlaceholder && (
        <div className="mb-5 px-4 py-3 bg-warning-container/40 border-l-4 border-warning rounded-r-lg flex gap-2 items-start">
          <span className="material-symbols-outlined ms-fill text-warning mt-0.5">info</span>
          <p className="text-sm text-on-surface">
            Este médico quedó con datos de prueba de la carga inicial. Ingresa el nombre real del
            doctor tratante — el resto de los datos (RUT, N° de colegiatura, contacto) también son
            de prueba, corrígelos si los tienes a mano.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-5 px-4 py-3 bg-error-container/40 border-l-4 border-error rounded-r-lg flex gap-2 items-start">
          <span className="material-symbols-outlined ms-fill text-error mt-0.5">error</span>
          <p className="text-sm text-on-error-container">{error}</p>
        </div>
      )}

      <form action={updateDoctor} className="space-y-6">
        <input type="hidden" name="id" value={d.id} />

        <div className="clinical-card p-6">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-5 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">stethoscope</span>
            Identificación
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            <div className="md:col-span-2">
              <label className="input-label" htmlFor="full_name">Nombre completo *</label>
              <input
                id="full_name" name="full_name" required
                defaultValue={isPlaceholder ? "" : d.full_name}
                placeholder="(Actualizar nombre doctor)"
                className="input-field"
              />
            </div>
            <div>
              <label className="input-label" htmlFor="specialty">Especialidad</label>
              <input id="specialty" name="specialty" defaultValue={d.specialty || ""} className="input-field" />
            </div>
            <div>
              <label className="input-label" htmlFor="professional_license">N° colegiatura</label>
              <input id="professional_license" name="professional_license" defaultValue={d.professional_license || ""} className="input-field" />
            </div>
            <div>
              <label className="input-label" htmlFor="rut">RUT</label>
              <input id="rut" name="rut" defaultValue={d.rut || ""} className="input-field" />
            </div>
          </div>
        </div>

        <div className="clinical-card p-6">
          <h2 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-5 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">contact_mail</span>
            Contacto
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            <div>
              <label className="input-label" htmlFor="email">Email</label>
              <input id="email" name="email" type="email" defaultValue={d.email || ""} className="input-field" />
            </div>
            <div>
              <label className="input-label" htmlFor="phone">Teléfono</label>
              <input id="phone" name="phone" type="tel" defaultValue={d.phone || ""} placeholder="+56 9 XXXX XXXX" className="input-field" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Link href="/doctors" className="btn-secondary">Cancelar</Link>
          <button type="submit" className="btn-primary">
            <span className="material-symbols-outlined text-base">save</span>
            Guardar cambios
          </button>
        </div>
      </form>
    </>
  );
}
