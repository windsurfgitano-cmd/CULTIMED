import Link from "next/link";
import { requirePrescriptionsRole } from "@/lib/auth";
import { all } from "@/lib/db";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

interface DoctorRow {
  id: number;
  full_name: string;
  rut: string | null;
  professional_license: string | null;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  is_active: number;
  rx_count: number;
}

const PLACEHOLDER = "(Actualizar nombre doctor)";

export default async function DoctorsPage({
  searchParams,
}: {
  searchParams: { ok?: string };
}) {
  await requirePrescriptionsRole();

  const doctors = await all<DoctorRow>(`
    SELECT d.*, (SELECT COUNT(*) FROM prescriptions r WHERE r.doctor_id = d.id) as rx_count
    FROM doctors d
    ORDER BY (d.full_name = '${PLACEHOLDER}') DESC, d.full_name ASC
  `);

  const pendingCount = doctors.filter((d) => d.full_name === PLACEHOLDER).length;

  return (
    <>
      <PageHeader
        title="Doctores"
        subtitle="Médicos registrados en el sistema, asociados a recetas clínicas internas."
      />

      {searchParams.ok === "updated" && (
        <div className="mb-6 p-4 bg-success-container/40 border-l-4 border-success rounded-r-lg flex gap-2 items-start">
          <span className="material-symbols-outlined ms-fill text-success mt-0.5">check_circle</span>
          <p className="text-sm text-on-surface">Datos del doctor actualizados.</p>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="mb-6 p-4 bg-warning-container/40 border-l-4 border-warning rounded-r-lg flex gap-2 items-start">
          <span className="material-symbols-outlined ms-fill text-warning mt-0.5">warning</span>
          <p className="text-sm text-on-surface">
            <strong>{pendingCount} {pendingCount === 1 ? "doctor tiene" : "doctores tienen"}</strong> nombre
            pendiente de actualizar — quedaron con datos de prueba de la carga inicial. Las recetas
            asociadas son reales, pero falta identificar al médico verdadero. Edítalos a mano cuando
            tengas el dato.
          </p>
        </div>
      )}

      {doctors.length === 0 ? (
        <EmptyState icon="stethoscope" title="Sin doctores" message="Aún no hay médicos registrados." />
      ) : (
        <div className="clinical-card overflow-x-auto">
          <table className="table-clinical">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Especialidad</th>
                <th>N° colegiatura</th>
                <th>Contacto</th>
                <th className="text-right">Recetas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {doctors.map((d) => {
                const pending = d.full_name === PLACEHOLDER;
                return (
                  <tr key={d.id}>
                    <td>
                      <span className={pending ? "italic text-warning font-medium" : "font-medium text-on-surface"}>
                        {d.full_name}
                      </span>
                      {pending && (
                        <div className="text-[11px] text-on-surface-variant mt-0.5">
                          {d.rx_count} {Number(d.rx_count) === 1 ? "receta espera" : "recetas esperan"} identificación
                        </div>
                      )}
                    </td>
                    <td className="text-sm text-on-surface-variant">{d.specialty || "—"}</td>
                    <td className="font-mono text-[12px] text-on-surface-variant">{d.professional_license || "—"}</td>
                    <td className="text-xs text-on-surface-variant">
                      <div>{d.email || "—"}</div>
                      <div>{d.phone || ""}</div>
                    </td>
                    <td className="text-right font-mono tabular-nums">{d.rx_count}</td>
                    <td className="text-right">
                      <Link href={`/doctors/${d.id}/edit`} className={pending ? "btn-primary" : "btn-secondary"}>
                        <span className="material-symbols-outlined text-base">edit</span>
                        {pending ? "Actualizar nombre" : "Editar"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
