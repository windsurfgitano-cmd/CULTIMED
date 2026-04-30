// Health check endpoint para Railway / UptimeRobot.
// Verifica que la BD responde y devuelve 200 OK.
import { NextResponse } from "next/server";
import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = get<{ ok: number }>(`SELECT 1 AS ok`);
    if (!r || r.ok !== 1) {
      return NextResponse.json({ status: "degraded", db: false }, { status: 503 });
    }
    return NextResponse.json({
      status: "ok",
      service: "cultimed-store",
      db: true,
      mp: !!process.env.MP_ACCESS_TOKEN,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ status: "down", error: e?.message }, { status: 503 });
  }
}
