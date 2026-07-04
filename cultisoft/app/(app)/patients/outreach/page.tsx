import type { ReactNode } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import KpiCard from "@/components/KpiCard";
import StatusBadge from "@/components/StatusBadge";
import OutreachEmailPanel from "@/components/OutreachEmailPanel";

export const dynamic = "force-dynamic";

const TOP_N = 20;

interface PatientRow {
  id: number;
  full_name: string;
  rut: string | null;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  city: string | null;
}

interface AccountRow {
  id: number;
  email: string;
  full_name: string | null;
  rut: string | null;
  patient_id: number | null;
  prescription_status: string;
  prescription_url: string | null;
  id_front_url: string | null;
  id_back_url: string | null;
  criminal_record_url: string | null;
  rights_assignment_url: string | null;
  prescription_reviewed_at: string | null;
  created_at: string;
  matched_patient_id: number;
}

interface NoValidRxRow {
  id: number;
  full_name: string;
  rut: string | null;
  web_rx_status: string;
  linked_accounts: number;
  account_id: number | null;
}

interface IncompleteDocsRow {
  id: number;
  full_name: string;
  rut: string | null;
  account_id: number;
  docs_uploaded: number;
  docs_total: number;
}

interface MissingDataRow {
  id: number;
  full_name: string;
  rut: string | null;
  missing_fields: string[];
}

interface UnlinkedAccountRow {
  account_id: number;
  email: string;
  full_name: string | null;
  rut: string | null;
  prescription_status: string;
  matched_patient_id: number;
  matched_patient_name: string;
}

