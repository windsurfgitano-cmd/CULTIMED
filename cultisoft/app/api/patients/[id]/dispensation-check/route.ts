import { NextRequest, NextResponse } from "next/server";
import { requireRoleApi, OPS_ROLES } from "@/lib/auth";
import { validateDispensation } from "@/lib/dispensation-guard";
import { isAdminOrAbove } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const staff = await requireRoleApi(...OPS_ROLES);
  if (staff instanceof NextResponse) return staff;

  const patientId = parseInt(params.id, 10);
  if (!patientId) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const items = Array.isArray(body.items) ? body.items : [];
  const prescriptionId = body.prescription_id ? Number(body.prescription_id) : null;

  const result = await validateDispensation({
    patientId,
    items: items.map((it: { presentation?: string; name?: string; quantity?: number }) => ({
      presentation: it.presentation ?? null,
      name: it.name ?? "",
      quantity: Number(it.quantity) || 0,
    })),
    prescriptionId,
    allowOverride: false,
  });

  return NextResponse.json({
    ...result,
    canOverride: isAdminOrAbove(staff),
  });
}