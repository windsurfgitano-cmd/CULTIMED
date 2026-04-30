import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { formatCLP, formatTime, relativeTime, formatDate } from "@/lib/format";
import { isDemoMode } from "@/lib/seed-mode";
import KpiCard from "@/components/KpiCard";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface Counts {
  patients: number;
  patientsActive: number;
  newPatientsThisMonth: number;
  todayDispensations: number;
  todayRevenue: number;
  pendingRx: number;
  totalLowStock: number;
  totalExpiringSoon: number;
}

interface RecentDispensation {
  id: number;
  folio: string;
  dispensed_at: string;
  patient_name: string;
  patient_rut: string;
  product_summary: string;
  total_amount: number;
  dispenser_name: string;
}

interface LowStockBatch {
  batch_id: number;
  product_name: string;
  batch_number: string;
  quantity_current: number;
  expiry_date: string | null;
}

export default function DashboardPage({
  searchParams,
}: {
  searchParams: { denied?: string };
}) {
  const staff = requireStaff();

  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  const counts = {
    patients: get<{ c: number }>(`SELECT COUNT(*) as c FROM patients`)?.c ?? 0,
    patientsActive: get<{ c: number }>(`SELECT COUNT(*) as c FROM patients WHERE membership_status = 'active'`)?.c ?? 0,
    newPatientsThisMonth: get<{ c: number }>(`SELECT COUNT(*) as c FROM patients WHERE created_at >= ?`, monthStart)?.c ?? 0,
    todayDispensations: get<{ c: number }>(`SELECT COUNT(*) as c FROM dispensations WHERE dispensed_at >= ?`, todayStart)?.c ?? 0,
    todayRevenue: get<{ s: number }>(`SELECT COALESCE(SUM(total_amount), 0) as s FROM dispensations WHERE dispensed_at >= ? AND status = 'completed'`, todayStart)?.s ?? 0,
    pendingRx: get<{ c: number }>(`SELECT COUNT(*) as c FROM prescriptions WHERE status = 'pending'`)?.c ?? 0,
    totalLowStock: get<{ c: number }>(`SELECT COUNT(*) as c FROM batches WHERE status = 'available' AND quantity_current > 0 AND quantity_current <= 5`)?.c ?? 0,
    totalExpiringSoon: get<{ c: number }>(`SELECT COUNT(*) as c FROM batches WHERE status = 'available' AND expiry_date IS NOT NULL AND date(expiry_date) <= date('now', '+60 days')`)?.c ?? 0,
  } as Counts;

  const recent = all<RecentDispensation>(`
    SELECT d.id, d.folio, d.dispensed_at, d.total_amount,
      p.full_name as patient_name, p.rut as patient_rut,
      s.full_name as dispenser_name,
      (SELECT GROUP_CONCAT(pr.name || ' ×' || di.quantity, ', ')
        FROM dispensation_items di JOIN products pr ON pr.id = di.product_id
        WHERE di.dispensation_id = d.id) as product_summary
    FROM dispensations d
    JOIN patients p ON p.id = d.patient_id
    JOIN staff s ON s.id = d.dispenser_id
    ORDER BY d.dispensed_at DESC
    LIMIT 8
  `);

  const lowStock = all<LowStockBatch>(`
    SELECT b.id as batch_id, b.batch_number, b.quantity_current, b.expiry_date,
      pr.name as product_name
    FROM batches b
    JOIN products pr ON pr.id = b.product_id
    WHERE b.status = 'available' AND b.quantity_current <= 10
    ORDER BY b.quantity_current ASC
    LIMIT 5
  `);

  const dateLabel = today.toLocaleDateString("es-CL", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  const firstName = staff.full_name.split(" ")[0];
  const demo = isDemoMode();

  return (
    <>
      {demo && (
        <div className="mb-7 p-4 lg:p-5 bg-warning-container/40 border-l-2 border-brass animate-fade-in">
          <p className="eyebrow text-brass-dim mb-1">— Modo demostración</p>
          <p className="text-sm text-ink-muted leading-relaxed">
            Pacientes y catálogo son <span className="text-ink">datos reales</span> exportados de Shopify, pero las recetas, dispensaciones e historiales son <span className="italic">sintéticos para demo</span> (los $ y conteos no representan ventas reales).
            Para empezar a operar limpio corre <code className="font-mono text-[12px] bg-paper-bright px-1.5 py-0.5">npm run db:reset:clean</code>.
          </p>
        </div>
      )}

      {searchParams.denied && (
        <div className="mb-7 p-4 bg-sangria/10 border-l-2 border-sangria">
          <p className="eyebrow text-sangria mb-1">— Sin permiso</p>
          <p className="text-sm text-ink">No tienes permisos para acceder a esa sección.</p>
        </div>
      )}

      <PageHeader
        numeral="00"
        eyebrow={`Dashboard · ${dateLabel}`}
        title={`Hola, ${firstName}`}
        subtitle="Resumen operacional del dispensario en tiempo real."
        actions={
          <Link href="/dispensations/new" className="btn-primary">
            <span aria-hidden>+</span> Nueva dispensación
          </Link>
        }
      />

      {/* ─── Alerts ─── */}
      {(counts.totalLowStock > 0 || counts.pendingRx > 0 || counts.totalExpiringSoon > 0) && (
        <section className="mb-10 grid gap-3 md:grid-cols-3">
          {counts.totalLowStock > 0 && (
            <Link href="/inventory?filter=low" className="group p-5 bg-error-container/40 border-l-2 border-sangria flex items-baseline gap-3 hover:bg-error-container/60 transition-colors">
              <span className="editorial-numeral text-base text-sangria/60">— I</span>
              <div className="flex-1 min-w-0">
                <p className="eyebrow text-sangria">Stock bajo</p>
                <p className="font-display text-xl mt-1 leading-tight">
                  <span className="font-light">{counts.totalLowStock}</span>{" "}
                  <span className="italic text-base text-ink-muted">
                    {counts.totalLowStock === 1 ? "lote crítico" : "lotes críticos"}
                  </span>
                </p>
              </div>
              <span className="text-ink-muted group-hover:translate-x-1 transition-transform" aria-hidden>→</span>
            </Link>
          )}
          {counts.pendingRx > 0 && (
            <Link href="/prescriptions?status=pending" className="group p-5 bg-warning-container/40 border-l-2 border-brass flex items-baseline gap-3 hover:bg-warning-container/60 transition-colors">
              <span className="editorial-numeral text-base text-brass-dim/60">— II</span>
              <div className="flex-1 min-w-0">
                <p className="eyebrow text-brass-dim">Recetas pendientes</p>
                <p className="font-display text-xl mt-1 leading-tight">
                  <span className="font-light">{counts.pendingRx}</span>{" "}
                  <span className="italic text-base text-ink-muted">
                    {counts.pendingRx === 1 ? "esperando QF" : "esperando QF"}
                  </span>
                </p>
              </div>
              <span className="text-ink-muted group-hover:translate-x-1 transition-transform" aria-hidden>→</span>
            </Link>
          )}
          {counts.totalExpiringSoon > 0 && (
            <Link href="/inventory?filter=expiring" className="group p-5 bg-warning-container/40 border-l-2 border-brass flex items-baseline gap-3 hover:bg-warning-container/60 transition-colors">
              <span className="editorial-numeral text-base text-brass-dim/60">— III</span>
              <div className="flex-1 min-w-0">
                <p className="eyebrow text-brass-dim">Por vencer</p>
                <p className="font-display text-xl mt-1 leading-tight">
                  <span className="font-light">{counts.totalExpiringSoon}</span>{" "}
                  <span className="italic text-base text-ink-muted">en menos de 60 días</span>
                </p>
              </div>
              <span className="text-ink-muted group-hover:translate-x-1 transition-transform" aria-hidden>→</span>
            </Link>
          )}
        </section>
      )}

      {/* ─── KPIs ─── */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5 mb-12">
        <KpiCard
          numeral="01"
          label="Pacientes activos"
          value={counts.patientsActive.toLocaleString("es-CL")}
          delta={counts.newPatientsThisMonth > 0 ? { text: `+${counts.newPatientsThisMonth} este mes`, tone: "success" } : undefined}
        />
        <KpiCard
          numeral="02"
          label="Dispensaciones hoy"
          value={counts.todayDispensations}
          delta={counts.todayRevenue > 0 ? { text: formatCLP(counts.todayRevenue), tone: "success" } : undefined}
        />
        <KpiCard
          numeral="03"
          label="Stock bajo"
          value={counts.totalLowStock}
          delta={counts.totalLowStock > 0 ? { text: "Crítico", tone: "error" } : { text: "OK", tone: "success" }}
          tone={counts.totalLowStock > 0 ? "warning" : "neutral"}
        />
        <KpiCard
          numeral="04"
          label="Recetas pendientes"
          value={counts.pendingRx}
          delta={counts.pendingRx > 0 ? { text: "Acción", tone: "warning" } : { text: "Al día", tone: "success" }}
        />
      </section>

      {/* ─── Body grid ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-12">
        {/* Recent dispensations */}
        <section className="lg:col-span-2">
          <div className="flex items-baseline justify-between mb-5">
            <div className="flex items-baseline gap-4">
              <span className="editorial-numeral text-base text-ink-subtle">— I</span>
              <span className="eyebrow">Dispensaciones recientes</span>
            </div>
            <Link href="/dispensations" className="text-xs uppercase tracking-widest font-mono text-ink-muted hover:text-ink border-b border-transparent hover:border-ink/40 pb-0.5">
              Ver todas →
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="border-y border-rule py-16 text-center">
              <p className="font-display text-2xl italic text-ink-muted">Sin dispensaciones aún.</p>
            </div>
          ) : (
            <div className="border-y border-rule overflow-x-auto">
              <table className="table-clinical">
                <thead>
                  <tr>
                    <th>Hora</th>
                    <th>Paciente</th>
                    <th>Producto</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Operador</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td className="font-mono text-[12px] text-ink-muted whitespace-nowrap nums-lining">
                        <div>{formatTime(r.dispensed_at)}</div>
                        <div className="text-[10px] text-ink-subtle">{relativeTime(r.dispensed_at)}</div>
                      </td>
                      <td>
                        <Link href={`/dispensations/${r.id}`} className="font-display text-base hover:italic transition-all">
                          {r.patient_name}
                        </Link>
                        <div className="text-[11px] text-ink-muted font-mono nums-lining">{r.patient_rut}</div>
                      </td>
                      <td className="text-sm max-w-md">{r.product_summary || "—"}</td>
                      <td className="text-right font-mono tabular-nums nums-lining whitespace-nowrap">
                        {formatCLP(r.total_amount)}
                      </td>
                      <td className="text-right text-xs text-ink-muted italic whitespace-nowrap">{r.dispenser_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Quick actions + low stock */}
        <aside className="space-y-10">
          <div>
            <div className="flex items-baseline gap-4 mb-5">
              <span className="editorial-numeral text-base text-ink-subtle">— II</span>
              <span className="eyebrow">Acciones rápidas</span>
            </div>
            <div className="space-y-2">
              {[
                { href: "/dispensations/new", label: "Nueva dispensación", num: "01" },
                { href: "/patients/new",      label: "Registrar paciente", num: "02" },
                { href: "/prescriptions/new", label: "Cargar receta",      num: "03" },
              ].map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="group flex items-baseline justify-between gap-4 py-3 border-b border-rule-soft hover:border-ink transition-colors"
                >
                  <span className="flex items-baseline gap-4">
                    <span className="editorial-numeral text-xs text-ink-subtle group-hover:text-brass">{a.num}</span>
                    <span className="font-display text-lg group-hover:italic transition-all">{a.label}</span>
                  </span>
                  <span className="text-ink-muted group-hover:text-ink group-hover:translate-x-1 transition-all" aria-hidden>→</span>
                </Link>
              ))}
            </div>
          </div>

          {lowStock.length > 0 && (
            <div>
              <div className="flex items-baseline gap-4 mb-5">
                <span className="editorial-numeral text-base text-ink-subtle">— III</span>
                <span className="eyebrow">Lotes con menor stock</span>
              </div>
              <ul className="border-y border-rule-soft divide-y divide-rule-soft">
                {lowStock.map((b) => (
                  <li key={b.batch_id}>
                    <Link
                      href={`/inventory/${b.batch_id}`}
                      className="group flex items-baseline justify-between gap-3 py-3 hover:bg-paper-bright -mx-2 px-2 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-base truncate group-hover:italic transition-all">{b.product_name}</p>
                        <p className="text-[10px] uppercase tracking-widest text-ink-muted font-mono nums-lining mt-0.5">
                          Lote {b.batch_number}
                          {b.expiry_date && <> · vence {formatDate(b.expiry_date)}</>}
                        </p>
                      </div>
                      <span className={
                        b.quantity_current <= 2 ? "pill pill-error" :
                        b.quantity_current <= 5 ? "pill pill-warning" :
                        "pill pill-neutral"
                      }>{b.quantity_current} u.</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Decorative editorial card */}
          <div className="relative border border-forest bg-forest text-paper p-6 overflow-hidden">
            <div
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                mixBlendMode: "multiply",
              }}
              aria-hidden
            />
            <p className="relative eyebrow text-paper/60">— Manual de uso</p>
            <p className="relative font-display text-2xl mt-2 leading-tight text-balance">
              <span className="font-light">¿Primera vez</span>{" "}
              <span className="italic">aquí?</span>
            </p>
            <p className="relative text-xs text-paper/70 mt-2 leading-relaxed">
              Conoce el flujo completo del dispensario en 8 pasos.
            </p>
            <Link
              href="/manual"
              className="relative inline-flex items-center gap-2 mt-4 text-xs uppercase tracking-widest font-mono text-brass-bright hover:text-paper border-b border-brass-bright/40 hover:border-paper pb-0.5 transition-all"
            >
              Abrir manual →
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
