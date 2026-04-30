import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { markPrescriptionApproved } from "@/lib/referrals";
import { resolveStorageUrl } from "@/lib/storage";
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
  const staff = await requireStaff();
  const id = Number(formData.get("id"));
  const decision = String(formData.get("decision"));
  const notes = String(formData.get("notes") || "").trim();
  if (!id || !["aprobada", "rechazada"].includes(decision)) return;

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

  redirect(`/web-prescriptions/${id}`);
}

export default async function WebPrescriptionDetail({ params }: { params: { id: string } }) {
  await requireStaff();
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const r = await get<WebRxDetail>(
    `SELECT c.*, s.full_name as reviewer_name
     FROM customer_accounts c
     LEFT JOIN staff s ON s.id = c.prescription_reviewed_by
     WHERE c.id = ?`,
    id
  );
  if (!r) notFound();

  const meta = STATUS_META[r.prescription_status] ?? STATUS_META.none;
  const isImage = r.prescription_url && /\.(png|jpe?g|webp|gif)$/i.test(r.prescription_url);
  const isPdf   = r.prescription_url && /\.pdf$/i.test(r.prescription_url);
  // resolveStorageUrl: maneja "bucket://path" (Supabase Storage signed URL) o legacy "/uploads/..."
  const fullUrl = await resolveStorageUrl(r.prescription_url);

  return (
    <>
      <PageHeader
        numeral="04B"
        eyebrow={`Receta web · ${meta.label}`}
        title={r.full_name}
        subtitle={r.email}
        actions={
          <Link href="/web-prescriptions" className="font-mono text-[11px] uppercase tracking-widest text-ink hover:text-brass">
            ← Volver
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Document preview */}
        <div className="lg:col-span-2">
          <div className="flex items-baseline gap-3 mb-4">
            <span className="editorial-numeral text-sm text-ink-subtle">— I</span>
            <span className="eyebrow">Documento subido</span>
          </div>

          {!r.prescription_url ? (
            <div className="border border-rule bg-paper-bright p-12 text-center">
              <p className="font-display italic text-2xl text-ink-muted">Sin documento.</p>
              <p className="text-sm text-ink-subtle mt-2">El paciente aún no ha subido una receta.</p>
            </div>
          ) : isImage ? (
            <div className="border border-rule bg-paper-bright p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fullUrl!}
                alt={`Receta de ${r.full_name}`}
                className="block w-full h-auto max-h-[80vh] object-contain bg-paper-dim"
              />
              <div className="mt-3 px-2 pb-1 flex items-center justify-between text-[11px] font-mono text-ink-subtle">
                <span className="break-all">{r.prescription_url}</span>
                <a
                  href={fullUrl!}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-3 shrink-0 underline-offset-4 hover:underline text-ink"
                >
                  abrir ↗
                </a>
              </div>
            </div>
          ) : isPdf ? (
            <div className="border border-rule bg-paper-bright">
              <object data={fullUrl!} type="application/pdf" className="w-full h-[80vh]">
                <div className="p-12 text-center">
                  <p className="text-sm text-ink-muted mb-3">Tu navegador no puede mostrar PDFs en línea.</p>
                  <a href={fullUrl!} target="_blank" rel="noreferrer" className="btn-primary">
                    Abrir PDF
                  </a>
                </div>
              </object>
            </div>
          ) : (
            <div className="border border-rule bg-paper-bright p-12 text-center">
              <p className="font-display italic text-xl text-ink-muted mb-3">Formato no previsualizable.</p>
              <a href={fullUrl!} target="_blank" rel="noreferrer" className="btn-primary">
                Descargar archivo
              </a>
            </div>
          )}
        </div>

        {/* Sidebar: paciente + decisión */}
        <div className="space-y-8">
          <div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="editorial-numeral text-sm text-ink-subtle">— II</span>
              <span className="eyebrow">Datos del paciente</span>
            </div>
            <div className="border border-rule bg-paper-bright p-5 space-y-3 text-sm">
              <KV k="Nombre" v={r.full_name} />
              <KV k="Email" v={r.email} mono />
              <KV k="RUT" v={r.rut || "—"} mono />
              <KV k="Teléfono" v={r.phone || "—"} mono />
              <KV
                k="Cuenta creada"
                v={formatDateTime(r.created_at)}
                mono
              />
              {r.age_gate_accepted_at && (
                <KV
                  k="Age gate"
                  v={`Aceptado · ${formatDateTime(r.age_gate_accepted_at)}`}
                  mono
                />
              )}
              {r.prescription_uploaded_at && (
                <KV
                  k="Última subida"
                  v={formatDateTime(r.prescription_uploaded_at)}
                  mono
                />
              )}
              {r.reviewer_name && r.prescription_reviewed_at && (
                <KV
                  k={`Revisada (${meta.label.toLowerCase()})`}
                  v={`${r.reviewer_name} · ${formatDateTime(r.prescription_reviewed_at)}`}
                />
              )}
              {r.prescription_reviewer_notes && (
                <div className="pt-2 mt-2 border-t border-rule-soft">
                  <p className="eyebrow text-ink-subtle mb-1">— Notas del revisor</p>
                  <p className="text-sm text-ink whitespace-pre-wrap">{r.prescription_reviewer_notes}</p>
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="editorial-numeral text-sm text-ink-subtle">— III</span>
              <span className="eyebrow">Decisión QF</span>
            </div>

            {r.prescription_status === "pending" ? (
              <form action={reviewAction} className="border border-rule bg-paper-bright p-5 space-y-4">
                <input type="hidden" name="id" value={r.id} />
                <div>
                  <label htmlFor="notes" className="input-label">
                    Notas (opcional · visibles para el paciente)
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={3}
                    className="input-field resize-none"
                    placeholder="Ej: Receta vigente, paciente apto para dispensar."
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="submit"
                    name="decision"
                    value="rechazada"
                    className="px-4 py-3 border border-sangria text-sangria font-mono text-[11px] uppercase tracking-widest hover:bg-sangria hover:text-paper transition-colors"
                  >
                    Rechazar
                  </button>
                  <button
                    type="submit"
                    name="decision"
                    value="aprobada"
                    className="btn-primary"
                  >
                    Aprobar
                  </button>
                </div>
                <p className="text-[10px] text-ink-subtle">
                  La decisión queda registrada en bitácora de auditoría con tu cuenta y la fecha/hora actual.
                </p>
              </form>
            ) : (
              <div className="border border-rule bg-paper-bright p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <span className={`pill ${meta.cls}`}>{meta.label}</span>
                  {r.prescription_reviewed_at && (
                    <span className="text-[11px] font-mono text-ink-subtle">
                      {formatDateTime(r.prescription_reviewed_at)}
                    </span>
                  )}
                </div>
                <form action={reopenAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button
                    type="submit"
                    className="font-mono text-[11px] uppercase tracking-widest text-ink-muted hover:text-ink underline-offset-4 hover:underline"
                  >
                    Reabrir validación →
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

async function reopenAction(formData: FormData) {
  "use server";
  const staff = await requireStaff();
  const id = Number(formData.get("id"));
  if (!id) return;
  await run(
    `UPDATE customer_accounts
     SET prescription_status = 'pending',
         prescription_reviewed_by = NULL,
         prescription_reviewed_at = NULL,
         prescription_reviewer_notes = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    id
  );
  await logAudit({
    staffId: staff.id,
    action: "web_prescription_reopened",
    entityType: "customer_account",
    entityId: id,
  });
  redirect(`/web-prescriptions/${id}`);
}

function KV({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <dt className="eyebrow text-ink-subtle">{k}</dt>
      <dd className={`mt-0.5 text-sm text-ink ${mono ? "font-mono break-all" : ""}`}>{v}</dd>
    </div>
  );
}
