// CSV export de pacientes para uso interno (BI, padron, contabilidad).
// Solo accesible para admin/superadmin.
import { NextResponse, type NextRequest } from "next/server";
import { requireStaff, isAdminOrAbove } from "@/lib/auth";
import { all } from "@/lib/db";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface PatientRow {
  id: number;
  rut: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  allergies: string | null;
  chronic_conditions: string | null;
  membership_status: string;
  created_at: string;
  prescription_count: number;
  dispensation_count: number;
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const staff = await requireStaff();
  if (!isAdminOrAbove(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const rows = await all<PatientRow>(
    `SELECT p.id, p.rut, p.full_name, p.date_of_birth, p.gender, p.email, p.phone,
       p.address, p.city, p.emergency_contact_name, p.emergency_contact_phone,
       p.allergies, p.chronic_conditions, p.membership_status, p.created_at,
       (SELECT COUNT(*) FROM prescriptions r WHERE r.patient_id = p.id) as prescription_count,
       (SELECT COUNT(*) FROM dispensations d WHERE d.patient_id = p.id) as dispensation_count
     FROM patients p
     ORDER BY p.full_name`
  );

  await logAudit({
    staffId: staff.id,
    action: "patients_csv_export",
    entityType: "patient",
    details: { count: rows.length },
  });

  const headers = [
    "ID", "RUT", "Nombre", "Fecha nac.", "Género", "Email", "Teléfono",
    "Dirección", "Ciudad",
    "Contacto emergencia", "Tel. emergencia",
    "Alergias", "Cond. crónicas",
    "Membresía", "Creado",
    "# Recetas", "# Dispensaciones",
  ];

  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.id, r.rut, r.full_name, r.date_of_birth?.split("T")[0] ?? "", r.gender ?? "",
      r.email ?? "", r.phone ?? "", r.address ?? "", r.city ?? "",
      r.emergency_contact_name ?? "", r.emergency_contact_phone ?? "",
      r.allergies ?? "", r.chronic_conditions ?? "",
      r.membership_status, r.created_at?.split("T")[0] ?? "",
      r.prescription_count, r.dispensation_count,
    ].map(csvEscape).join(","));
  }

  // BOM para Excel detecte UTF-8 con tildes correctas
  const csv = "﻿" + lines.join("\r\n");
  const filename = `cultimed-pacientes-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
