import { NextRequest, NextResponse } from "next/server";
import { requireRoleApi, PRESCRIPTIONS_ROLES } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { resolveStorageUrl } from "@/lib/storage";
import { parsePrescriptionText, type PrescriptionOcrData } from "@/lib/prescription-ocr";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

async function runOcrOnBuffer(buffer: Buffer): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const { data } = await Tesseract.recognize(buffer, "spa", {
    logger: () => {},
  });
  return data.text;
}

async function ocrFromAccount(accountId: number): Promise<string> {
  const account = await get<{ prescription_url: string | null }>(
    `SELECT prescription_url FROM customer_accounts WHERE id = ?`,
    accountId
  );
  if (!account) {
    throw new Error("Cuenta no encontrada.");
  }
  if (!account.prescription_url) {
    throw new Error("La cuenta no tiene receta cargada.");
  }

  const url = await resolveStorageUrl(account.prescription_url);
  if (!url) {
    throw new Error("No se pudo resolver URL de la receta.");
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Error al descargar receta: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  return runOcrOnBuffer(buffer);
}

function isMissingColumnError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message || err || "").toLowerCase();
  return msg.includes("prescription_ocr") && (msg.includes("does not exist") || msg.includes("no existe"));
}

async function saveOcrData(accountId: number, data: PrescriptionOcrData): Promise<boolean> {
  try {
    await run(
      `UPDATE customer_accounts
       SET prescription_ocr_data = ?,
           prescription_ocr_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      JSON.stringify(data),
      accountId
    );
    return true;
  } catch (e) {
    if (isMissingColumnError(e)) return false;
    throw e;
  }
}

export async function POST(req: NextRequest) {
  const staff = await requireRoleApi(...PRESCRIPTIONS_ROLES);
  if (staff instanceof NextResponse) return staff;

  try {
    const contentType = req.headers.get("content-type") || "";
    let text = "";
    let accountId: number | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      const accountIdRaw = formData.get("account_id");
      if (accountIdRaw) accountId = Number(accountIdRaw) || null;

      if (file && file.size > 0) {
        if (!ALLOWED_TYPES.includes(file.type)) {
          return NextResponse.json(
            { error: "Formato no soportado. Usa PNG, JPG o PDF." },
            { status: 400 }
          );
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        text = await runOcrOnBuffer(buffer);
      } else if (accountId) {
        text = await ocrFromAccount(accountId);
      } else {
        return NextResponse.json({ error: "Envía un archivo o account_id." }, { status: 400 });
      }
    } else {
      const body = await req.json();
      accountId = body.account_id ? Number(body.account_id) : null;
      if (!accountId) {
        return NextResponse.json({ error: "Falta account_id o archivo." }, { status: 400 });
      }
      text = await ocrFromAccount(accountId);
    }

    const data = parsePrescriptionText(text);
    let saved = false;

    if (accountId) {
      saved = await saveOcrData(accountId, data);
      if (saved) {
        await logAudit({
          staffId: staff.id,
          action: "prescription_ocr_extracted",
          entityType: "customer_account",
          entityId: accountId,
          details: {
            confidence: data.confidence,
            patientRut: data.patientRut,
            monthlyGrams: data.monthlyGrams,
            products: data.products,
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      data,
      ...(accountId ? { saved } : {}),
      ...(!saved && accountId ? { warning: "Migración 006 pendiente; datos no guardados." } : {}),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error OCR receta" }, { status: 500 });
  }
}