import { NextResponse } from "next/server";
import { getCurrentStaff } from "@/lib/auth";
import { getDashboardCounts } from "@/lib/dashboard-counts";

export const dynamic = "force-dynamic";

// Polling liviano para refrescar la grilla de estadísticas del dashboard sin
// recargar la página. Cualquier staff autenticado puede leer estos contadores
// agregados (son los mismos números que ya ve en el dashboard renderizado).
export async function GET() {
  const staff = await getCurrentStaff();
  if (!staff) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const counts = await getDashboardCounts();
  return NextResponse.json(counts);
}
