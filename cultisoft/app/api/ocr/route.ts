import { NextRequest, NextResponse } from "next/server";
import { requireRoleApi } from "@/lib/auth";
import { all } from "@/lib/db";

const RUT_RE = /(\d{1,2}\.?\d{3}\.?\d{3}[-]?[\dkK])/;

export async function POST(req: NextRequest) {
  const staff = await requireRoleApi("admin", "superadmin");
  if (staff instanceof NextResponse) return staff;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ error: "Selecciona un archivo." }, { status: 400 });
  }

  const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Formato no soportado. Usa PNG, JPG o PDF." }, { status: 400 });
  }

  try {
    const Tesseract = await import("tesseract.js");
    const buffer = Buffer.from(await file.arrayBuffer());
    const { data } = await Tesseract.recognize(buffer, "spa", {
      logger: () => {},
    });

    const text = data.text.slice(0, 3000);
    const rutMatch = text.match(RUT_RE);
    const rawRut = rutMatch ? rutMatch[1].replace(/\./g, "").toUpperCase() : null;
    const rutFormatted = rawRut
      ? `${rawRut.slice(0, -1)}-${rawRut.slice(-1)}`
      : null;

    let candidates: { id: number; full_name: string; email: string; rut: string | null }[] = [];
    if (rutFormatted) {
      candidates = await all(
        `SELECT id, full_name, email, rut FROM customer_accounts
         WHERE rut IS NULL OR rut = '' OR rut = ?
         ORDER BY
           CASE WHEN rut = ? THEN 0 ELSE 1 END,
           created_at DESC
         LIMIT 20`,
        rutFormatted, rutFormatted
      );
    }

    return NextResponse.json({ text, rut: rawRut, rutFormatted, candidates, fileName: file.name });
  } catch (e: any) {
    return NextResponse.json({ error: `Error OCR: ${e?.message || "desconocido"}` }, { status: 500 });
  }
}