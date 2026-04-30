import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { run } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { saveUploadedFile } from "@/lib/uploads";
import PrescriptionUpload from "@/components/PrescriptionUpload";

async function uploadAction(formData: FormData) {
  "use server";
  const customer = requireCustomer();
  const file = formData.get("prescription") as File | null;
  if (!file || file.size === 0) redirect("/mi-cuenta/recetas?e=missing");
  if (file.size > 8 * 1024 * 1024) redirect("/mi-cuenta/recetas?e=too_big");

  const url = await saveUploadedFile(file, `prescriptions/${customer.id}`);
  run(
    `UPDATE customer_accounts
     SET prescription_url = ?, prescription_status = 'pending',
         prescription_uploaded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    url, customer.id
  );
  redirect("/mi-cuenta/recetas?ok=1");
}

const ERR: Record<string, string> = {
  missing: "Selecciona un archivo (PDF, JPG o PNG).",
  too_big: "El archivo no puede superar 8 MB.",
};

export default function PrescriptionsPage({ searchParams }: { searchParams: { e?: string; ok?: string } }) {
  const customer = requireCustomer();
  const error = searchParams.e ? ERR[searchParams.e] : null;
  const success = searchParams.ok === "1";

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-16 lg:py-24">
      <div className="mb-12 lg:mb-16">
        <Link href="/mi-cuenta" className="text-xs uppercase tracking-widest font-mono text-ink-muted hover:text-ink mb-6 inline-block">
          ← Mi cuenta
        </Link>
        <div className="flex items-baseline gap-6 mb-6">
          <span className="editorial-numeral text-2xl text-ink-subtle">— I</span>
          <span className="eyebrow">Receta médica</span>
        </div>
        <h1 className="font-display text-display-2 leading-[0.98] text-balance max-w-3xl">
          <span className="font-light">Carga tu</span>{" "}
          <span className="italic font-normal">receta médica</span>{" "}
          <span className="font-light">vigente.</span>
        </h1>
      </div>

      {success && (
        <div className="mb-12 p-6 bg-forest/5 border-l-2 border-forest max-w-3xl">
          <p className="eyebrow text-forest mb-2">— Recibida</p>
          <p className="font-display text-2xl text-balance leading-tight mb-2">
            Tu receta está siendo <span className="italic">revisada por nuestro QF.</span>
          </p>
          <p className="text-sm text-ink-muted">
            Te avisaremos por email y WhatsApp cuando esté lista. Suele tomar menos de 24h hábiles.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-8 p-5 bg-sangria/10 border-l-2 border-sangria max-w-3xl">
          <p className="eyebrow text-sangria mb-1">— Error</p>
          <p className="text-sm text-ink">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        {/* LEFT — Upload */}
        <div className="col-span-12 lg:col-span-7">
          <PrescriptionUpload action={uploadAction} />
          {/* Original instruction list (kept for reference, hidden — now lives inside the component) */}
          <div className="hidden">
            <ul>
              {[
                "La receta esté vigente",
                "Se vea claro",
                "Esté firmada",
                "Si es retenida",
              ].map((b, i) => (<li key={i}>{b}</li>))}
            </ul>
          </div>
        </div>

        {/* RIGHT — Status panel */}
        <aside className="col-span-12 lg:col-span-4 lg:col-start-9">
          <div className="border border-rule bg-paper-bright p-6 lg:p-7">
            <p className="eyebrow mb-4">— Estado actual</p>
            <h3 className="font-display text-3xl mb-3 leading-tight">
              {customer.prescription_status === "none" && "Sin receta cargada"}
              {customer.prescription_status === "pending" && (
                <><span className="font-light">En</span> <span className="italic">revisión</span></>
              )}
              {customer.prescription_status === "aprobada" && (
                <><span className="font-light">Receta</span> <span className="italic text-forest">aprobada</span></>
              )}
              {customer.prescription_status === "rechazada" && (
                <><span className="font-light">Receta</span> <span className="italic text-sangria">rechazada</span></>
              )}
              {customer.prescription_status === "expired" && (
                <><span className="font-light">Receta</span> <span className="italic text-sangria">vencida</span></>
              )}
            </h3>
            {customer.prescription_url && (
              <p className="text-xs text-ink-muted mb-4">
                Última subida: documento cargado correctamente.
              </p>
            )}
            <div className="hairline mb-4" />
            <p className="text-[11px] font-mono leading-relaxed text-ink-muted">
              Tus documentos médicos son tratados como datos sensibles bajo el art. 11
              de la Ley 19.628. Solo nuestro QF de turno y el médico que valida tendrán
              acceso. No los compartimos con terceros sin tu consentimiento expreso.
            </p>
          </div>

          <Link href="/consulta" className="block mt-6 text-sm text-ink-muted hover:text-ink transition-colors border-b border-rule pb-2">
            <span className="italic">¿No tienes receta?</span> Agendar consulta médica →
          </Link>
        </aside>
      </div>
    </section>
  );
}
