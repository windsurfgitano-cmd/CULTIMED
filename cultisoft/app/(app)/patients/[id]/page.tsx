import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole, requirePatientsRole, isAdminOrAbove } from "@/lib/auth";
import { OPS_ROLES, PRESCRIPTIONS_ROLES } from "@/lib/permissions";
import { run } from "@/lib/db";
import { calcAge, formatCLP, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { logAudit } from "@/lib/audit";
import { loadPatientRecord } from "@/lib/patient-record";
import { loadPatientCompliance } from "@/lib/patient-compliance";
import PageHeader from "@/components/PageHeader";
import PatientCompliancePanel from "@/components/PatientCompliancePanel";
import StatusBadge from "@/components/StatusBadge";
import ConfirmSubmitForm from "@/components/ConfirmSubmitForm";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "revision", label: "Revisión" },
  { id: "resumen", label: "Resumen" },
  { id: "datos", label: "Datos" },
  { id: "documentos", label: "Documentos" },
  { id: "recetas", label: "Recetas" },
  { id: "dispensaciones", label: "Dispensaciones" },
  { id: "pedidos", label: "Pedidos web" },
  { id: "timeline", label: "Timeline" },
  { id: "auditoria", label: "Auditoría" },
] as const;

const GENDER_LABELS: Record<string, string> = {
  M: "Masculino",
  F: "Femenino",
  X: "Otro",
};

const LINK_SOURCE_LABELS: Record<string, string> = {
  patient_id: "Vinculada por ID",
  rut: "Coincidencia RUT",
  email: "Coincidencia email",
};

const TIMELINE_KIND: Record<string, { icon: string; color: string }> = {
  patient: { icon: "person", color: "text-primary" },
  prescription: { icon: "medication", color: "text-tertiary" },
  dispensation: { icon: "local_pharmacy", color: "text-secondary" },
  web_order: { icon: "shopping_cart", color: "text-primary" },
  order_event: { icon: "update", color: "text-on-surface-variant" },
  web_rx: { icon: "upload_file", color: "text-warning" },
  web_rx_review: { icon: "fact_check", color: "text-success" },
  account: { icon: "account_circle", color: "text-on-surface-variant" },
};

async function deletePatient(formData: FormData) {
  "use server";
  const staff = await requireRole("admin", "superadmin");
  const id = Number(formData.get("id"));
  if (!id) redirect("/patients");

  const { get } = await import("@/lib/db");
  const hasDeps = await get<{ c: number }>(
    `SELECT COUNT(*) as c FROM (
       SELECT 1 FROM dispensations WHERE patient_id = ?
       UNION ALL
       SELECT 1 FROM prescriptions WHERE patient_id = ?
     )`,
    id,
    id
  );
  if (hasDeps?.c && hasDeps.c > 0) {
    redirect(`/patients/${id}?e=cannot_delete`);
  }

  const hasAccounts = await get<{ c: number }>(
    `SELECT COUNT(*) as c FROM customer_accounts WHERE patient_id = ?`,
    id
  );
  if (hasAccounts?.c && hasAccounts.c > 0) {
    redirect(`/patients/${id}?e=cannot_delete_accounts`);
  }

  await run(
    `UPDATE patients SET membership_status = 'deleted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    id
  );

  await logAudit({
    staffId: staff.id,
    action: "patient_deleted",
    entityType: "patient",
    entityId: id,
    details: {},
  });

  redirect("/patients");
}

async function updateStatus(formData: FormData) {
  "use server";
  const staff = await requirePatientsRole();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  const reason = String(formData.get("reason") || "").trim();
  if (!id || !["active", "pending", "suspended"].includes(status)) return;

  if (reason) {
    await run(
      `UPDATE patients SET membership_status = ?,
         membership_started_at = COALESCE(membership_started_at, CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE NULL END),
         notes = COALESCE(NULLIF(notes, '') || '\n\n', '') || ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      status,
      status,
      `[${new Date().toISOString().split("T")[0]} - Cambio estado a ${status}] ${reason}`,
      id
    );
  } else {
    await run(
      `UPDATE patients SET membership_status = ?,
         membership_started_at = COALESCE(membership_started_at, CASE WHEN ? = 'active' THEN CURRENT_TIMESTAMP ELSE NULL END),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      status,
      status,
      id
    );
  }

  await logAudit({
    staffId: staff.id,
    action: "patient_status_changed",
    entityType: "patient",
    entityId: id,
    details: { newStatus: status, reason: reason || null },
  });
  redirect(`/patients/${id}`);
}

async function updateClinicalNotes(formData: FormData) {
  "use server";
  const staff = await requirePatientsRole();
  const id = Number(formData.get("id"));
  if (!id) redirect("/patients");

  const allergies = String(formData.get("allergies") || "").trim() || null;
  const chronicConditions = String(formData.get("chronic_conditions") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  await run(
    `UPDATE patients SET allergies = ?, chronic_conditions = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    allergies,
    chronicConditions,
    notes,
    id
  );

  await logAudit({
    staffId: staff.id,
    action: "patient_clinical_notes_updated",
    entityType: "patient",
    entityId: id,
    details: {},
  });

  redirect(`/patients/${id}#datos`);
}

