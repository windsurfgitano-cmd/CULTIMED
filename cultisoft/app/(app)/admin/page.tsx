// Super Admin: gestión de staff (admins, QFs, dispensers) + auditoría rápida.
// Solo accesible para role=admin.
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff, isSuperadmin } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

interface StaffRow {
  id: number;
  email: string;
  full_name: string;
  role: string;
  professional_license: string | null;
  is_active: number;
  last_login_at: string | null;
  created_at: string;
}

interface AuditRow {
  id: number;
  staff_id: number | null;
  staff_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  created_at: string;
}

interface InviteRow {
  id: number;
  email: string;
  full_name: string | null;
  prescription_status: string;
  is_ambassador: number;
  ambassador_invited_at: string | null;
  inviter_email: string | null;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  doctor: "Médico",
  pharmacist: "Químico Farmacéutico",
  dispenser: "Dispensador",
};
const ROLE_COLOR: Record<string, string> = {
  admin: "text-sangria",
  doctor: "text-forest",
  pharmacist: "text-brass",
  dispenser: "text-ink-muted",
};

export default async function SuperAdminPage() {
  const me = await requireStaff();
  // Solo super-admin (rincondeoz) puede gestionar staff y ver bitácora del sistema
  if (!isSuperadmin(me)) redirect("/dashboard");

  const staff = await all<StaffRow>(
    `SELECT id, email, full_name, role, professional_license, is_active,
       last_login_at, created_at
     FROM staff
     ORDER BY is_active DESC, role, created_at DESC`
  );

  const audits = await all<AuditRow>(
    `SELECT a.id, a.staff_id, s.email as staff_email, a.action, a.entity_type,
       a.entity_id, a.created_at
     FROM audit_logs a
     LEFT JOIN staff s ON s.id = a.staff_id
     ORDER BY a.created_at DESC
     LIMIT 20`
  );

  const invites = await all<InviteRow>(
    `SELECT ca.id, ca.email, ca.full_name, ca.prescription_status, ca.is_ambassador,
       ca.ambassador_invited_at, s.email as inviter_email
     FROM customer_accounts ca
     LEFT JOIN staff s ON s.id = ca.ambassador_invited_by
     WHERE ca.is_ambassador = 1
     ORDER BY ca.ambassador_invited_at DESC NULLS LAST
     LIMIT 10`
  );

  const counts = (await get<{
    total_customers: number;
    total_ambassadors: number;
    total_staff: number;
  }>(
    `SELECT
       (SELECT COUNT(*) FROM customer_accounts) as total_customers,
       (SELECT COUNT(*) FROM customer_accounts WHERE is_ambassador = 1) as total_ambassadors,
       (SELECT COUNT(*) FROM staff WHERE is_active = 1) as total_staff`
  )) || { total_customers: 0, total_ambassadors: 0, total_staff: 0 };

  return (
    <>
      <PageHeader
        numeral="10"
        eyebrow="Sistema · Super Admin"
        title="Administración del sistema"
        subtitle={`${formatNumber(counts.total_staff)} staff activo · ${formatNumber(counts.total_customers)} pacientes registrados · ${formatNumber(counts.total_ambassadors)} embajadores activos.`}
      />

      {/* Staff section */}
      <section className="mb-12">
        <div className="flex items-baseline justify-between mb-4">
          <div className="flex items-baseline gap-3">
            <span className="editorial-numeral text-base text-ink-subtle">— I</span>
            <span className="eyebrow">Staff del sistema</span>
          </div>
          <span className="text-[11px] font-mono uppercase tracking-widest text-ink-muted">
            {staff.length} {staff.length === 1 ? "usuario" : "usuarios"}
          </span>
        </div>

        {staff.length === 0 ? (
          <EmptyState title="Sin staff" message="No hay usuarios staff registrados." />
        ) : (
          <div className="border border-rule">
            <table className="w-full text-sm">
              <thead className="bg-paper-dim/50 border-b border-rule">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Email</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Nombre</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Rol</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Licencia</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Último acceso</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Estado</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-rule-soft hover:bg-paper-dim/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-[12px]">{s.email}</td>
                    <td className="px-4 py-3">{s.full_name}</td>
                    <td className={`px-4 py-3 font-mono text-[11px] uppercase tracking-widest ${ROLE_COLOR[s.role] || "text-ink"}`}>
                      {ROLE_LABEL[s.role] || s.role}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-muted">{s.professional_license || "—"}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-muted">
                      {s.last_login_at ? formatDateTime(s.last_login_at) : "Nunca"}
                    </td>
                    <td className="px-4 py-3">
                      {s.is_active ? (
                        <span className="inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest bg-forest/10 text-forest border border-forest/30">
                          Activo
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest bg-paper-dim text-ink-subtle border border-rule">
                          Inactivo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 p-4 bg-paper-dim/30 border border-rule-soft">
          <p className="text-[11px] font-mono uppercase tracking-widest text-ink-muted mb-2">— Cómo agregar/modificar staff</p>
          <p className="text-sm text-ink-muted leading-relaxed">
            Por ahora la creación de staff se hace vía script en el servidor (
            <code className="font-mono text-[12px] bg-paper-bright px-1 py-0.5">scripts/create-admin-users.js</code>) o directo en
            la base de datos. Próximamente: form web para invitar nuevos miembros del equipo.
          </p>
        </div>
      </section>

      {/* Embajadores invitados */}
      {invites.length > 0 && (
        <section className="mb-12">
          <div className="flex items-baseline justify-between mb-4">
            <div className="flex items-baseline gap-3">
              <span className="editorial-numeral text-base text-ink-subtle">— II</span>
              <span className="eyebrow">Embajadores invitados</span>
            </div>
            <Link href="/ambassadors/invite" className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass">
              + Invitar →
            </Link>
          </div>
          <div className="border border-rule">
            <table className="w-full text-sm">
              <thead className="bg-paper-dim/50 border-b border-rule">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Email</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Nombre</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Receta</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Invitado por</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((i) => (
                  <tr key={i.id} className="border-b border-rule-soft">
                    <td className="px-4 py-3 font-mono text-[12px]">{i.email}</td>
                    <td className="px-4 py-3">{i.full_name || "—"}</td>
                    <td className="px-4 py-3 font-mono text-[11px] uppercase">
                      <span className={
                        i.prescription_status === "aprobada" ? "text-forest" :
                        i.prescription_status === "pending" ? "text-brass" :
                        "text-ink-muted"
                      }>{i.prescription_status}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-ink-muted">{i.inviter_email || "—"}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-muted">
                      {i.ambassador_invited_at ? formatDateTime(i.ambassador_invited_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Audit log reciente */}
      <section className="mb-8">
        <div className="flex items-baseline gap-3 mb-4">
          <span className="editorial-numeral text-base text-ink-subtle">— III</span>
          <span className="eyebrow">Bitácora reciente · últimos 20 eventos</span>
        </div>
        {audits.length === 0 ? (
          <EmptyState title="Sin actividad" message="No hay eventos registrados aún." />
        ) : (
          <div className="border border-rule">
            <table className="w-full text-sm">
              <thead className="bg-paper-dim/50 border-b border-rule">
                <tr>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Cuándo</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Quién</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Acción</th>
                  <th className="text-left px-4 py-3 font-mono text-[11px] uppercase tracking-widest text-ink-muted">Entidad</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id} className="border-b border-rule-soft">
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-muted">{formatDateTime(a.created_at)}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">{a.staff_email || "sistema"}</td>
                    <td className="px-4 py-3 font-mono text-[12px]">{a.action}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-ink-muted">
                      {a.entity_type ? `${a.entity_type}#${a.entity_id}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