function hasUrl(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

function countDocs(acc: AccountRow): number {
  let n = 0;
  if (hasUrl(acc.prescription_url)) n++;
  if (hasUrl(acc.id_front_url)) n++;
  if (hasUrl(acc.id_back_url)) n++;
  if (hasUrl(acc.criminal_record_url)) n++;
  if (hasUrl(acc.rights_assignment_url)) n++;
  return n;
}

function missingPatientFields(p: PatientRow): string[] {
  const missing: string[] = [];
  if (!p.rut?.trim()) missing.push("RUT");
  if (!p.phone?.trim()) missing.push("Teléfono");
  if (!p.email?.trim()) missing.push("Email");
  if (!p.date_of_birth) missing.push("Fecha nac.");
  if (!p.city?.trim()) missing.push("Comuna");
  return missing;
}

function OutreachTable({
  title,
  numeral,
  count,
  children,
}: {
  title: string;
  numeral: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-4">
        <div className="flex items-baseline gap-3">
          <span className="editorial-numeral text-base text-ink-subtle">— {numeral}</span>
          <span className="eyebrow">{title}</span>
        </div>
        <span className="text-[11px] font-mono uppercase tracking-widest text-ink-muted">
          {formatNumber(count)} total · top {TOP_N}
        </span>
      </div>
      {children}
    </section>
  );
}

export default async function PatientOutreachPage() {
  await requireRole("admin", "superadmin");

  const patients = await all<PatientRow>(
    `SELECT id, full_name, rut, email, phone, date_of_birth, city
     FROM patients
     WHERE membership_status IS DISTINCT FROM 'deleted'
     ORDER BY id`
  );

  const accounts = await all<AccountRow>(
    `SELECT
       c.id,
       c.email,
       c.full_name,
       c.rut,
       c.patient_id,
       c.prescription_status,
       c.prescription_url,
       c.id_front_url,
       c.id_back_url,
       c.criminal_record_url,
       c.rights_assignment_url,
       c.prescription_reviewed_at,
       c.created_at,
       p.id AS matched_patient_id
     FROM customer_accounts c
     JOIN patients p ON p.membership_status IS DISTINCT FROM 'deleted'
       AND (
         c.patient_id = p.id
         OR (
           p.rut IS NOT NULL AND p.rut <> ''
           AND c.rut IS NOT NULL AND c.rut <> ''
           AND REPLACE(REPLACE(UPPER(c.rut), '.', ''), '-', '')
             = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
         )
         OR (
           p.email IS NOT NULL AND p.email <> ''
           AND LOWER(c.email) = LOWER(p.email)
         )
       )
     ORDER BY c.created_at ASC`
  );

  const activeInternalRx = await all<{ patient_id: number }>(
    `SELECT DISTINCT patient_id FROM prescriptions WHERE status = 'active'`
  );
  const activeInternalSet = new Set(activeInternalRx.map((r) => r.patient_id));

  const accountsByPatient = new Map<number, AccountRow[]>();
  for (const acc of accounts) {
    const pid = acc.matched_patient_id;
    if (!accountsByPatient.has(pid)) accountsByPatient.set(pid, []);
    accountsByPatient.get(pid)!.push(acc);
  }

  const noValidRx: NoValidRxRow[] = [];
  for (const p of patients) {
    if (activeInternalSet.has(p.id)) continue;
    const linked = accountsByPatient.get(p.id) || [];
    const hasApprovedWeb = linked.some((a) => a.prescription_status === "aprobada");
    if (hasApprovedWeb) continue;
    const webStatus =
      linked.find((a) => a.prescription_status !== "none")?.prescription_status ?? "none";
    const primary = linked.length
      ? [...linked].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )[0]
      : null;
    noValidRx.push({
      id: p.id,
      full_name: p.full_name,
      rut: p.rut,
      web_rx_status: webStatus,
      linked_accounts: linked.length,
      account_id: primary?.id ?? null,
    });
  }

  const incompleteDocs: IncompleteDocsRow[] = [];
  for (const p of patients) {
    const linked = accountsByPatient.get(p.id) || [];
    if (!linked.length) continue;
    const primary = [...linked].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
    const docsUploaded = countDocs(primary);
    if (docsUploaded >= 5) continue;
    incompleteDocs.push({
      id: p.id,
      full_name: p.full_name,
      rut: p.rut,
      account_id: primary.id,
      docs_uploaded: docsUploaded,
      docs_total: 5,
    });
  }
  incompleteDocs.sort((a, b) => a.docs_uploaded - b.docs_uploaded);

  const zeroDocs = incompleteDocs.filter((r) => r.docs_uploaded === 0);

  interface RejectedRxRow {
    id: number;
    full_name: string;
    rut: string | null;
    account_id: number;
    reviewed_at: string | null;
  }

  const rejectedRx: RejectedRxRow[] = [];
  for (const p of patients) {
    const linked = accountsByPatient.get(p.id) || [];
    const rejected = linked.find((a) => a.prescription_status === "rechazada");
    if (!rejected) continue;
    rejectedRx.push({
      id: p.id,
      full_name: p.full_name,
      rut: p.rut,
      account_id: rejected.id,
      reviewed_at: rejected.prescription_reviewed_at,
    });
  }
  rejectedRx.sort((a, b) => new Date(b.reviewed_at || 0).getTime() - new Date(a.reviewed_at || 0).getTime());

  const missingData: MissingDataRow[] = patients
    .map((p) => ({
      id: p.id,
      full_name: p.full_name,
      rut: p.rut,
      missing_fields: missingPatientFields(p),
    }))
    .filter((p) => p.missing_fields.length > 0)
    .sort((a, b) => b.missing_fields.length - a.missing_fields.length);

  const unlinkedAccounts = await all<UnlinkedAccountRow>(
    `SELECT
       c.id AS account_id,
       c.email,
       c.full_name,
       c.rut,
       c.prescription_status,
       p.id AS matched_patient_id,
       p.full_name AS matched_patient_name
     FROM customer_accounts c
     JOIN patients p ON p.membership_status IS DISTINCT FROM 'deleted'
       AND c.patient_id IS NULL
       AND (
         (
           p.rut IS NOT NULL AND p.rut <> ''
           AND c.rut IS NOT NULL AND c.rut <> ''
           AND REPLACE(REPLACE(UPPER(c.rut), '.', ''), '-', '')
             = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
         )
         OR (
           p.email IS NOT NULL AND p.email <> ''
           AND LOWER(c.email) = LOWER(p.email)
         )
       )
     ORDER BY c.created_at DESC
     LIMIT ?`,
    TOP_N
  );

  const unlinkedCount =
    (await get<{ c: number }>(
      `SELECT COUNT(DISTINCT c.id)::int AS c
       FROM customer_accounts c
       JOIN patients p ON p.membership_status IS DISTINCT FROM 'deleted'
         AND c.patient_id IS NULL
         AND (
           (
             p.rut IS NOT NULL AND p.rut <> ''
             AND c.rut IS NOT NULL AND c.rut <> ''
             AND REPLACE(REPLACE(UPPER(c.rut), '.', ''), '-', '')
               = REPLACE(REPLACE(UPPER(p.rut), '.', ''), '-', '')
           )
           OR (
             p.email IS NOT NULL AND p.email <> ''
             AND LOWER(c.email) = LOWER(p.email)
           )
         )`
    ))?.c ?? 0;

  const today = new Date().toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <>
      <PageHeader
        numeral="02"
        eyebrow={`Pacientes · Campaña datos · ${today}`}
        title="Campaña datos"
        subtitle={`${formatNumber(patients.length)} pacientes activos · listas para contacto y enriquecimiento de ficha.`}
        actions={
          <a href="/api/patients/export" className="btn-secondary" download>
            <span className="material-symbols-outlined text-base">download</span>
            Exportar CSV
          </a>
        }
      />

      <OutreachEmailPanel />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-10">
        <KpiCard
          numeral="I"
          label="Sin receta válida"
          value={formatNumber(noValidRx.length)}
          tone="error"
        />
        <KpiCard
          numeral="II"
          label="Docs incompletos"
          value={formatNumber(incompleteDocs.length)}
          tone="warning"
        />
        <KpiCard
          numeral="III"
          label="Datos faltantes"
          value={formatNumber(missingData.length)}
          tone="warning"
        />
        <KpiCard
          numeral="IV"
          label="Cuentas sin vincular"
          value={formatNumber(unlinkedCount)}
          tone="neutral"
        />
        <KpiCard
          numeral="V"
          label="Sin ningún documento"
          value={formatNumber(zeroDocs.length)}
          tone="warning"
        />
        <KpiCard
          numeral="VI"
          label="Receta rechazada sin resubir"
          value={formatNumber(rejectedRx.length)}
          tone="error"
        />
      </div>

      <OutreachTable title="Sin receta válida" numeral="I" count={noValidRx.length}>
        {noValidRx.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Todos los pacientes tienen receta interna activa o receta web aprobada.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>RUT</th>
                  <th>Receta web</th>
                  <th>Cuentas</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {noValidRx.slice(0, TOP_N).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link
                        href={`/patients/${r.id}`}
                        className="font-semibold text-on-surface hover:text-primary"
                      >
                        {r.full_name}
                      </Link>
                    </td>
                    <td className="font-mono text-[12px] text-on-surface-variant">
                      {r.rut || "—"}
                    </td>
                    <td>
                      <StatusBadge status={r.web_rx_status} />
                    </td>
                    <td className="tabular-nums text-on-surface-variant">{r.linked_accounts}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-3 text-xs">
                        <Link href={`/patients/${r.id}`} className="font-semibold text-primary hover:underline">
                          Ficha
                        </Link>
                        {r.account_id && (
                          <Link
                            href={`/web-prescriptions/${r.account_id}`}
                            className="font-semibold text-primary hover:underline"
                          >
                            Receta web
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutreachTable>

      <OutreachTable title="Documentos incompletos" numeral="II" count={incompleteDocs.length}>
        {incompleteDocs.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Todas las cuentas vinculadas tienen los 5 documentos cargados.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>RUT</th>
                  <th>Documentos</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {incompleteDocs.slice(0, TOP_N).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link
                        href={`/patients/${r.id}`}
                        className="font-semibold text-on-surface hover:text-primary"
                      >
                        {r.full_name}
                      </Link>
                    </td>
                    <td className="font-mono text-[12px] text-on-surface-variant">
                      {r.rut || "—"}
                    </td>
                    <td className="text-on-surface-variant">
                      {r.docs_uploaded} de {r.docs_total}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-3 text-xs">
                        <Link href={`/patients/${r.id}#documentos`} className="font-semibold text-primary hover:underline">
                          Ficha
                        </Link>
                        <Link
                          href={`/web-prescriptions/${r.account_id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          Receta web
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutreachTable>

      <OutreachTable title="Datos faltantes en ficha" numeral="III" count={missingData.length}>
        {missingData.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Todas las fichas tienen RUT, teléfono, email, fecha de nacimiento y comuna.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>RUT</th>
                  <th>Campos faltantes</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {missingData.slice(0, TOP_N).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link
                        href={`/patients/${r.id}`}
                        className="font-semibold text-on-surface hover:text-primary"
                      >
                        {r.full_name}
                      </Link>
                    </td>
                    <td className="font-mono text-[12px] text-on-surface-variant">
                      {r.rut || "—"}
                    </td>
                    <td className="text-on-surface-variant text-sm">
                      {r.missing_fields.join(", ")}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/patients/${r.id}/edit`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Editar ficha
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutreachTable>

      <OutreachTable title="Cuentas web sin vincular" numeral="IV" count={unlinkedCount}>
        {unlinkedAccounts.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            No hay cuentas detectadas por RUT o email pendientes de vinculación formal.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Cuenta web</th>
                  <th>RUT cuenta</th>
                  <th>Paciente detectado</th>
                  <th>Receta web</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {unlinkedAccounts.map((r) => (
                  <tr key={r.account_id}>
                    <td>
                      <div className="font-semibold text-on-surface">{r.full_name || r.email}</div>
                      <div className="text-[11px] text-on-surface-variant font-mono">{r.email}</div>
                    </td>
                    <td className="font-mono text-[12px] text-on-surface-variant">
                      {r.rut || "—"}
                    </td>
                    <td>
                      <Link
                        href={`/patients/${r.matched_patient_id}`}
                        className="font-semibold text-on-surface hover:text-primary"
                      >
                        {r.matched_patient_name}
                      </Link>
                    </td>
                    <td>
                      <StatusBadge status={r.prescription_status} />
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-3 text-xs">
                        <Link
                          href={`/patients/${r.matched_patient_id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          Ficha
                        </Link>
                        <Link
                          href={`/web-prescriptions/${r.account_id}`}
                          className="font-semibold text-primary hover:underline"
                        >
                          Receta web
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutreachTable>

      <OutreachTable title="Sin ningún documento subido" numeral="V" count={zeroDocs.length}>
        {zeroDocs.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            Todas las cuentas vinculadas subieron al menos 1 documento.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>RUT</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {zeroDocs.slice(0, TOP_N).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/patients/${r.id}`} className="font-semibold text-on-surface hover:text-primary">
                        {r.full_name}
                      </Link>
                    </td>
                    <td className="font-mono text-[12px] text-on-surface-variant">{r.rut || "—"}</td>
                    <td className="text-right">
                      <div className="flex justify-end gap-3 text-xs">
                        <Link href={`/patients/${r.id}`} className="font-semibold text-primary hover:underline">
                          Ficha
                        </Link>
                        <Link href={`/web-prescriptions/${r.account_id}`} className="font-semibold text-primary hover:underline">
                          Receta web
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutreachTable>

      <OutreachTable title="Receta rechazada sin resubir" numeral="VI" count={rejectedRx.length}>
        {rejectedRx.length === 0 ? (
          <div className="clinical-card p-8 text-center text-sm text-on-surface-variant">
            No hay cuentas con receta rechazada pendiente de resubida.
          </div>
        ) : (
          <div className="clinical-card overflow-hidden">
            <table className="table-clinical">
              <thead>
                <tr>
                  <th>Paciente</th>
                  <th>RUT</th>
                  <th>Rechazada</th>
                  <th className="text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rejectedRx.slice(0, TOP_N).map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link href={`/patients/${r.id}`} className="font-semibold text-on-surface hover:text-primary">
                        {r.full_name}
                      </Link>
                    </td>
                    <td className="font-mono text-[12px] text-on-surface-variant">{r.rut || "—"}</td>
                    <td className="text-on-surface-variant text-xs">
                      {r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString("es-CL") : "—"}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-3 text-xs">
                        <Link href={`/patients/${r.id}`} className="font-semibold text-primary hover:underline">
                          Ficha
                        </Link>
                        <Link href={`/web-prescriptions/${r.account_id}`} className="font-semibold text-primary hover:underline">
                          Receta web
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </OutreachTable>

      <div className="p-4 bg-paper-dim/30 border border-rule-soft">
        <p className="text-[11px] font-mono uppercase tracking-widest text-ink-muted mb-2">
          — Criterios de segmentación
        </p>
        <ul className="text-sm text-ink-muted leading-relaxed space-y-1 list-disc list-inside">
          <li>
            <strong className="text-ink">Sin receta válida:</strong> sin receta interna activa ni receta web aprobada.
          </li>
          <li>
            <strong className="text-ink">Docs incompletos:</strong> cuenta vinculada con menos de 5 documentos cargados.
          </li>
          <li>
            <strong className="text-ink">Datos faltantes:</strong> ficha sin RUT, teléfono, email, fecha de nacimiento o comuna.
          </li>
          <li>
            <strong className="text-ink">Cuentas sin vincular:</strong> cuenta web detectada por RUT/email sin{" "}
            <code className="font-mono text-[12px] bg-paper-bright px-1 py-0.5">patient_id</code> asignado.
          </li>
          <li>
            <strong className="text-ink">Sin ningún documento:</strong> cuenta vinculada con 0 de 5 documentos cargados.
          </li>
          <li>
            <strong className="text-ink">Receta rechazada sin resubir:</strong> cuenta cuya receta web está actualmente en estado rechazada.
          </li>
        </ul>
      </div>
    </>
  );
}