import { NextRequest, NextResponse } from "next/server";
import { requireRoleApi } from "@/lib/auth";
import { run } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
  const staff = await requireRoleApi("admin", "superadmin");
  if (staff instanceof NextResponse) return staff;

  try {
    const { account_id, rut } = await req.json();
    if (!account_id || !rut) {
      return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
    }

    await run(
      `UPDATE customer_accounts SET rut = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      rut, account_id
    );

    await logAudit({
      staffId: staff.id,
      action: "ocr_link_rut",
      entityType: "customer_account",
      entityId: account_id,
      details: { rut },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}