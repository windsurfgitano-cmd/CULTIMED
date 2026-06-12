import Link from "next/link";
import { requireRole } from "@/lib/auth";
import PageHeader from "@/components/PageHeader";
import OcrClientPage from "./ocr-client";

export const dynamic = "force-dynamic";

export default async function OcrPage() {
  await requireRole("admin", "superadmin");
  return (
    <>
      <PageHeader
        numeral="04B"
        eyebrow="Receta web · Migración OCR"
        title="Extraer RUT desde carnet"
        subtitle="Sube la foto del carnet de un paciente legacy para extraer su RUT y asociarlo a su cuenta."
        actions={
          <Link href="/web-prescriptions" className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass">
            ← Volver
          </Link>
        }
      />
      <OcrClientPage />
    </>
  );
}
