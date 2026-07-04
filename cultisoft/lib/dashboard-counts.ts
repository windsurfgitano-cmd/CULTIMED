import { get } from "./db";

export interface DashboardCounts {
  patientsActive: number;
  newPatientsThisMonth: number;
  todayWebOrders: number;
  todayWebRevenue: number;
  pendingWebOrders: number;
  abandonedWebOrders: number;
  pendingRx: number;
  totalLowStock: number;
  totalExpiringSoon: number;
  pendingWebRx: number;
}

/**
 * Contadores en vivo del dashboard. Extraído a un módulo compartido para que
 * tanto el render inicial (Server Component) como el polling periódico
 * (/api/dashboard/counts) usen exactamente la misma lógica — evita que se
 * desincronicen dos copias del mismo cálculo.
 */
export async function getDashboardCounts(): Promise<DashboardCounts> {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  // Postgres devuelve COUNT(*)/SUM(...) como bigint, que postgres-js
  // serializa como string para no perder precisión — hay que forzar Number()
  // explícitamente, si no el conteo llega como "94" en vez de 94 y rompe el
  // tween numérico de GSAP en LiveStatsGrid.
  const n = (v: unknown, fallback = 0): number => {
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    patientsActive: n((await get<{ c: number }>(`SELECT COUNT(*) as c FROM patients WHERE membership_status = 'active'`))?.c),
    newPatientsThisMonth: n((await get<{ c: number }>(`SELECT COUNT(*) as c FROM patients WHERE created_at >= ?`, monthStart))?.c),
    todayWebOrders: n((await get<{ c: number }>(`SELECT COUNT(*) as c FROM customer_orders WHERE created_at >= ? AND status NOT IN ('cancelled','rejected')`, todayStart))?.c),
    todayWebRevenue: n((await get<{ s: number }>(`SELECT COALESCE(SUM(total), 0) as s FROM customer_orders WHERE created_at >= ? AND status NOT IN ('cancelled','rejected')`, todayStart))?.s),
    pendingWebOrders: n((await get<{ c: number }>(`SELECT COUNT(*) as c FROM customer_orders WHERE status IN ('proof_uploaded','preparing') OR (status = 'pending_payment' AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')`))?.c),
    abandonedWebOrders: n((await get<{ c: number }>(`SELECT COUNT(*) as c FROM customer_orders WHERE status = 'pending_payment' AND created_at < CURRENT_TIMESTAMP - INTERVAL '7 days'`))?.c),
    pendingRx: n((await get<{ c: number }>(`SELECT COUNT(*) as c FROM prescriptions WHERE status = 'pending'`))?.c),
    totalLowStock: n((await get<{ c: number }>(`SELECT COUNT(*) as c FROM batches WHERE status = 'available' AND quantity_current > 0 AND quantity_current <= 5`))?.c),
    totalExpiringSoon: n((await get<{ c: number }>(`SELECT COUNT(*) as c FROM batches WHERE status = 'available' AND expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + INTERVAL '60 days'`))?.c),
    pendingWebRx: n((await get<{ c: number }>(`SELECT COUNT(*) as c FROM customer_accounts WHERE prescription_status = 'pending'`))?.c),
  };
}
