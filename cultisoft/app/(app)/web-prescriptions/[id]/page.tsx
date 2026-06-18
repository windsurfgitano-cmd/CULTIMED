import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { markPrescriptionApproved } from "@/lib/referrals";
import { resolveStorageUrl } from "@/lib/storage";
import { sendEmail, emailLayout } from "@/lib/email";
import PageHeader from "@/components/PageHeader";

export const dynamic = "force-dynamic";

interface WebRxDetail {
  id: number;
  email: string;
  full_name: string;
  rut: string | null;
  phone: string | null;
  patient_id: number | null;
  prescription_status: "none" | "pending" | "aprobada" | "rechazada";
  prescription_url: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  criminal_record_url: string | null;
  rights_assignment_url: string | null;
  prescription_uploaded_at: string | null;
  prescription_reviewed_by: number | null;
  prescription_reviewed_at: string | null;
  prescription_reviewer_notes: string | null;
  age_gate_accepted_at: string | null;
  created_at: string;
  reviewer_name: string | null;
}

const STORE_PUBLIC_BASE = process.env.STORE_PUBLIC_BASE || "http://localhost:3000";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pendiente",  cls: "pill-warning" },
  aprobada:  { label: "Aprobada",   cls: "pill-success" },
  rechazada: { label: "Rechazada",  cls: "pill-error"   },
  none:      { label: "Sin receta", cls: "pill-neutral" },
};

async function reviewAction(formData: FormData) {
  "use server";
  const staff = await requireRole("admin", "superadmin", "pharmacist");
  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision"));
  const notes = String(formData.get("notes") || "").trim();
  if (!id || !["aprobada", "rechazada"].includes(decision)) return;

  const customer = await get<{ email: string; full_name: string }>(
    `SELECT email, full_name FROM customer_accounts WHERE id = ?`, id
  );

  await run(
    `UPDATE customer_accounts
     SET prescription_status = ?,
         prescription_reviewed_by = ?,
         prescription_reviewed_at = CURRENT_TIMESTAMP,
         prescription_reviewer_notes = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    decision, staff.id, notes || null, id
  );

  // Programa Embajadores: si la receta queda aprobada, activar conversión asociada (si existe).
  if (decision === "aprobada") {
    await markPrescriptionApproved(id);
  }

  await logAudit({
    staffId: staff.id,
    action: `web_prescription_${decision}`,
    entityType: "customer_account",
    entityId: id,
    details: { notes: notes || null },
  });

  // Notificar al paciente por email
  if (customer) {
    const storeUrl = process.env.STORE_PUBLIC_BASE || "https://dispensariocultimed.cl";
    if (decision === "aprobada") {
      await sendEmail({
        to: customer.email,
        subject: "Tus documentos fueron aprobados — Cultimed",
        html: emailLayout({
          preheader: "Tus documentos fueron aprobados. Ya puedes comprar en Cultimed.",
          title: "Documentos aprobados",
          body: `
            <p>Hola ${customer.full_name},</p>
            <p>Tu documentación ha sido <strong>aprobada</strong> por nuestro químico farmacéutico.</p>
            ${notes ? `<p>Nota del revisor:<br><em>${notes}</em></p>` : ""}
            <p>Ya puedes acceder al catálogo completo y realizar tus pedidos en Cultimed.</p>
          `,
          ctaLabel: "Ir al dispensario",
          ctaUrl: `${storeUrl}/mi-cuenta`,
          footerNote: "Si tienes dudas, responde este correo o escríbenos a contacto@dispensariocultimed.cl.",
        }),
      });
    } else {
      await sendEmail({
        to: customer.email,
        subject: "Tus documentos requieren corrección — Cultimed",
        html: emailLayout({
          preheader: "Tus documentos fueron revisados y requieren corrección.",
          title: "Documentos rechazados",
          body: `
            <p>Hola ${customer.full_name},</p>
            <p>Hemos revisado tu documentación y <strong>no ha podido ser aprobada</strong>.</p>
            ${notes ? `<p>Motivo indicado por el revisor:<br><em>${notes}</em></p>` : "<p>Tu documentación no cumple con los requisitos. Por favor, sube nuevos documentos.</p>"}
            <p>Puedes volver a subir tus documentos desde tu cuenta en Cultimed.</p>
          `,
          ctaLabel: "Subir documentos",
          ctaUrl: `${storeUrl}/mi-cuenta`,
          footerNote: "Si tienes dudas, responde este correo o escríbenos a contacto@dispensariocultimed.cl.",
        }),
      });
    }
  }

  redirect(`/web-prescriptions/${id}`);
}

async function uploadDocumentAction(formData: FormData) {
  "use server";
  const staff = await requireRole("admin", "superadmin", "pharmacist");
  const id = Number(formData.get("id"));
  const docType = String(formData.get("docType"));
  const file = formData.get("file") as File;
  
  if (!id || !docType || !file || file.size === 0) {
    redirect(`/web-prescriptions/${id}?error=missing`);
  }
  
  const { saveUploadedFile } = await import("@/lib/uploads");
  const { logAudit } = await import("@/lib/audit");
  
  const url = await saveUploadedFile(file, "patient-documents", String(id), docType);
  
  const columnMap: Record<string, string> = {
    "id_front": "id_front_url",
    "id_back": "id_back_url", 
    "criminal_record": "criminal_record_url",
    "prescription": "prescription_url",
    "rights_assignment": "rights_assignment_url"
  };
  
  const column = columnMap[docType];
  if (!column) return;
  
  await run(`UPDATE customer_accounts SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, url, id);
  await logAudit({ staffId: staff.id, action: `upload_document_${docType}`, entityType: "customer_account", entityId: id });
  redirect(`/web-prescriptions/${id}`);
}

