import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { calcAge, formatDate, formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import SearchInput from "@/components/SearchInput";

export const dynamic = "force-dynamic";

interface Row {
  id: number;
  rut: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  membership_status: string;
  membership_started_at: string | null;
  total_dispensations: number;
}

const PAGE_SIZE = 50;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string; page?: string };
}) {
  await requireStaff();
  const q = (searchParams.q || "").trim();
  const status = (searchParams.status || "").trim();
  const page = Math.max(1, parseInt(searchParams.page || "1", 10) || 1);

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    where.push(`(p.full_name LIKE ? OR p.rut LIKE ? OR p.email LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (status) {
    where.push(`p.membership_status = ?`);
    params.push(status);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const total = (await get<{ c: number }>(`SELECT COUNT(*) as c FROM patients p ${whereSql}`, ...params))?.c ?? 0;

  const rows = await all<Row>(
    `SELECT p.id, p.rut, p.full_name, p.email, p.phone, p.date_of_birth,
        p.membership_status, p.membership_started_at,
        (SELECT COUNT(*) FROM dispensations d WHERE d.patient_id = p.id) as total_dispensations
     FROM patients p
     ${whereSql}
     ORDER BY p.full_name ASC
     LIMIT ? OFFSET ?`,
    ...params,
    PAGE_SIZE,
    (page - 1) * PAGE_SIZE
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Pacientes"
        subtitle={`${formatNumber(total)} registros · base activa de socios Cultimed`}
        actions={
          <>
            <a href="/api/patients/export" className="btn-secondary" download>
              <span className="material-symbols-outlined text-base">download</span>
              Exportar CSV
            </a>
            <Link href="/patients/new" className="btn-primary">
              <span className="material-symbols-outlined text-base">person_add</span>
              Nuevo paciente
            </Link>
          </>
        }
      />

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-3 items-center">
        <SearchInput placeholder="Buscar por nombre, RUT, email…" />
        <div className="flex gap-1.5 text-xs flex-wrap">
          {[
            { v: "", l: "Todos" },
            { v: "active", l: "Activos" },
            { v: "pending", l: "Pendientes" },
            { v: "suspended", l: "Suspendidos" },
          ].map((f) => {
            const href = `?${new URLSearchParams({ ...(q ? { q } : {}), ...(f.v ? { status: f.v } : {}) }).toString()}`;
            const active = status === f.v;
            return (
              <Link
                key={f.v}
                href={href}
                className={
                  active
                    ? "px-3 py-1.5 rounded-full bg-primary text-on-primary font-semibold"
                    : "px-3 py-1.5 rounded-full bg-surface-container-low hover:bg-surface-container text-on-surface-variant font-medium"
                }
              >
                {f.l}
              </Link>
            );
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="group_off"
          title="No se encontraron pacientes"
          message={q ? `No hay coincidencias para “${q}”.` : "Aún no hay pacientes registrados."}
          action={
            <Link href="/patients/new" className="btn-primary">
              <span className="material-symbols-outlined text-base">person_add</span>
              Crear paciente
            </Link>
          }
        />
      ) : (
        <div className="clinical-card overflow-hidden">
          <table className="table-clinical">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>RUT</th>
                <th>Edad</th>
                <th>Contacto</th>
                <th>Estado</th>
                <th className="text-right">Dispensaciones</th>
                <th className="text-right">Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/patients/${r.id}`} className="font-semibold text-on-surface hover:text-primary">
                      {r.full_name}
                    </Link>
                  </td>
                  <td className="font-mono text-[12px] text-on-surface-variant">{r.rut}</td>
                  <td className="text-on-surface-variant">
                    {calcAge(r.date_of_birth) !== null ? `${calcAge(r.date_of_birth)} años` : "—"}
                  </td>
                  <td>
                    {r.email && <div className="text-[12px]">{r.email}</div>}
                    {r.phone && <div className="text-[11px] text-on-surface-variant font-mono">{r.phone}</div>}
                    {!r.email && !r.phone && <span className="text-on-surface-variant">—</span>}
                  </td>
                  <td>
                    <StatusBadge status={r.membership_status} />
                  </td>
                  <td className="text-right tabular-nums">{r.total_dispensations}</td>
                  <td className="text-right text-on-surface-variant text-xs whitespace-nowrap">
                    {formatDate(r.membership_started_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex justify-center gap-1">
          {Array.from({ length: totalPages }).map((_, i) => {
            const p = i + 1;
            const sp = new URLSearchParams({
              ...(q ? { q } : {}),
              ...(status ? { status } : {}),
              page: String(p),
            });
            return (
              <Link
                key={p}
                href={`?${sp.toString()}`}
                className={
                  p === page
                    ? "px-3 py-1.5 rounded-lg bg-primary text-on-primary font-bold text-sm tabular-nums"
                    : "px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container font-medium text-sm tabular-nums"
                }
              >
                {p}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