async function linkAccount(formData: FormData) {
  "use server";
  const staff = await requireRole("admin", "superadmin");
  const patientId = Number(formData.get("patient_id"));
  const accountId = Number(formData.get("account_id"));
  if (!patientId || !accountId) redirect("/patients");

  const { get } = await import("@/lib/db");
  const acc = await get<{ id: number; patient_id: number | null }>(
    `SELECT id, patient_id FROM customer_accounts WHERE id = ?`,
    accountId
  );
  if (!acc) redirect(`/patients/${patientId}`);

  if (acc.patient_id && acc.patient_id !== patientId) {
    redirect(`/patients/${patientId}?e=account_linked_other`);
  }

  await run(
    `UPDATE customer_accounts SET patient_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    patientId,
    accountId
  );

  await logAudit({
    staffId: staff.id,
    action: "customer_account_linked",
    entityType: "customer_account",
    entityId: accountId,
    details: { patientId },
  });

  redirect(`/patients/${patientId}#documentos`);
}

export default async function PatientDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { e?: string };
}) {
  const staff = await requirePatientsRole();
  const id = parseInt(params.id, 10);
  if (!id) notFound();

  const record = await loadPatientRecord(id);
  if (!record) notFound();

  const { patient: p, prescriptions: rxs, dispensations, accounts, webOrders, timeline, audits, totals } =
    record;

  const accountIds = accounts.map((a) => a.id);
  const compliance = await loadPatientCompliance(id, accountIds);
  const primaryAccountId =
    accounts.find((a) => a.link_source === "patient_id")?.id ?? accounts[0]?.id ?? null;

  const canAdmin = isAdminOrAbove(staff);
  const canOps = OPS_ROLES.includes(staff.role);
  const canRx = PRESCRIPTIONS_ROLES.includes(staff.role);

  const initials = p.full_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  const age = calcAge(p.date_of_birth);

  const unlinkedAccounts = accounts.filter((a) => a.link_source !== "patient_id");

  return (
    <>
      {searchParams?.e === "cannot_delete" && (
        <Alert
          title="No se puede eliminar"
          message="Este paciente tiene dispensaciones o recetas registradas. Debes archivar el perfil en lugar de eliminarlo."
        />
      )}
      {searchParams?.e === "cannot_delete_accounts" && (
        <Alert
          title="No se puede eliminar"
          message="Este paciente tiene cuentas activas vinculadas. Debes desvincular o desactivar las cuentas primero."
        />
      )}
      {searchParams?.e === "account_linked_other" && (
        <Alert
          title="Cuenta ya vinculada"
          message="Esta cuenta web ya está asociada a otro paciente."
        />
      )}

      <PageHeader
        title={p.full_name}
        subtitle="Ficha histórica unificada"
        actions={
          <>
            <Link href="/patients" className="btn-secondary">
              <span className="material-symbols-outlined text-base">arrow_back</span>
              Pacientes
            </Link>
            {canAdmin && (
              <Link href={`/patients/${p.id}/edit`} className="btn-secondary">
                <span className="material-symbols-outlined text-base">edit</span>
                Editar datos
              </Link>
            )}
            {canRx && (
              <Link href={`/web-prescriptions?patient=${p.id}`} className="btn-secondary">
                <span className="material-symbols-outlined text-base">description</span>
                Recetas web
              </Link>
            )}
            {canAdmin && (
              <ConfirmSubmitForm
                action={deletePatient}
                confirmMessage="¿Estás seguro de eliminar este perfil? Esta acción no se puede deshacer y solo es posible si el paciente no tiene dispensaciones, recetas ni cuentas activas."
              >
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="btn-error">
                  <span className="material-symbols-outlined text-base">delete</span>
                  Eliminar perfil
                </button>
              </ConfirmSubmitForm>
            )}
            {canOps && (
              <Link href={`/dispensations/new?patient=${p.id}`} className="btn-primary">
                <span className="material-symbols-outlined text-base">add</span>
                Nueva dispensación
              </Link>
            )}
          </>
        }
      />

      <nav className="sticky top-16 z-20 -mx-1 mb-6 overflow-x-auto">
        <div className="flex gap-1 rounded-lg border border-outline-variant/40 bg-surface-container-low p-1 min-w-max">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-on-surface-variant hover:bg-surface-container hover:text-on-surface whitespace-nowrap"
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <PatientCompliancePanel
        compliance={compliance}
        canRunOcr={canRx}
        patientId={p.id}
        primaryAccountId={primaryAccountId}
      />

      {/* Resumen */}
      <section id="resumen" className="scroll-mt-28 mb-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 clinical-card p-6">
            <div className="flex items-start gap-5">
              <div className="w-16 h-16 rounded-full bg-primary text-on-primary flex items-center justify-center text-xl font-bold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-xl font-bold text-on-surface">{p.full_name}</h2>
                  <StatusBadge status={p.membership_status} />
                </div>
                <p className="text-sm font-mono text-on-surface-variant mt-1">RUT {p.rut}</p>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <Stat label="Edad" value={age !== null ? `${age} años` : "—"} />
                  <Stat label="Género" value={p.gender ? GENDER_LABELS[p.gender] || p.gender : "—"} />
                  <Stat label="Comuna" value={p.city || "—"} />
                  <Stat label="Socio desde" value={formatDate(p.membership_started_at)} />
                </div>
              </div>
            </div>
          </div>

          <div className="clinical-card p-6">
            <h3 className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">
              Resumen de actividad
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Stat label="Total dispensado" value={formatCLP(totals.dispensed)} large />
              <Stat label="Dispensaciones" value={formatNumber(totals.dispensation_count)} />
              <Stat label="Pedidos web" value={formatNumber(totals.web_orders)} />
              <Stat label="Gasto web" value={formatCLP(totals.web_spent)} />
              <Stat label="Recetas activas" value={String(totals.active_rx)} />
              <Stat label="Cuentas web" value={String(accounts.length)} />
            </div>
          </div>
        </div>
      </section>

      {/* Datos */}
      <section id="datos" className="scroll-mt-28 mb-8">
        <h3 className="text-base font-bold text-on-surface mb-3">Datos del paciente</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="clinical-card p-6">
            <h4 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
              <span className="material-symbols-outlined text-primary text-[20px]">contact_mail</span>
              Contacto
            </h4>
            <dl className="space-y-3 text-sm">
              <KV k="Email" v={p.email || "—"} mono />
              <KV k="Teléfono" v={p.phone || "—"} mono />
              <KV
                k="Dirección"
                v={p.address ? `${p.address}${p.city ? `, ${p.city}` : ""}` : "—"}
              />
              <KV
                k="Contacto emergencia"
                v={
                  p.emergency_contact_name
                    ? `${p.emergency_contact_name} · ${p.emergency_contact_phone || "—"}`
                    : "—"
                }
              />
            </dl>
          </div>

          <div className="clinical-card p-6">
            <h4 className="text-sm font-bold text-on-surface flex items-center gap-2 mb-4 pb-3 border-b border-outline-variant/40">
              <span className="material-symbols-outlined text-primary text-[20px]">medical_information</span>
              Información clínica
            </h4>

            <form action={updateClinicalNotes} className="space-y-3">
              <input type="hidden" name="id" value={p.id} />
              <div>
                <label className="input-label">Alergias</label>
                <textarea
                  name="allergies"
                  rows={2}
                  defaultValue={p.allergies || ""}
                  className="input-field"
                  placeholder="Alergias conocidas..."
                />
              </div>
              <div>
                <label className="input-label">Condiciones crónicas</label>
                <textarea
                  name="chronic_conditions"
                  rows={2}
                  defaultValue={p.chronic_conditions || ""}
                  className="input-field"
                  placeholder="Condiciones de base..."
                />
              </div>
              <div>
                <label className="input-label">Notas clínicas</label>
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={p.notes || ""}
                  className="input-field"
                  placeholder="Observaciones del equipo médico..."
                />
              </div>
              <div className="flex justify-end">
                <button type="submit" className="btn-primary text-sm">
                  Guardar notas clínicas
                </button>
              </div>
            </form>

            {canAdmin && (
              <form action={updateStatus} className="mt-5 pt-5 border-t border-outline-variant/40 space-y-3">
                <input type="hidden" name="id" value={p.id} />
                <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant">
                  Membresía
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="input-label">Estado</label>
                    <select name="status" defaultValue={p.membership_status} className="input-field">
                      <option value="active">Activo</option>
                      <option value="pending">Pendiente</option>
                      <option value="suspended">Suspendido</option>
                    </select>
                  </div>
                  <div>
                    <label className="input-label">Motivo (opcional)</label>
                    <textarea
                      name="reason"
                      rows={2}
                      className="input-field"
                      placeholder="Razón del cambio de estado..."
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn-secondary text-sm whitespace-nowrap">
                    Actualizar membresía
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* Documentos */}
      <section id="documentos" className="scroll-mt-28 mb-8">
        <div className="flex items-end justify-between mb-3">
          <h3 className="text-base font-bold text-on-surface">Documentos y cuentas web</h3>
          {canRx && (
            <Link
              href={`/web-prescriptions?patient=${p.id}`}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Gestionar recetas web →
            </Link>
          )}
        </div>

        {unlinkedAccounts.length > 0 && canAdmin && (
          <div className="mb-4 p-4 bg-warning/10 border-l-2 border-warning rounded-r-lg">
            <p className="text-sm font-semibold text-on-surface">
              {unlinkedAccounts.length} cuenta{unlinkedAccounts.length !== 1 ? "s" : ""} detectada
              {unlinkedAccounts.length !== 1 ? "s" : ""} por RUT o email sin vincular formalmente
            </p>
            <p className="text-sm text-on-surface-variant mt-1">
              Puedes vincularlas al paciente para unificar el historial.
            </p>
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Sin cuentas web asociadas a este paciente.
          </div>
        ) : (
          <div className="space-y-4">
            {accounts.map((acc) => (
              <div key={acc.id} className="clinical-card p-6">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="font-semibold text-on-surface">{acc.full_name || acc.email}</p>
                    <p className="text-sm font-mono text-on-surface-variant mt-1">{acc.email}</p>
                    {acc.rut && (
                      <p className="text-sm font-mono text-on-surface-variant">RUT {acc.rut}</p>
                    )}
                    {acc.phone && <p className="text-sm text-on-surface-variant">{acc.phone}</p>}
                    <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/70 mt-2">
                      {LINK_SOURCE_LABELS[acc.link_source] || acc.link_source}
                      {acc.is_ambassador ? " · Embajador" : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusBadge status={acc.prescription_status} />
                    {acc.link_source !== "patient_id" && canAdmin && (
                      <form action={linkAccount}>
                        <input type="hidden" name="patient_id" value={p.id} />
                        <input type="hidden" name="account_id" value={acc.id} />
                        <button type="submit" className="btn-secondary text-xs py-1 px-2">
                          Vincular cuenta
                        </button>
                      </form>
                    )}
                    {canRx && (
                      <Link
                        href={`/web-prescriptions/${acc.id}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Ver ficha web →
                      </Link>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {acc.documents.map((doc) => (
                    <DocumentCard key={doc.key} label={doc.label} url={doc.url} isImage={doc.isImage} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recetas */}
      <section id="recetas" className="scroll-mt-28 mb-8">
        <div className="flex items-end justify-between mb-3">
          <h3 className="text-base font-bold text-on-surface">Recetas internas</h3>
          {canRx && (
            <Link
              href={`/prescriptions/new?patient=${p.id}`}
              className="text-sm font-semibold text-primary hover:underline"
            >
              Cargar receta →
            </Link>
          )}
        </div>
        {rxs.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Este paciente no tiene recetas registradas.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Médico</th>
                  <th>Diagnóstico</th>
                  <th>Emitida</th>
                  <th>Vence</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rxs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {canRx ? (
                        <Link
                          href={`/prescriptions/${r.id}`}
                          className="font-mono text-[12px] text-primary hover:underline"
                        >
                          {r.folio}
                        </Link>
                      ) : (
                        <span className="font-mono text-[12px]">{r.folio}</span>
                      )}
                    </td>
                    <td>{r.doctor_name}</td>
                    <td className="max-w-md truncate">{r.diagnosis}</td>
                    <td className="text-on-surface-variant text-xs">{formatDate(r.issue_date)}</td>
                    <td className="text-on-surface-variant text-xs">{formatDate(r.expiry_date)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Dispensaciones */}
      <section id="dispensaciones" className="scroll-mt-28 mb-8">
        <h3 className="text-base font-bold text-on-surface mb-3">Historial de dispensaciones</h3>
        {dispensations.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Sin dispensaciones registradas.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Productos</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {dispensations.map((d) => (
                  <tr key={d.id}>
                    <td>
                      {canOps ? (
                        <Link
                          href={`/dispensations/${d.id}`}
                          className="font-mono text-[12px] text-primary hover:underline"
                        >
                          {d.folio}
                        </Link>
                      ) : (
                        <span className="font-mono text-[12px]">{d.folio}</span>
                      )}
                    </td>
                    <td className="text-on-surface-variant text-xs whitespace-nowrap">
                      {formatDateTime(d.dispensed_at)}
                    </td>
                    <td>
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="text-sm">
                      {d.product_count} producto{d.product_count !== 1 ? "s" : ""}
                    </td>
                    <td className="text-right font-mono tabular-nums whitespace-nowrap">
                      {formatCLP(d.total_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Pedidos web */}
      <section id="pedidos" className="scroll-mt-28 mb-8">
        <div className="flex items-end justify-between mb-3">
          <h3 className="text-base font-bold text-on-surface">Pedidos web</h3>
          {canOps && webOrders.length > 0 && (
            <Link href="/web-orders" className="text-sm font-semibold text-primary hover:underline">
              Ver todos los pedidos →
            </Link>
          )}
        </div>
        {webOrders.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Sin pedidos web asociados a las cuentas de este paciente.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Cuenta</th>
                  <th>Fecha</th>
                  <th>Items</th>
                  <th>Pago</th>
                  <th>Estado</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {webOrders.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {canOps ? (
                        <Link
                          href={`/web-orders/${o.id}`}
                          className="font-mono text-[12px] text-primary hover:underline"
                        >
                          {o.folio}
                        </Link>
                      ) : (
                        <span className="font-mono text-[12px]">{o.folio}</span>
                      )}
                    </td>
                    <td className="text-xs font-mono text-on-surface-variant">{o.customer_email}</td>
                    <td className="text-on-surface-variant text-xs whitespace-nowrap">
                      {formatDateTime(o.created_at)}
                    </td>
                    <td className="text-sm">
                      {o.item_count} item{o.item_count !== 1 ? "s" : ""}
                    </td>
                    <td className="text-xs">{o.payment_method}</td>
                    <td>
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="text-right font-mono tabular-nums whitespace-nowrap">
                      {formatCLP(o.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Timeline */}
      <section id="timeline" className="scroll-mt-28 mb-8">
        <h3 className="text-base font-bold text-on-surface mb-3">Línea de tiempo unificada</h3>
        {timeline.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Sin eventos registrados.
          </div>
        ) : (
          <ol className="clinical-card p-6 space-y-0">
            {timeline.map((ev, idx) => {
              const meta = TIMELINE_KIND[ev.kind] || TIMELINE_KIND.account;
              const showLink =
                ev.href &&
                ((ev.kind === "prescription" && canRx) ||
                  (ev.kind === "dispensation" && canOps) ||
                  (["web_order", "order_event"].includes(ev.kind) && canOps) ||
                  (["web_rx", "web_rx_review", "account"].includes(ev.kind) && canRx));
              return (
                <li
                  key={`${ev.kind}-${ev.at}-${idx}`}
                  className="flex gap-4 py-4 border-b border-outline-variant/30 last:border-0"
                >
                  <span
                    className={`material-symbols-outlined text-[20px] shrink-0 ${meta.color}`}
                  >
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    {showLink && ev.href ? (
                      <Link href={ev.href} className="text-sm font-semibold text-primary hover:underline">
                        {ev.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-semibold text-on-surface">{ev.title}</p>
                    )}
                    {ev.detail && (
                      <p className="text-[12px] text-on-surface-variant mt-0.5 truncate">{ev.detail}</p>
                    )}
                    <p className="text-[10px] text-on-surface-variant/70 font-mono mt-1">
                      {formatDateTime(ev.at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Auditoría */}
      <section id="auditoria" className="scroll-mt-28 mb-8">
        <h3 className="text-base font-bold text-on-surface mb-3">Registro de auditoría</h3>
        {audits.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Sin entradas de auditoría para este paciente.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Acción</th>
                  <th>Staff</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((a) => (
                  <tr key={a.id}>
                    <td className="text-on-surface-variant text-xs whitespace-nowrap">
                      {formatDateTime(a.created_at)}
                    </td>
                    <td className="font-mono text-[12px]">{a.action}</td>
                    <td>{a.staff_name || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-on-surface-variant/60">
        Paciente registrado el {formatDateTime(p.created_at)}
        {p.updated_at !== p.created_at && ` · Última actualización ${formatDateTime(p.updated_at)}`}
      </p>
    </>
  );
}

function DocumentCard({
  label,
  url,
  isImage,
}: {
  label: string;
  url: string | null;
  isImage: boolean;
}) {
  return (
    <div className="rounded-lg border border-outline-variant/40 p-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">
        {label}
      </p>
      {!url ? (
        <span className="text-sm text-on-surface-variant">No subido</span>
      ) : isImage ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block group">
          <div className="relative aspect-[4/3] rounded-md overflow-hidden bg-surface-container-low">
            <img
              src={url}
              alt={label}
              className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
            />
          </div>
          <span className="text-xs font-semibold text-primary hover:underline mt-2 inline-block">
            Abrir imagen →
          </span>
        </a>
      ) : (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Ver documento →
        </a>
      )}
    </div>
  );
}

function Alert({ title, message }: { title: string; message: string }) {
  return (
    <div className="mb-4 p-4 bg-error/10 border-l-2 border-error">
      <p className="text-sm font-semibold text-error">{title}</p>
      <p className="text-sm text-on-surface-variant mt-1">{message}</p>
    </div>
  );
}

function Stat({ label, value, large = false }: { label: string; value: string; large?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
        {label}
      </dt>
      <dd
        className={
          large
            ? "text-2xl font-light text-on-surface mt-0.5"
            : "text-sm font-medium text-on-surface mt-0.5"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function KV({ k, v, mono = false }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <dt className="text-on-surface-variant text-[12px]">{k}</dt>
      <dd className={`col-span-2 text-on-surface ${mono ? "font-mono text-[12px]" : ""}`}>{v}</dd>
    </div>
  );
}