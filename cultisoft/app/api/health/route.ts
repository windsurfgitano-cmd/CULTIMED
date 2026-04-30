// Health check endpoint para Railway / UptimeRobot.
import { NextResponse } from "next/server";
import { get } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await get<{ ok: number }>(`SELECT 1 AS ok`);
    if (!r || r.ok !== 1) {
      return NextResponse.json({ status: "degraded", db: false }, { status: 503 });
    }
    return NextResponse.json({
      status: "ok",
      service: "cultisoft",
      db: true,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ status: "down", error: e?.message }, { status: 503 });
  }
}
