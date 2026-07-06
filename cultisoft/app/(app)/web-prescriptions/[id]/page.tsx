import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePrescriptionsRole } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { markPrescriptionApproved } from "@/lib/referrals";
import { resolveStorageUrl } from "@/lib/storage";
import { sendNotification } from "@/lib/notify";
import PageHeader from "@/components/PageHeader";
import StaffDocumentUploadForm from "@/components/StaffDocumentUploadForm";

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
  const staff = await requirePrescriptionsRole();
  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision"));
  const notes = String(formData.get("notes") || "").trim();
  if (!id || !["aprobada", "rechazada"].includes(decision)) return;

  const customer = await get<{
    email: string; full_name: string; phone: string | null; prescription_uploaded_at: string | null;
  }>(
    `SELECT email, full_name, phone, prescription_uploaded_at FROM customer_accounts WHERE id = ?`, id
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

  // Notificar al paciente. Dedupe por (cuenta, fecha de subida de la receta):
  // el doble clic del QF no duplica, pero una nueva receta subida el próximo
  // año sí genera su propio aviso. sendNotification nunca lanza.
  if (customer) {
    await sendNotification({
      type: decision === "aprobada" ? "receta_aprobada" : "receta_rechazada",
      customerAccountId: id,
      recipientEmail: customer.email,
      recipientPhone: customer.phone,
      dedupeKey: `${id}:${customer.prescription_uploaded_at || "sin-fecha"}`,
      relatedId: id,
      data: { firstName: customer.full_name, notes: notes || null },
    });
  }

  redirect(`/web-prescriptions/${id}`);
}

// La subida de documentos por staff ahora es 100% client-side (ver
// components/StaffDocumentUploadForm.tsx): va DIRECTO a Supabase Storage vía
// /api/uploads/sign + /api/uploads/attach-patient-doc, sin pasar por una
// función serverless de Vercel (límite duro ~4.5MB que rompía fotos reales).

export default async function WebPrescriptionDetail({ params }: { params: { id: string } }) {
  await requirePrescriptionsRole();
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

  function UploadForm({ docType }: { docType: "id_front" | "id_back" | "criminal_record" | "prescription" | "rights_assignment"; docLabel: string }) {
    return <StaffDocumentUploadForm customerId={id} docType={docType} />;
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