export default async function WebPrescriptionDetail({ params }: { params: { id: string } }) {
  await requireRole("admin", "superadmin", "pharmacist");
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const r = await get<WebRxDetail>(
    `SELECT c.id, c.email, c.full_name, c.rut, c.phone, c.patient_id,
       c.prescription_status, c.prescription_url,
       c.id_front_url, c.id_back_url, c.criminal_record_url, c.rights_assignment_url,
       c.prescription_uploaded_at, c.prescription_reviewed_by,
       c.prescription_reviewed_at, c.prescription_reviewer_notes,
       c.age_gate_accepted_at, c.created_at,
       s.full_name as reviewer_name
     FROM customer_accounts c
     LEFT JOIN staff s ON s.id = c.prescription_reviewed_by
     WHERE c.id = ?`,
    id
  );
  if (!r) notFound();

  const meta = STATUS_META[r.prescription_status] ?? STATUS_META.none;
  const docs = [
    { key: "id_front", url: r.id_front_url, label: "Carnet por delante" },
    { key: "id_back", url: r.id_back_url, label: "Carnet por detrás" },
    { key: "criminal_record", url: r.criminal_record_url, label: "Antecedentes penales" },
    { key: "prescription", url: r.prescription_url, label: "Receta médica" },
    { key: "rights_assignment", url: r.rights_assignment_url, label: "Comprobante de depósito" },
  ] as const;

  const docUrls = await Promise.all(
    docs.map(async (d) => ({ key: d.key, label: d.label, url: d.url ? await resolveStorageUrl(d.url) : null }))
  );

  function DocPreview({ docUrl, docLabel }: { docUrl: string | null; docLabel: string }) {
    if (!docUrl) {
      return (
        <div className="border border-rule bg-paper-bright p-8 text-center">
          <p className="font-display italic text-lg text-ink-muted">No subido</p>
        </div>
      );
    }
    const isImg = /\.(png|jpe?g|webp|gif)$/i.test(docUrl);
    const isPdf = /\.pdf$/i.test(docUrl);
    return (
      <div className="border border-rule bg-paper-bright">
        {isImg ? (
          <div className="p-2">
            <img src={docUrl} alt={docLabel} className="block w-full h-auto max-h-[60vh] object-contain bg-paper-dim" />
          </div>
        ) : isPdf ? (
          <object data={docUrl} type="application/pdf" className="w-full h-[60vh]">
            <div className="p-8 text-center">
              <p className="text-sm text-ink-muted mb-3">No se puede mostrar el PDF en línea.</p>
              <a href={docUrl} target="_blank" rel="noreferrer" className="btn-primary text-sm">Abrir PDF</a>
            </div>
          </object>
        ) : (
          <div className="p-8 text-center">
            <p className="font-display italic text-lg text-ink-muted mb-3">Formato no previsualizable.</p>
            <a href={docUrl} target="_blank" rel="noreferrer" className="btn-primary text-sm">Descargar</a>
          </div>
        )}
        <div className="px-3 pb-3 -mt-1 flex items-center justify-between text-[11px] font-mono text-ink-subtle">
          <span className="break-all truncate max-w-[80%]">{docUrl}</span>
          <a href={docUrl} target="_blank" rel="noreferrer" className="shrink-0 underline-offset-4 hover:underline text-ink ml-3">abrir ↗</a>
        </div>
      </div>
    );
  }

  function UploadForm({ docType, docLabel }: { docType: string; docLabel: string }) {
    return (
      <form action={uploadDocumentAction} encType="multipart/form-data" className="mb-2 p-3 border border-dashed border-outline-variant rounded-lg bg-surface-container-low">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="docType" value={docType} />
        <div className="flex items-center gap-3">
          <input type="file" name="file" accept=".jpg,.jpeg,.png,.pdf,.webp" className="flex-1 text-sm" required />
          <button type="submit" className="btn-secondary text-sm whitespace-nowrap">
            <span className="material-symbols-outlined text-base">upload</span>
            Subir
          </button>
        </div>
      </form>
    );
  }

  return (
    <>
      <PageHeader
        numeral="04B"
        title="Revisión de receta web"
        subtitle={`${r.full_name} · ${r.email}`}
        actions={
          <Link href="/web-prescriptions" className="btn-secondary">
            <span className="material-symbols-outlined text-base">arrow_back</span>
            Volver
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 clinical-card p-6">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">person</span>
            Datos del paciente
          </h3>
          <dl className="space-y-3 text-sm">
            <KV k="Nombre" v={r.full_name} />
            <KV k="RUT" v={r.rut || "—"} mono />
            <KV k="Email" v={r.email} mono />
            <KV k="Teléfono" v={r.phone || "—"} mono />
            <KV k="Estado" v={<span className={`pill ${meta.cls}`}>{meta.label}</span>} />
            <KV k="Revisado por" v={r.reviewer_name ? `${r.reviewer_name} · ${formatDateTime(r.prescription_reviewed_at!)}` : "—"} />
            <KV k="Notas del revisor" v={r.prescription_reviewer_notes || "—"} />
          </dl>

          {r.patient_id && (
            <div className="mt-5 pt-5 border-t border-outline-variant/40">
              <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-1">
                Paciente interno vinculado
              </p>
              <Link href={`/patients/${r.patient_id}`} className="text-sm font-mono text-primary hover:underline">
                ID {r.patient_id}
              </Link>
            </div>
          )}

          {r.prescription_status === "pending" && (
            <form action={reviewAction} className="mt-6 pt-6 border-t border-outline-variant/40">
              <input type="hidden" name="id" value={id} />
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="input-label">Decisión</label>
                  <select name="decision" defaultValue="" className="input-field" required>
                    <option value="" disabled>Seleccionar</option>
                    <option value="aprobada">Aprobar</option>
                    <option value="rechazada">Rechazar</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="input-label">Notas (opcional)</label>
                  <textarea name="notes" rows={2} className="input-field" placeholder="Observaciones…" />
                </div>
                <button type="submit" className="btn-primary whitespace-nowrap">Confirmar revisión</button>
              </div>
            </form>
          )}
        </div>

        <div className="clinical-card p-6">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
            <span className="material-symbols-outlined text-primary text-[20px]">history</span>
            Historial
          </h3>
          <dl className="space-y-3 text-sm">
            <KV k="Cuenta creada" v={formatDateTime(r.created_at)} />
            <KV k="Receta subida" v={r.prescription_uploaded_at ? formatDateTime(r.prescription_uploaded_at) : "—"} />
            <KV k="Última revisión" v={r.prescription_reviewed_at ? formatDateTime(r.prescription_reviewed_at) : "—"} />
            <KV k="Edad verif." v={r.age_gate_accepted_at ? formatDateTime(r.age_gate_accepted_at) : "—"} />
          </dl>
        </div>
      </div>

      <section>
        <h3 className="text-base font-bold text-on-surface mb-3">Documentación subida</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {docUrls.map((d) => (
            <div key={d.key} className="space-y-1">
              <UploadForm docType={d.key} docLabel={d.label} />
              <label className="block text-xs font-bold uppercase tracking-widest text-on-surface-variant">{d.label}</label>
              <DocPreview docUrl={d.url} docLabel={d.label} />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function KV({ k, v, mono = false }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <dt className="text-on-surface-variant text-[12px]">{k}</dt>
      <dd className={`col-span-2 text-on-surface ${mono ? "font-mono text-[12px]" : ""}`}>{v}</dd>
    </div>
  );
}
