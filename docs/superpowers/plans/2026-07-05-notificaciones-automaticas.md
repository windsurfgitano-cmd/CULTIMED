# Notificaciones Automáticas Multicanal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notificaciones automáticas al paciente (receta revisada, pago confirmado, despacho, recompra, pedido abandonado) por email vía Resend, con canales SMS (TextBee) y WhatsApp preparados pero dormidos, deduplicación garantizada por constraint de DB, y página admin de auditoría.

**Architecture:** Envío directo en el punto de acción (server actions de cultisoft) + 2 crons diarios (cultimed-store), todo a través de una lib `lib/notify.ts` duplicada en ambas apps (patrón `pricing.ts`) que registra cada intento en la tabla `notification_log` con `UNIQUE(type, channel, dedupe_key)`. Spec aprobada: `docs/superpowers/specs/2026-07-05-notificaciones-automaticas-design.md`.

**Tech Stack:** Next.js 14 App Router (ambas apps), Postgres/Supabase vía postgres-js (`lib/db.ts` con API get/all/run/transaction y placeholders `?`), Resend (email), TextBee REST (SMS), scripts plain-JS estilo repo, `npx -y tsx` para tests de funciones puras.

**Convenciones del repo que DEBES seguir:**
- Los scripts en `cultimed-store/scripts/*.js` cargan `.env.local` a mano con el snippet regex (ver Task 1) — NO usar dotenv.
- `lib/db.ts` (idéntico en ambas apps): `get<T>(sql, ...params)` primera fila, `all<T>` todas, `run(sql, ...params)` → `{ lastInsertRowid, changes }` (a los INSERT sin RETURNING les agrega `RETURNING id` automáticamente).
- Los archivos nuevos en `lib/` usan **imports relativos** (`./db`, `./format`) — así `npx tsx` puede ejecutarlos sin resolver el alias `@/`.
- Commits en español, mensaje corto, sin punto final.
- Antes de empezar: crear worktree con superpowers:using-git-worktrees (rama `feature/notificaciones-automaticas`); copiar a mano `cultimed-store/.env.local` y `cultisoft/.env.local` al worktree (son gitignored).

**Nota E2E:** `RESEND_API_KEY` está configurada — los emails de prueba llegan DE VERDAD a `rincondeoz@gmail.com` (cuenta de test de Oscar, id=1, password `caca123`). Eso es deseable: Oscar quiere verlos.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `cultimed-store/scripts/extend-schema-notifications.js` | Create | Migración: tabla `notification_log` + columna `marketing_opt_out` |
| `cultimed-store/lib/notify-utils.ts` | Create | Funciones puras: `normalizePhoneCL`, tokens de baja (sin imports de app) |
| `cultimed-store/lib/notify-templates.ts` | Create | Plantillas email (layout oscuro+logo) y SMS por tipo |
| `cultimed-store/lib/notify.ts` | Create | `sendNotification`: dedupe vía log + adapters email/sms/whatsapp |
| `cultisoft/lib/notify-utils.ts` `notify-templates.ts` `notify.ts` | Create | Copias exactas (patrón pricing.ts) |
| `cultimed-store/app/baja/page.tsx` | Create | Opt-out marketing sin login (token firmado) |
| `cultisoft/app/(app)/web-prescriptions/[id]/page.tsx` | Modify | Migrar emails inline de receta a `sendNotification` |
| `cultisoft/app/(app)/web-orders/[id]/page.tsx` | Modify | Notificar `confirm_payment` y `mark_shipped` |
| `cultimed-store/app/api/cron/recompra/route.ts` | Create | Cron diario recordatorio de recompra (≥5 días) |
| `cultimed-store/app/api/cron/pedido-abandonado/route.ts` | Create | Cron diario pedidos `pending_payment` 24h–7d |
| `cultimed-store/vercel.json` | Modify | 2 entradas de cron nuevas |
| `cultisoft/app/(app)/notifications/page.tsx` | Create | Admin: últimos 100 envíos |
| `cultisoft/lib/permissions.ts` + `components/Sidebar.tsx` | Modify | Nav "Notificaciones" (admin/superadmin) |
| `cultimed-store/scripts/test-sms.js` | Create | Prueba manual del relay TextBee |
| `docs/notificaciones-canales.md` | Create | Guía trámite WhatsApp Meta + setup TextBee |

---

### Task 1: Migración de schema

**Files:**
- Create: `cultimed-store/scripts/extend-schema-notifications.js`

- [ ] **Step 1: Escribir el script de migración**

```js
// Crea notification_log (registro + dedupe de notificaciones automáticas) y
// marketing_opt_out en customer_accounts. Idempotente — seguro de re-correr.
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");

(async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });

  await sql`
    CREATE TABLE IF NOT EXISTS notification_log (
      id serial PRIMARY KEY,
      customer_account_id int REFERENCES customer_accounts(id),
      type text NOT NULL,
      channel text NOT NULL DEFAULT 'email',
      recipient text NOT NULL,
      dedupe_key text NOT NULL,
      related_id int,
      status text NOT NULL,
      error text,
      created_at timestamptz DEFAULT now(),
      UNIQUE (type, channel, dedupe_key)
    )`;
  await sql`ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false`;

  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='notification_log' ORDER BY ordinal_position`;
  console.log("✓ notification_log:", cols.map((c) => c.column_name).join(","));
  const opt = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='customer_accounts' AND column_name='marketing_opt_out'`;
  console.log(opt.length ? "✓ marketing_opt_out presente" : "✗ FALTA marketing_opt_out");
  await sql.end();
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
```

- [ ] **Step 2: Correr la migración**

Run: `cd cultimed-store && node scripts/extend-schema-notifications.js`
Expected: `✓ notification_log: id,customer_account_id,type,channel,recipient,dedupe_key,related_id,status,error,created_at` y `✓ marketing_opt_out presente`

- [ ] **Step 3: Verificar idempotencia (segundo run)**

Run: `node scripts/extend-schema-notifications.js`
Expected: misma salida, sin error.

- [ ] **Step 4: Verificar el constraint de dedupe con SQL directo**

```js
// Pegar como cultimed-store/scripts/test-dedupe.js (temporal, se borra al final del task)
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});
const postgres = require("postgres");
(async () => {
  const sql = postgres(process.env.DATABASE_URL, { prepare: false, ssl: "require", max: 1 });
  await sql`DELETE FROM notification_log WHERE dedupe_key = 'test-dedupe'`;
  const a = await sql`INSERT INTO notification_log (type, channel, recipient, dedupe_key, status)
    VALUES ('recompra','email','test@test.cl','test-dedupe','sent') ON CONFLICT DO NOTHING RETURNING id`;
  const b = await sql`INSERT INTO notification_log (type, channel, recipient, dedupe_key, status)
    VALUES ('recompra','email','test@test.cl','test-dedupe','sent') ON CONFLICT DO NOTHING RETURNING id`;
  const n = await sql`SELECT COUNT(*)::int AS c FROM notification_log WHERE dedupe_key='test-dedupe'`;
  console.log(`primer insert: ${a.length} fila, segundo: ${b.length} filas, total: ${n[0].c}`);
  if (a.length === 1 && b.length === 0 && n[0].c === 1) console.log("✓ dedupe OK");
  else { console.log("✗ dedupe FALLÓ"); process.exit(1); }
  await sql`DELETE FROM notification_log WHERE dedupe_key = 'test-dedupe'`;
  await sql.end();
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
```

Run: `node scripts/test-dedupe.js`
Expected: `primer insert: 1 fila, segundo: 0 filas, total: 1` y `✓ dedupe OK`

- [ ] **Step 5: Borrar el script temporal y commitear**

```bash
rm cultimed-store/scripts/test-dedupe.js
git add cultimed-store/scripts/extend-schema-notifications.js
git commit -m "Migracion: tabla notification_log + marketing_opt_out"
```

---

### Task 2: Funciones puras — `notify-utils.ts`

**Files:**
- Create: `cultimed-store/lib/notify-utils.ts`
- Test: `cultimed-store/scripts/test-notify-utils.ts` (temporal)

- [ ] **Step 1: Escribir el test (falla porque el módulo no existe)**

```ts
// cultimed-store/scripts/test-notify-utils.ts — correr con: npx -y tsx scripts/test-notify-utils.ts
import { normalizePhoneCL, makeUnsubscribeToken, verifyUnsubscribeToken } from "../lib/notify-utils";

let fails = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const ok = actual === expected;
  console.log(`${ok ? "✓" : "✗"} ${label}: ${JSON.stringify(actual)}${ok ? "" : ` (esperaba ${JSON.stringify(expected)})`}`);
  if (!ok) fails++;
}

eq(normalizePhoneCL("+56 9 9317 7375"), "+56993177375", "formato display con +56");
eq(normalizePhoneCL("9 9317 7375"), "+56993177375", "solo celular con espacios");
eq(normalizePhoneCL("993177375"), "+56993177375", "9 dígitos pegados");
eq(normalizePhoneCL("56993177375"), "+56993177375", "con 56 sin +");
eq(normalizePhoneCL("+56993177375"), "+56993177375", "ya E.164");
eq(normalizePhoneCL("9.9317.7375"), "+56993177375", "con puntos");
eq(normalizePhoneCL("22345678"), null, "fijo de 8 dígitos → null");
eq(normalizePhoneCL(""), null, "vacío → null");
eq(normalizePhoneCL("no es fono"), null, "basura → null");

const t = makeUnsubscribeToken(42);
eq(verifyUnsubscribeToken(t), 42, "token roundtrip");
eq(verifyUnsubscribeToken(t + "x"), null, "token adulterado → null");
eq(verifyUnsubscribeToken("42.deadbeef"), null, "firma inventada → null");

process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd cultimed-store && npx -y tsx scripts/test-notify-utils.ts`
Expected: error de módulo no encontrado (`Cannot find module '../lib/notify-utils'`).

- [ ] **Step 3: Implementar `lib/notify-utils.ts`**

```ts
// Funciones puras del sistema de notificaciones. SIN imports de la app —
// este archivo debe poder correr bajo tsx sin resolver alias "@/".
import crypto from "node:crypto";

const SECRET: string =
  process.env.SESSION_SECRET ||
  // mismo fallback dev que lib/auth.ts — en prod SESSION_SECRET es obligatorio allá
  "dev-secret-change-please";

/**
 * Normaliza un teléfono chileno a E.164 (+569XXXXXXXX).
 * Acepta: "+56 9 1234 5678", "9 1234 5678", "912345678", "56912345678", con puntos/guiones.
 * Devuelve null si no es un celular chileno reconocible (los SMS solo van a celulares).
 */
export function normalizePhoneCL(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  let rest: string;
  if (digits.startsWith("569") && digits.length === 11) rest = digits.slice(2);
  else if (digits.startsWith("9") && digits.length === 9) rest = digits;
  else return null;
  return `+56${rest}`;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", SECRET).update(`unsub:${payload}`).digest("hex").slice(0, 32);
}

/** Token de baja de marketing: "<accountId>.<hmac>" — sin login, un clic. */
export function makeUnsubscribeToken(accountId: number): string {
  const payload = String(accountId);
  return `${payload}.${sign(payload)}`;
}

export function verifyUnsubscribeToken(token: string | null | undefined): number | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const id = Number(payload);
  return Number.isInteger(id) && id > 0 ? id : null;
}
```

- [ ] **Step 4: Correr el test hasta verde**

Run: `npx -y tsx scripts/test-notify-utils.ts`
Expected: 12 líneas `✓`, exit 0.

- [ ] **Step 5: Borrar test temporal y commitear**

```bash
rm scripts/test-notify-utils.ts
git add lib/notify-utils.ts
git commit -m "lib/notify-utils: normalizacion fono CL + tokens de baja"
```

---

### Task 3: Plantillas — `notify-templates.ts`

**Files:**
- Create: `cultimed-store/lib/notify-templates.ts`
- Test: `cultimed-store/scripts/test-templates.ts` (temporal)

- [ ] **Step 1: Escribir el test**

```ts
// cultimed-store/scripts/test-templates.ts — npx -y tsx scripts/test-templates.ts
import { renderEmail, renderSms, type NotificationType } from "../lib/notify-templates";

const cases: Array<{ type: NotificationType; data: Record<string, unknown>; mustContain: string[] }> = [
  { type: "receta_aprobada", data: { firstName: "Oscar Zambrano", notes: null },
    mustContain: ["aprobada", "/productos", "Oscar"] },
  { type: "receta_rechazada", data: { firstName: "Oscar", notes: "Falta firma del médico" },
    mustContain: ["Falta firma del médico", "/mi-cuenta/recetas"] },
  { type: "pedido_pago_confirmado", data: { firstName: "Oscar", folio: "CM-0042", totalCLP: "$45.990" },
    mustContain: ["CM-0042", "$45.990", "preparando"] },
  { type: "pedido_despachado", data: { firstName: "Oscar", folio: "CM-0042", tracking: "BX123456789CL" },
    mustContain: ["CM-0042", "BX123456789CL", "camino"] },
  { type: "recompra", data: { firstName: "Oscar", unsubscribeUrl: "https://dispensariocultimed.cl/baja?t=1.abc" },
    mustContain: ["/productos", "https://dispensariocultimed.cl/baja?t=1.abc"] },
  { type: "pedido_abandonado", data: { firstName: "Oscar", folio: "CM-0042", totalCLP: "$45.990", orderId: 42 },
    mustContain: ["CM-0042", "$45.990", "/checkout/42"] },
];

let fails = 0;
for (const c of cases) {
  const { subject, html, text } = renderEmail(c.type, c.data);
  const sms = renderSms(c.type, c.data);
  for (const needle of c.mustContain) {
    const inEmail = html.includes(needle) || text.includes(needle) || subject.includes(needle);
    console.log(`${inEmail ? "✓" : "✗"} ${c.type} email contiene ${JSON.stringify(needle)}`);
    if (!inEmail) fails++;
  }
  const okSms = sms.length > 0 && sms.length <= 300 && !sms.includes("<");
  console.log(`${okSms ? "✓" : "✗"} ${c.type} sms plano y corto (${sms.length} chars)`);
  if (!okSms) fails++;
  const hasLogo = html.includes("cultimed-logo-gold.png");
  console.log(`${hasLogo ? "✓" : "✗"} ${c.type} usa plantilla con logo`);
  if (!hasLogo) fails++;
}
process.exit(fails ? 1 : 0);
```

- [ ] **Step 2: Correr el test para verlo fallar**

Run: `cd cultimed-store && npx -y tsx scripts/test-templates.ts`
Expected: `Cannot find module '../lib/notify-templates'`.

- [ ] **Step 3: Implementar `lib/notify-templates.ts`**

La plantilla base replica el estilo del cron `receta-expiry` (fondo `#0F1A22`, tarjeta `#F7F1E5`, logo dorado, Georgia). Imports relativos.

```ts
// Plantillas de email y SMS por tipo de notificación. Layout editorial oscuro
// (mismo look del cron receta-expiry, que es la plantilla oficial de Cultimed).
export type NotificationType =
  | "receta_aprobada"
  | "receta_rechazada"
  | "pedido_pago_confirmado"
  | "pedido_despachado"
  | "recompra"
  | "pedido_abandonado";

const STORE_BASE =
  process.env.NEXT_PUBLIC_BASE_URL || process.env.STORE_PUBLIC_BASE || "https://dispensariocultimed.cl";
const LOGO =
  "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";
const BANK = {
  name: process.env.NEXT_PUBLIC_BANK_NAME || "",
  accountType: process.env.NEXT_PUBLIC_BANK_ACCOUNT_TYPE || "",
  accountNumber: process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER || "",
  rut: process.env.NEXT_PUBLIC_BANK_RUT || "",
  holder: process.env.NEXT_PUBLIC_BANK_HOLDER || "",
  email: process.env.NEXT_PUBLIC_BANK_EMAIL || "",
};

function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function firstName(data: Record<string, unknown>): string {
  const full = String(data.firstName || "").trim();
  return full ? full.split(" ")[0] : "Hola";
}

function layout(opts: {
  eyebrow: string;
  eyebrowColor?: string;
  titleHtml: string;
  greeting: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  footerExtraHtml?: string;
}): string {
  const { eyebrow, eyebrowColor = "#8b7d5c", titleHtml, greeting, bodyHtml, ctaLabel, ctaUrl, footerExtraHtml = "" } = opts;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0F1A22;font-family:Georgia,serif;color:#1a1a1a;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#0F1A22;">
  <tr><td align="center" style="padding:48px 16px;">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#F7F1E5;border:1px solid #C9B891;">
      <tr><td align="center" style="padding:36px 48px 24px;">
        <img src="${LOGO}" alt="Cultimed" width="160" style="display:block;width:160px;max-width:60%;height:auto;border:0;" />
      </td></tr>
      <tr><td style="padding:24px 48px 16px;">
        <p style="margin:0 0 12px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:${eyebrowColor};">${eyebrow}</p>
        <h1 style="margin:0;font-family:Georgia,serif;font-size:32px;font-weight:300;line-height:1.1;color:#1a1a1a;">${titleHtml}</h1>
      </td></tr>
      <tr><td style="padding:0 48px 32px;font-family:Georgia,serif;font-size:16px;line-height:1.65;color:#3a3530;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;"><tr><td style="height:1px;background:#C9B891;"></td></tr></table>
        <p style="margin:0 0 16px;">${greeting},</p>
        ${bodyHtml}
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px auto 8px;">
          <tr><td align="center" style="background:#0F1A22;border:1px solid #0F1A22;">
            <a href="${ctaUrl}" style="display:inline-block;padding:16px 40px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#F7F1E5;text-decoration:none;">${ctaLabel}</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:24px 48px 32px;border-top:1px solid #C9B891;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;line-height:1.7;color:#8b7d5c;">
        <p style="margin:0;font-size:10px;"><strong style="color:#5d544a;">Cultimed</strong> · Operamos bajo Ley 20.850 y normativa SANNA. ¿Dudas? <a href="mailto:contacto@dispensariocultimed.cl" style="color:#5d544a;text-decoration:underline;">contacto@dispensariocultimed.cl</a></p>
        ${footerExtraHtml}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function renderEmail(
  type: NotificationType,
  data: Record<string, unknown>
): { subject: string; html: string; text: string } {
  const name = firstName(data);
  const greeting = name === "Hola" ? "Hola" : `Hola ${esc(name)}`;
  const notes = data.notes ? String(data.notes) : "";
  const folio = esc(data.folio);
  const totalCLP = esc(data.totalCLP);
  const tracking = data.tracking ? String(data.tracking) : "";

  switch (type) {
    case "receta_aprobada":
      return {
        subject: "Tu receta fue aprobada · Cultimed",
        html: layout({
          eyebrow: "Receta aprobada",
          eyebrowColor: "#3d5c3a",
          titleHtml: `Tu receta fue <em style="font-style:italic;font-weight:400;">aprobada</em>.`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Nuestro químico farmacéutico validó tu documentación. El catálogo completo ya está habilitado para ti — precios, disponibilidad por lote y compra.</p>${notes ? `<p style="margin:0 0 16px;">Nota del revisor: <em>${esc(notes)}</em></p>` : ""}`,
          ctaLabel: "Ver catálogo",
          ctaUrl: `${STORE_BASE}/productos`,
        }),
        text: `${greeting},\n\nTu receta fue aprobada por nuestro químico farmacéutico. Ya puedes comprar en el catálogo completo:\n${STORE_BASE}/productos${notes ? `\n\nNota del revisor: ${notes}` : ""}\n\nCultimed · dispensariocultimed.cl`,
      };
    case "receta_rechazada":
      return {
        subject: "Tu receta requiere corrección · Cultimed",
        html: layout({
          eyebrow: "Receta rechazada",
          eyebrowColor: "#9b3a3a",
          titleHtml: `Tu receta <em style="font-style:italic;font-weight:400;">requiere corrección</em>.`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Revisamos tu documentación y no pudo ser aprobada.</p>${notes ? `<p style="margin:0 0 16px;">Motivo indicado por el revisor: <em>${esc(notes)}</em></p>` : `<p style="margin:0 0 16px;">Tu documentación no cumple los requisitos. Sube nuevos documentos para revisarlos de nuevo.</p>`}`,
          ctaLabel: "Subir nueva receta",
          ctaUrl: `${STORE_BASE}/mi-cuenta/recetas`,
        }),
        text: `${greeting},\n\nTu receta no pudo ser aprobada.${notes ? ` Motivo: ${notes}` : ""}\nSube una nueva en:\n${STORE_BASE}/mi-cuenta/recetas\n\nCultimed · dispensariocultimed.cl`,
      };
    case "pedido_pago_confirmado":
      return {
        subject: `Pago confirmado · Pedido ${folio} · Cultimed`,
        html: layout({
          eyebrow: "Pago confirmado",
          eyebrowColor: "#3d5c3a",
          titleHtml: `Estamos <em style="font-style:italic;font-weight:400;">preparando</em> tu pedido.`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Confirmamos tu transferencia por <strong>${totalCLP}</strong>. Tu pedido <strong>${folio}</strong> pasó a preparación en farmacia y te avisaremos cuando salga a despacho.</p>`,
          ctaLabel: "Seguir mi pedido",
          ctaUrl: `${STORE_BASE}/mi-cuenta/pedidos`,
        }),
        text: `${greeting},\n\nConfirmamos tu pago de ${String(data.totalCLP)}. Tu pedido ${String(data.folio)} está en preparación; te avisamos cuando salga a despacho.\n\nSeguimiento: ${STORE_BASE}/mi-cuenta/pedidos\n\nCultimed · dispensariocultimed.cl`,
      };
    case "pedido_despachado":
      return {
        subject: `Tu pedido ${folio} va en camino · Cultimed`,
        html: layout({
          eyebrow: "Pedido despachado",
          titleHtml: `Tu pedido va <em style="font-style:italic;font-weight:400;">en camino</em>.`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Tu pedido <strong>${folio}</strong> salió a despacho.</p>${tracking ? `<p style="margin:0 0 16px;">Número de seguimiento: <strong style="font-family:monospace;">${esc(tracking)}</strong></p>` : ""}`,
          ctaLabel: "Ver mi pedido",
          ctaUrl: `${STORE_BASE}/mi-cuenta/pedidos`,
        }),
        text: `${greeting},\n\nTu pedido ${String(data.folio)} va en camino.${tracking ? ` Seguimiento: ${tracking}` : ""}\n\n${STORE_BASE}/mi-cuenta/pedidos\n\nCultimed · dispensariocultimed.cl`,
      };
    case "recompra": {
      const unsubscribeUrl = String(data.unsubscribeUrl || "");
      return {
        subject: "¿Se te está acabando? · Cultimed",
        html: layout({
          eyebrow: "Tu tratamiento",
          titleHtml: `¿Se te está <em style="font-style:italic;font-weight:400;">acabando</em>?`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Han pasado unos días desde tu último pedido. Para que no interrumpas tu tratamiento, el catálogo está disponible con tu receta vigente — despacho en 24–72h hábiles.</p>`,
          ctaLabel: "Renovar mi pedido",
          ctaUrl: `${STORE_BASE}/productos`,
          footerExtraHtml: `<p style="margin:8px 0 0;font-size:10px;"><a href="${unsubscribeUrl}" style="color:#8b7d5c;text-decoration:underline;">No quiero recordatorios de recompra</a></p>`,
        }),
        text: `${greeting},\n\nHan pasado unos días desde tu último pedido en Cultimed. Renueva en:\n${STORE_BASE}/productos\n\nPara no recibir recordatorios: ${unsubscribeUrl}\n\nCultimed · dispensariocultimed.cl`,
      };
    }
    case "pedido_abandonado": {
      const orderId = Number(data.orderId);
      const bankHtml = BANK.accountNumber
        ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;background:#EFE7D6;border:1px solid #C9B891;"><tr><td style="padding:16px 20px;font-family:'Helvetica Neue',Arial,sans-serif;font-size:12px;line-height:1.8;color:#3a3530;">
${esc(BANK.holder)} · RUT ${esc(BANK.rut)}<br>${esc(BANK.name)} · ${esc(BANK.accountType)} <strong style="font-family:monospace;">${esc(BANK.accountNumber)}</strong><br>Comprobante a: ${esc(BANK.email)}</td></tr></table>`
        : "";
      return {
        subject: `Tu pedido ${folio} sigue reservado · Cultimed`,
        html: layout({
          eyebrow: "Pedido pendiente de pago",
          eyebrowColor: "#9b3a3a",
          titleHtml: `Tu pedido sigue <em style="font-style:italic;font-weight:400;">reservado</em>.`,
          greeting,
          bodyHtml: `<p style="margin:0 0 16px;">Generaste el pedido <strong>${folio}</strong> por <strong>${totalCLP}</strong> pero no hemos recibido tu transferencia. Sigue reservado — completa el pago y súbenos el comprobante para prepararlo.</p>${bankHtml}`,
          ctaLabel: "Retomar mi pedido",
          ctaUrl: `${STORE_BASE}/checkout/${orderId}`,
        }),
        text: `${greeting},\n\nTu pedido ${String(data.folio)} por ${String(data.totalCLP)} sigue reservado, pendiente de transferencia. Retómalo en:\n${STORE_BASE}/checkout/${orderId}\n\nCultimed · dispensariocultimed.cl`,
      };
    }
  }
}

export function renderSms(type: NotificationType, data: Record<string, unknown>): string {
  const folio = String(data.folio || "");
  switch (type) {
    case "receta_aprobada":
      return `Cultimed: tu receta fue aprobada. Ya puedes comprar en dispensariocultimed.cl/productos`;
    case "receta_rechazada":
      return `Cultimed: tu receta requiere correccion. Sube una nueva en dispensariocultimed.cl/mi-cuenta/recetas`;
    case "pedido_pago_confirmado":
      return `Cultimed: recibimos tu pago del pedido ${folio}. Ya lo estamos preparando.`;
    case "pedido_despachado":
      return `Cultimed: tu pedido ${folio} va en camino.${data.tracking ? ` Seguimiento: ${String(data.tracking)}` : ""}`;
    case "recompra":
      return `Cultimed: han pasado unos dias desde tu ultimo pedido. Renueva en dispensariocultimed.cl/productos`;
    case "pedido_abandonado":
      return `Cultimed: tu pedido ${folio} sigue reservado. Completa la transferencia en dispensariocultimed.cl/checkout/${Number(data.orderId)}`;
  }
}
```

- [ ] **Step 4: Correr el test hasta verde**

Run: `npx -y tsx scripts/test-templates.ts`
Expected: todas las líneas `✓`, exit 0.

- [ ] **Step 5: Borrar test temporal y commitear**

```bash
rm scripts/test-templates.ts
git add lib/notify-templates.ts
git commit -m "lib/notify-templates: plantillas email/SMS de los 6 tipos"
```

---

### Task 4: Núcleo — `lib/notify.ts`

**Files:**
- Create: `cultimed-store/lib/notify.ts`
- Test: `cultimed-store/scripts/test-notify-core.ts` (temporal)

- [ ] **Step 1: Escribir el test**

El test manda una notificación `recompra` de mentira al email de Oscar dos veces: la primera debe quedar `sent` en el log, la segunda debe ser no-op (dedupe). Limpia al final.

```ts
// cultimed-store/scripts/test-notify-core.ts — npx -y tsx scripts/test-notify-core.ts
// OJO: manda UN email real a rincondeoz@gmail.com (deseado — verificación visual).
import { sendNotification } from "../lib/notify";
import { all, run } from "../lib/db";

(async () => {
  const KEY = "test-core-notify";
  await run(`DELETE FROM notification_log WHERE dedupe_key = ?`, KEY);

  const input = {
    type: "recompra" as const,
    customerAccountId: 1,
    recipientEmail: "rincondeoz@gmail.com",
    recipientPhone: "+56993177375",
    dedupeKey: KEY,
    relatedId: 1,
    data: { firstName: "Oscar Test", unsubscribeUrl: "https://dispensariocultimed.cl/baja?t=test" },
  };

  await sendNotification(input);
  await sendNotification(input); // segundo envío: debe deduplicar

  const rows = await all<{ channel: string; status: string; error: string | null }>(
    `SELECT channel, status, error FROM notification_log WHERE dedupe_key = ? ORDER BY channel`, KEY
  );
  console.log(rows);
  let fails = 0;
  const email = rows.filter((r) => r.channel === "email");
  if (email.length === 1 && email[0].status === "sent") console.log("✓ email: 1 fila, sent (dedupe OK)");
  else { console.log("✗ email esperaba 1 fila sent, hay:", email); fails++; }

  await run(`DELETE FROM notification_log WHERE dedupe_key = ?`, KEY);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("✗", e); process.exit(1); });
```

- [ ] **Step 2: Correrlo para verlo fallar**

Run: `cd cultimed-store && npx -y tsx scripts/test-notify-core.ts`
Expected: `Cannot find module '../lib/notify'`.

- [ ] **Step 3: Implementar `lib/notify.ts`**

```ts
// Envío multicanal de notificaciones con deduplicación por DB.
// Canales: email (Resend, activo) · sms (TextBee, dormido hasta setear env) ·
// whatsapp (stub fase 2). El routing por tipo vive en CHANNELS_BY_TYPE.
// Regla de oro: sendNotification NUNCA lanza — registra el error en el log.
import { run } from "./db";
import { renderEmail, renderSms, type NotificationType } from "./notify-templates";
import { normalizePhoneCL } from "./notify-utils";

export type { NotificationType };
export type NotificationChannel = "email" | "whatsapp" | "sms";

// v1: todo por email. Para activar otro canal en un tipo, agregarlo aquí —
// p.ej. pedido_despachado: ["email", "sms"] cuando el relay TextBee esté arriba.
const CHANNELS_BY_TYPE: Record<NotificationType, NotificationChannel[]> = {
  receta_aprobada: ["email"],
  receta_rechazada: ["email"],
  pedido_pago_confirmado: ["email"],
  pedido_despachado: ["email"],
  recompra: ["email"],
  pedido_abandonado: ["email"],
};

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM || "Cultimed <no-reply@dispensariocultimed.cl>";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || "contacto@dispensariocultimed.cl";
const TEXTBEE_API_KEY = process.env.TEXTBEE_API_KEY;
const TEXTBEE_DEVICE_ID = process.env.TEXTBEE_DEVICE_ID;
const TEXTBEE_BASE_URL = process.env.TEXTBEE_BASE_URL || "https://api.textbee.dev/api/v1";

export interface SendNotificationInput {
  type: NotificationType;
  customerAccountId: number;
  recipientEmail: string;
  recipientPhone?: string | null;
  /** Identidad de la instancia del evento — ver spec. Orden: String(orderId); receta: `${accountId}:${uploadedAt}`. */
  dedupeKey: string;
  relatedId: number;
  data: Record<string, unknown>;
}

export async function sendNotification(input: SendNotificationInput): Promise<void> {
  for (const channel of CHANNELS_BY_TYPE[input.type]) {
    try {
      await sendOnChannel(channel, input);
    } catch (e) {
      // Nunca propagar: una notificación caída no puede romper la acción del admin.
      console.error(`notify ${input.type}/${channel} failed:`, e);
    }
  }
}

async function sendOnChannel(channel: NotificationChannel, input: SendNotificationInput): Promise<void> {
  const recipient =
    channel === "email" ? input.recipientEmail : normalizePhoneCL(input.recipientPhone) || "";

  // Reclamar la fila ANTES de enviar: si el INSERT no devuelve id, ya existe
  // (enviada o en curso por otra request) — no enviar de nuevo.
  const ins = await run(
    `INSERT INTO notification_log (customer_account_id, type, channel, recipient, dedupe_key, related_id, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')
     ON CONFLICT (type, channel, dedupe_key) DO NOTHING`,
    input.customerAccountId, input.type, channel, recipient || "(sin destinatario)",
    input.dedupeKey, input.relatedId
  );
  const logId = Number(ins.lastInsertRowid);
  if (!logId) return; // dedupe: ya existe registro para esta instancia

  const finish = (status: string, error: string | null = null) =>
    run(`UPDATE notification_log SET status = ?, error = ? WHERE id = ?`, status, error, logId);

  if (channel === "whatsapp") {
    await finish("skipped_not_configured", "WhatsApp Business API pendiente (fase 2)");
    return;
  }

  if (channel === "sms") {
    if (!TEXTBEE_API_KEY || !TEXTBEE_DEVICE_ID) {
      await finish("skipped_not_configured", "TEXTBEE_API_KEY / TEXTBEE_DEVICE_ID sin setear");
      return;
    }
    if (!recipient) {
      await finish("failed", `teléfono no normalizable: ${JSON.stringify(input.recipientPhone)}`);
      return;
    }
    try {
      const res = await fetch(`${TEXTBEE_BASE_URL}/gateway/devices/${TEXTBEE_DEVICE_ID}/send-sms`, {
        method: "POST",
        headers: { "x-api-key": TEXTBEE_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: [recipient], message: renderSms(input.type, input.data) }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        await finish("failed", `TextBee HTTP ${res.status}: ${body.slice(0, 300)}`);
        return;
      }
      await finish("sent");
    } catch (e: any) {
      await finish("failed", `TextBee: ${e?.message || String(e)}`);
    }
    return;
  }

  // email
  if (!RESEND_API_KEY) {
    await finish("skipped_not_configured", "RESEND_API_KEY sin setear");
    return;
  }
  if (!recipient) {
    await finish("failed", "sin email de destinatario");
    return;
  }
  try {
    const { subject, html, text } = renderEmail(input.type, input.data);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: EMAIL_FROM, to: [recipient], reply_to: EMAIL_REPLY_TO, subject, html, text }),
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      await finish("failed", `Resend: ${body?.message || `HTTP ${res.status}`}`);
      return;
    }
    await finish("sent");
  } catch (e: any) {
    await finish("failed", `Resend: ${e?.message || String(e)}`);
  }
}
```

- [ ] **Step 4: Correr el test hasta verde**

Run: `npx -y tsx scripts/test-notify-core.ts`
Expected: `✓ email: 1 fila, sent (dedupe OK)`, exit 0. Verificar de pasada que llegó UN email "¿Se te está acabando?" a rincondeoz@gmail.com (no dos).

- [ ] **Step 5: Borrar test temporal, build y commit**

Run: `rm scripts/test-notify-core.ts && npm run build`
Expected: build verde.

```bash
git add lib/notify.ts
git commit -m "lib/notify: envio multicanal con dedupe por notification_log"
```

---

### Task 5: Copiar las 3 libs a cultisoft

**Files:**
- Create: `cultisoft/lib/notify-utils.ts`, `cultisoft/lib/notify-templates.ts`, `cultisoft/lib/notify.ts`

- [ ] **Step 1: Copiar los archivos tal cual**

```bash
cp cultimed-store/lib/notify-utils.ts cultisoft/lib/notify-utils.ts
cp cultimed-store/lib/notify-templates.ts cultisoft/lib/notify-templates.ts
cp cultimed-store/lib/notify.ts cultisoft/lib/notify.ts
```

Los tres usan imports relativos (`./db`, `./notify-templates`, `./notify-utils`) y `cultisoft/lib/db.ts` expone la misma API `run` — no requieren cambios. En cultisoft `STORE_PUBLIC_BASE` (ya existente en sus env) alimenta los links de las plantillas.

- [ ] **Step 2: Verificar que cultisoft compila**

Run: `cd cultisoft && npm run build`
Expected: build verde (las libs aún no se importan desde ninguna página; esto valida tipos).

- [ ] **Step 3: Commit**

```bash
git add cultisoft/lib/notify-utils.ts cultisoft/lib/notify-templates.ts cultisoft/lib/notify.ts
git commit -m "cultisoft: copia libs de notificaciones (patron pricing.ts)"
```

---

### Task 6: Página de baja de marketing — `/baja`

**Files:**
- Create: `cultimed-store/app/baja/page.tsx`

- [ ] **Step 1: Implementar la página**

```tsx
import Link from "next/link";
import { run } from "@/lib/db";
import { verifyUnsubscribeToken } from "@/lib/notify-utils";

export const dynamic = "force-dynamic";

export default async function BajaPage({ searchParams }: { searchParams: { t?: string } }) {
  const accountId = verifyUnsubscribeToken(searchParams.t);
  let ok = false;
  if (accountId) {
    await run(
      `UPDATE customer_accounts SET marketing_opt_out = true, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      accountId
    );
    ok = true;
  }

  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-12 py-24 lg:py-32 min-h-[60vh] text-center">
      {ok ? (
        <>
          <p className="eyebrow mb-6">— Listo</p>
          <h1 className="font-display text-display-2 leading-[0.98] mb-6 text-balance">
            <span className="font-light">No te enviaremos más</span>{" "}
            <span className="italic font-normal">recordatorios</span>
            <span className="font-light">.</span>
          </h1>
          <p className="text-base text-ink-muted leading-relaxed max-w-md mx-auto mb-10">
            Quedaste fuera de los recordatorios de recompra. Los avisos sobre tus pedidos
            y recetas (transaccionales) seguirán llegando normalmente.
          </p>
        </>
      ) : (
        <>
          <p className="eyebrow text-sangria mb-6">— Enlace inválido</p>
          <h1 className="font-display text-display-2 leading-[0.98] mb-6 text-balance">
            <span className="font-light">Este enlace</span>{" "}
            <span className="italic font-normal">no es válido</span>
            <span className="font-light">.</span>
          </h1>
          <p className="text-base text-ink-muted leading-relaxed max-w-md mx-auto mb-10">
            El enlace de baja expiró o está incompleto. Escríbenos a
            contacto@dispensariocultimed.cl y te damos de baja a mano.
          </p>
        </>
      )}
      <Link href="/" className="btn-link">Volver al inicio ←</Link>
    </section>
  );
}
```

- [ ] **Step 2: Probar el flujo completo con el dev server**

```bash
cd cultimed-store
# Generar un token real para la cuenta 1:
npx -y tsx -e "import { makeUnsubscribeToken } from './lib/notify-utils'; console.log(makeUnsubscribeToken(1));"
```

Con el dev server corriendo (`npm run dev`), visitar `http://localhost:3000/baja?t=<token impreso>`.
Expected: página "No te enviaremos más recordatorios."

Verificar en DB:

```bash
node -e "
require('fs').readFileSync('.env.local','utf8').split(/\r?\n/).forEach((l)=>{const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];});
const postgres=require('postgres');
(async()=>{const sql=postgres(process.env.DATABASE_URL,{prepare:false,ssl:'require',max:1});
const r=await sql\`SELECT marketing_opt_out FROM customer_accounts WHERE id=1\`;
console.log('opt_out =', r[0].marketing_opt_out);
await sql\`UPDATE customer_accounts SET marketing_opt_out=false WHERE id=1\`; // restaurar para los tests de recompra
console.log('restaurado a false');
await sql.end();})();
"
```

Expected: `opt_out = true` y luego `restaurado a false`. También probar `http://localhost:3000/baja?t=basura` → página "Este enlace no es válido".

- [ ] **Step 3: Commit**

```bash
git add app/baja/page.tsx
git commit -m "Pagina /baja: opt-out de marketing con token firmado"
```

---

### Task 7: Trigger receta revisada (cultisoft)

**Files:**
- Modify: `cultisoft/app/(app)/web-prescriptions/[id]/page.tsx:9` (import), `:54-56` (SELECT), `:82-122` (bloque de email inline)

- [ ] **Step 1: Reemplazar import de email por notify**

En la línea 9, cambiar:

```ts
import { sendEmail, emailLayout } from "@/lib/email";
```

por:

```ts
import { sendNotification } from "@/lib/notify";
```

- [ ] **Step 2: Ampliar el SELECT del customer (líneas 54-56)**

Cambiar:

```ts
  const customer = await get<{ email: string; full_name: string }>(
    `SELECT email, full_name FROM customer_accounts WHERE id = ?`, id
  );
```

por:

```ts
  const customer = await get<{
    email: string; full_name: string; phone: string | null; prescription_uploaded_at: string | null;
  }>(
    `SELECT email, full_name, phone, prescription_uploaded_at FROM customer_accounts WHERE id = ?`, id
  );
```

- [ ] **Step 3: Reemplazar el bloque completo de email inline (líneas 82-122)**

Borrar desde el comentario `// Notificar al paciente por email` hasta el cierre del `if (customer) { ... }` (inclusive, justo antes del `redirect(...)`), y poner:

```ts
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
```

- [ ] **Step 4: Verificar E2E contra la cuenta de prueba**

```bash
# Dejar la receta de la cuenta 1 en 'pending' para poder aprobarla desde la UI:
cd cultimed-store && node -e "
require('fs').readFileSync('.env.local','utf8').split(/\r?\n/).forEach((l)=>{const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];});
const postgres=require('postgres');
(async()=>{const sql=postgres(process.env.DATABASE_URL,{prepare:false,ssl:'require',max:1});
await sql\`UPDATE customer_accounts SET prescription_status='pending' WHERE id=1\`;
console.log('cuenta 1 → pending');await sql.end();})();
"
```

Con el dev de cultisoft corriendo (puerto 3030), entrar como admin a `/web-prescriptions/1`, aprobar con una nota. Expected:
1. Redirect normal a la misma página, estado "Aprobada".
2. Email real "Tu receta fue aprobada · Cultimed" en rincondeoz@gmail.com con la plantilla oscura+logo.
3. `SELECT type, status FROM notification_log WHERE type='receta_aprobada'` → 1 fila `sent`.
4. Aprobar de nuevo NO es posible desde UI (ya está aprobada) — la garantía de dedupe quedó testeada en Task 4.

- [ ] **Step 5: Build y commit**

Run: `cd cultisoft && npm run build`
Expected: verde. `lib/email.ts` NO se borra (la usa el outreach).

```bash
git add "cultisoft/app/(app)/web-prescriptions/[id]/page.tsx"
git commit -m "Receta revisada notifica via lib/notify (dedupe + plantilla nueva)"
```

---

### Task 8: Trigger estados de pedido (cultisoft)

**Files:**
- Modify: `cultisoft/app/(app)/web-orders/[id]/page.tsx` (imports y bloque post-transacción, alrededor de las líneas 260-290)

- [ ] **Step 1: Agregar imports**

Junto a los imports existentes del archivo:

```ts
import { sendNotification } from "@/lib/notify";
import { formatCLP } from "@/lib/format";
```

(Si `formatCLP` ya está importado en el archivo, no duplicarlo.)

- [ ] **Step 2: Insertar la notificación después de la transacción exitosa**

Ubicar el bloque del programa de embajadores (`if (action === "confirm_payment") { try { const res = await recordCommissionForOrder(id); ...`). **Inmediatamente después de ese bloque `if` completo** (y antes del `await logAudit({...})` final), insertar:

```ts
  // Notificar al paciente los hitos que le importan: pago confirmado y despacho.
  // dedupeKey = id de la orden; el type distingue cada hito. Nunca lanza.
  if (action === "confirm_payment" || action === "mark_shipped") {
    const cust = await get<{
      account_id: number; email: string; phone: string | null; full_name: string; total: number;
    }>(
      `SELECT c.id as account_id, c.email, c.phone, c.full_name, o.total
       FROM customer_orders o JOIN customer_accounts c ON c.id = o.customer_account_id
       WHERE o.id = ?`,
      id
    );
    if (cust) {
      await sendNotification({
        type: action === "confirm_payment" ? "pedido_pago_confirmado" : "pedido_despachado",
        customerAccountId: cust.account_id,
        recipientEmail: cust.email,
        recipientPhone: cust.phone,
        dedupeKey: String(id),
        relatedId: id,
        data: {
          firstName: cust.full_name,
          folio: order.folio,
          totalCLP: formatCLP(Number(cust.total)),
          tracking: tracking || null,
        },
      });
    }
  }
```

- [ ] **Step 3: Verificar E2E con un pedido de prueba**

```bash
cd cultimed-store && node -e "
require('fs').readFileSync('.env.local','utf8').split(/\r?\n/).forEach((l)=>{const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];});
const postgres=require('postgres');
(async()=>{const sql=postgres(process.env.DATABASE_URL,{prepare:false,ssl:'require',max:1});
const r=await sql\`INSERT INTO customer_orders (folio, customer_account_id, status, subtotal, total, payment_method)
  VALUES ('TEST-NOTIF-1', 1, 'proof_uploaded', 10000, 10000, 'transfer') RETURNING id\`;
console.log('orden de prueba id =', r[0].id);await sql.end();})();
"
```

En cultisoft (`/web-orders/<id impreso>`), como admin: **Confirmar pago**. Expected:
- Email "Pago confirmado · Pedido TEST-NOTIF-1" en rincondeoz@gmail.com.
- Nota: el pedido no tiene items, así que la deducción de stock es no-op — correcto para esta prueba.

Luego **Marcar despachado** con tracking `TEST123`. Expected: email "Tu pedido TEST-NOTIF-1 va en camino" con el tracking.

Verificar log y limpiar:

```bash
node -e "
require('fs').readFileSync('.env.local','utf8').split(/\r?\n/).forEach((l)=>{const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];});
const postgres=require('postgres');
(async()=>{const sql=postgres(process.env.DATABASE_URL,{prepare:false,ssl:'require',max:1});
const rows=await sql\`SELECT type,status FROM notification_log nl JOIN customer_orders o ON o.id=nl.related_id WHERE o.folio='TEST-NOTIF-1'\`;
console.log(rows); // esperado: pedido_pago_confirmado sent, pedido_despachado sent
await sql\`DELETE FROM notification_log WHERE related_id IN (SELECT id FROM customer_orders WHERE folio='TEST-NOTIF-1')\`;
await sql\`DELETE FROM customer_order_events WHERE order_id IN (SELECT id FROM customer_orders WHERE folio='TEST-NOTIF-1')\`;
await sql\`DELETE FROM customer_orders WHERE folio='TEST-NOTIF-1'\`;
console.log('limpiado');await sql.end();})();
"
```

- [ ] **Step 4: Build y commit**

Run: `cd cultisoft && npm run build` → verde.

```bash
git add "cultisoft/app/(app)/web-orders/[id]/page.tsx"
git commit -m "Pedidos web: notifica pago confirmado y despacho al paciente"
```

---

### Task 9: Cron recordatorio de recompra

**Files:**
- Create: `cultimed-store/app/api/cron/recompra/route.ts`
- Modify: `cultimed-store/vercel.json`

- [ ] **Step 1: Implementar la ruta**

```ts
// Cron diario: recordatorio de recompra. Pacientes cuyo ÚLTIMO pedido pagado
// fue hace ≥5 días y no han vuelto a comprar. Marketing → respeta
// marketing_opt_out e incluye link de baja. Dedupe: 1 email por orden gatillo.
// Auth idéntica a los crons existentes (CRON_SECRET / MIGRATION_SECRET).
import { NextResponse, type NextRequest } from "next/server";
import { all } from "@/lib/db";
import { sendNotification } from "@/lib/notify";
import { makeUnsubscribeToken } from "@/lib/notify-utils";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const REPURCHASE_DAYS = 5;
const STORE_BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://dispensariocultimed.cl";
const PAID_STATUSES = ["paid", "preparing", "ready_for_pickup", "shipped", "delivered"];

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  const expectedManual = process.env.MIGRATION_SECRET ? `Bearer ${process.env.MIGRATION_SECRET}` : null;
  if (auth !== expectedCron && auth !== expectedManual) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Última orden pagada por cliente; candidata si tiene ≥5 días y no hay orden
  // posterior (de cualquier estado no cancelado) del mismo cliente.
  const candidates = await all<{
    order_id: number; account_id: number; email: string; phone: string | null; full_name: string;
  }>(
    `WITH last_paid AS (
       SELECT DISTINCT ON (o.customer_account_id)
         o.id as order_id, o.customer_account_id as account_id, o.created_at,
         c.email, c.phone, c.full_name
       FROM customer_orders o
       JOIN customer_accounts c ON c.id = o.customer_account_id
       WHERE o.status IN ('paid','preparing','ready_for_pickup','shipped','delivered')
         AND c.marketing_opt_out = false
       ORDER BY o.customer_account_id, o.created_at DESC
     )
     SELECT lp.order_id, lp.account_id, lp.email, lp.phone, lp.full_name
     FROM last_paid lp
     WHERE lp.created_at < NOW() - INTERVAL '${REPURCHASE_DAYS} days'
       AND NOT EXISTS (
         SELECT 1 FROM customer_orders o2
         WHERE o2.customer_account_id = lp.account_id
           AND o2.created_at > lp.created_at
           AND o2.status != 'cancelled'
       )`
  );

  let attempted = 0;
  for (const c of candidates) {
    attempted++;
    await sendNotification({
      type: "recompra",
      customerAccountId: c.account_id,
      recipientEmail: c.email,
      recipientPhone: c.phone,
      dedupeKey: String(c.order_id),
      relatedId: c.order_id,
      data: {
        firstName: c.full_name,
        unsubscribeUrl: `${STORE_BASE}/baja?t=${makeUnsubscribeToken(c.account_id)}`,
      },
    });
  }

  return NextResponse.json({ ok: true, candidates: candidates.length, attempted });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
```

Nota: `INTERVAL '5 days'` va interpolado como literal — `REPURCHASE_DAYS` es constante del módulo, no input de usuario (mismo estilo que receta-expiry).

- [ ] **Step 2: Agregar el cron a vercel.json**

En `cultimed-store/vercel.json`, dentro del array `crons`, agregar:

```json
    {
      "path": "/api/cron/recompra",
      "schedule": "20 13 * * *"
    }
```

- [ ] **Step 3: Probar localmente**

```bash
cd cultimed-store
# 1) Envejecer un pedido pagado de la cuenta 1 (crear si no existe):
node -e "
require('fs').readFileSync('.env.local','utf8').split(/\r?\n/).forEach((l)=>{const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];});
const postgres=require('postgres');
(async()=>{const sql=postgres(process.env.DATABASE_URL,{prepare:false,ssl:'require',max:1});
const r=await sql\`INSERT INTO customer_orders (folio, customer_account_id, status, subtotal, total, payment_method, created_at)
  VALUES ('TEST-RECOMPRA-1', 1, 'delivered', 10000, 10000, 'transfer', NOW() - INTERVAL '30 days') RETURNING id\`;
console.log('orden envejecida id =', r[0].id);await sql.end();})();
"
# 2) Obtener el secret (usa el que exista):
grep -E '^(CRON_SECRET|MIGRATION_SECRET)=' .env.local
# 3) Con npm run dev corriendo:
curl -s -H "Authorization: Bearer <SECRET>" http://localhost:3000/api/cron/recompra
```

Expected: `{"ok":true,"candidates":1,"attempted":1}` (al menos 1 — puede haber clientes reales que también califiquen: **revisar el JSON antes y avisar a Oscar si candidates > 1**, porque el cron manda emails reales). Email "¿Se te está acabando?" en rincondeoz con link de baja.

- [ ] **Step 4: Verificar idempotencia (segundo run)**

Run: `curl -s -H "Authorization: Bearer <SECRET>" http://localhost:3000/api/cron/recompra`
Expected: mismo `candidates`, pero **cero emails nuevos** — verificar: `SELECT COUNT(*) FROM notification_log WHERE type='recompra' AND dedupe_key=(SELECT id::text FROM customer_orders WHERE folio='TEST-RECOMPRA-1')` = 1.

- [ ] **Step 5: Limpiar datos de prueba y commitear**

```bash
node -e "
require('fs').readFileSync('.env.local','utf8').split(/\r?\n/).forEach((l)=>{const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];});
const postgres=require('postgres');
(async()=>{const sql=postgres(process.env.DATABASE_URL,{prepare:false,ssl:'require',max:1});
await sql\`DELETE FROM notification_log WHERE related_id IN (SELECT id FROM customer_orders WHERE folio='TEST-RECOMPRA-1')\`;
await sql\`DELETE FROM customer_orders WHERE folio='TEST-RECOMPRA-1'\`;
console.log('limpiado');await sql.end();})();
"
git add app/api/cron/recompra/route.ts vercel.json
git commit -m "Cron recompra: recordatorio a 5 dias del ultimo pedido"
```

---

### Task 10: Cron pedido abandonado

**Files:**
- Create: `cultimed-store/app/api/cron/pedido-abandonado/route.ts`
- Modify: `cultimed-store/vercel.json`

- [ ] **Step 1: Implementar la ruta**

```ts
// Cron diario: pedidos en pending_payment hace más de 24h (y menos de 7 días)
// reciben UN recordatorio con los datos de transferencia y link para retomar.
// Transaccional (es sobre SU pedido) — no respeta opt-out, pero dedupe = 1 por orden.
import { NextResponse, type NextRequest } from "next/server";
import { all } from "@/lib/db";
import { sendNotification } from "@/lib/notify";
import { formatCLP } from "@/lib/format";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const expectedCron = process.env.CRON_SECRET ? `Bearer ${process.env.CRON_SECRET}` : null;
  const expectedManual = process.env.MIGRATION_SECRET ? `Bearer ${process.env.MIGRATION_SECRET}` : null;
  if (auth !== expectedCron && auth !== expectedManual) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const abandoned = await all<{
    order_id: number; folio: string; total: number; account_id: number;
    email: string; phone: string | null; full_name: string;
  }>(
    `SELECT o.id as order_id, o.folio, o.total, c.id as account_id,
       c.email, c.phone, c.full_name
     FROM customer_orders o
     JOIN customer_accounts c ON c.id = o.customer_account_id
     WHERE o.status = 'pending_payment'
       AND o.created_at < NOW() - INTERVAL '24 hours'
       AND o.created_at > NOW() - INTERVAL '7 days'`
  );

  let attempted = 0;
  for (const o of abandoned) {
    attempted++;
    await sendNotification({
      type: "pedido_abandonado",
      customerAccountId: o.account_id,
      recipientEmail: o.email,
      recipientPhone: o.phone,
      dedupeKey: String(o.order_id),
      relatedId: o.order_id,
      data: {
        firstName: o.full_name,
        folio: o.folio,
        totalCLP: formatCLP(Number(o.total)),
        orderId: o.order_id,
      },
    });
  }

  return NextResponse.json({ ok: true, candidates: abandoned.length, attempted });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
```

- [ ] **Step 2: Agregar el cron a vercel.json**

```json
    {
      "path": "/api/cron/pedido-abandonado",
      "schedule": "5 13 * * *"
    }
```

- [ ] **Step 3: Probar localmente**

```bash
cd cultimed-store
node -e "
require('fs').readFileSync('.env.local','utf8').split(/\r?\n/).forEach((l)=>{const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];});
const postgres=require('postgres');
(async()=>{const sql=postgres(process.env.DATABASE_URL,{prepare:false,ssl:'require',max:1});
const r=await sql\`INSERT INTO customer_orders (folio, customer_account_id, status, subtotal, total, payment_method, created_at)
  VALUES ('TEST-ABANDONO-1', 1, 'pending_payment', 45990, 45990, 'transfer', NOW() - INTERVAL '2 days') RETURNING id\`;
console.log('orden abandonada id =', r[0].id);await sql.end();})();
"
curl -s -H "Authorization: Bearer <SECRET>" http://localhost:3000/api/cron/pedido-abandonado
```

Expected: `{"ok":true,...}` con al menos 1 candidato (**avisar a Oscar si hay pedidos reales abandonados que recibirán email en esta prueba**). Email "Tu pedido TEST-ABANDONO-1 sigue reservado" con monto `$45.990`, datos bancarios y CTA a `/checkout/<id>`. Segundo curl → cero emails nuevos.

- [ ] **Step 4: Limpiar y commitear**

```bash
node -e "
require('fs').readFileSync('.env.local','utf8').split(/\r?\n/).forEach((l)=>{const m=l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];});
const postgres=require('postgres');
(async()=>{const sql=postgres(process.env.DATABASE_URL,{prepare:false,ssl:'require',max:1});
await sql\`DELETE FROM notification_log WHERE related_id IN (SELECT id FROM customer_orders WHERE folio='TEST-ABANDONO-1')\`;
await sql\`DELETE FROM customer_orders WHERE folio='TEST-ABANDONO-1'\`;
console.log('limpiado');await sql.end();})();
"
git add app/api/cron/pedido-abandonado/route.ts vercel.json
git commit -m "Cron pedido abandonado: recordatorio de transferencia a las 24h"
```

---

### Task 11: Página admin "Notificaciones" (cultisoft)

**Files:**
- Create: `cultisoft/app/(app)/notifications/page.tsx`
- Modify: `cultisoft/lib/permissions.ts:19` (agregar ruta), `cultisoft/components/Sidebar.tsx:18` (subitem)

- [ ] **Step 1: Registrar la ruta en permisos**

En `cultisoft/lib/permissions.ts`, dentro de `NAV_ACCESS`, después de la línea de `"/patients/outreach"`:

```ts
  "/notifications":     ["superadmin", "admin"],
```

- [ ] **Step 2: Agregar el subitem al Sidebar**

En `cultisoft/components/Sidebar.tsx`, el item Dashboard (línea 18) pasa de:

```ts
  { n: "01", href: "/dashboard",         label: "Dashboard" },
```

a:

```ts
  {
    n: "01",
    href: "/dashboard",
    label: "Dashboard",
    subItems: [
      { href: "/notifications", label: "Notificaciones", roles: ["admin", "superadmin"] },
    ],
  },
```

- [ ] **Step 3: Implementar la página**

```tsx
import { redirect } from "next/navigation";
import { requireStaff, isAdminOrAbove } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import PageHeader from "@/components/PageHeader";
import clsx from "clsx";

export const dynamic = "force-dynamic";

interface LogRow {
  id: number;
  type: string;
  channel: string;
  recipient: string;
  status: string;
  error: string | null;
  created_at: string;
  customer_name: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  receta_aprobada: "Receta aprobada",
  receta_rechazada: "Receta rechazada",
  pedido_pago_confirmado: "Pago confirmado",
  pedido_despachado: "Pedido despachado",
  recompra: "Recompra",
  pedido_abandonado: "Pedido abandonado",
};

const STATUS_CLS: Record<string, string> = {
  sent: "pill-success",
  failed: "pill-error",
  pending: "pill-warning",
  skipped_optout: "pill-neutral",
  skipped_not_configured: "pill-neutral",
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  const staff = await requireStaff();
  if (!isAdminOrAbove(staff)) redirect("/dashboard");

  const type = searchParams.type && TYPE_LABEL[searchParams.type] ? searchParams.type : "";
  const where = type ? `WHERE nl.type = ?` : "";
  const params = type ? [type] : [];

  const rows = await all<LogRow>(
    `SELECT nl.id, nl.type, nl.channel, nl.recipient, nl.status, nl.error, nl.created_at,
       c.full_name as customer_name
     FROM notification_log nl
     LEFT JOIN customer_accounts c ON c.id = nl.customer_account_id
     ${where}
     ORDER BY nl.created_at DESC
     LIMIT 100`,
    ...params
  );

  return (
    <div>
      <PageHeader
        numeral="01a"
        eyebrow="Notificaciones automáticas"
        title="Notificaciones"
        subtitle="Últimos 100 envíos a pacientes: recetas, pedidos, recompra y abandonados."
      />

      <div className="flex flex-wrap gap-2 mb-8">
        <FilterChip active={!type} href="/notifications">Todas</FilterChip>
        {Object.entries(TYPE_LABEL).map(([k, label]) => (
          <FilterChip key={k} active={type === k} href={`/notifications?type=${k}`}>{label}</FilterChip>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted py-16 text-center">Sin envíos registrados todavía.</p>
      ) : (
        <div className="overflow-x-auto border border-rule bg-paper-bright">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className="px-4 py-3 eyebrow">Fecha</th>
                <th className="px-4 py-3 eyebrow">Tipo</th>
                <th className="px-4 py-3 eyebrow">Canal</th>
                <th className="px-4 py-3 eyebrow">Paciente</th>
                <th className="px-4 py-3 eyebrow">Destinatario</th>
                <th className="px-4 py-3 eyebrow">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule-soft">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono text-xs nums-lining whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                  <td className="px-4 py-3">{TYPE_LABEL[r.type] || r.type}</td>
                  <td className="px-4 py-3 font-mono text-xs uppercase">{r.channel}</td>
                  <td className="px-4 py-3">{r.customer_name || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{r.recipient}</td>
                  <td className="px-4 py-3">
                    <span className={clsx(STATUS_CLS[r.status] || "pill-neutral")} title={r.error || undefined}>
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, href, children }: { active: boolean; href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className={clsx(
        "px-4 py-1.5 text-xs uppercase tracking-widest font-medium transition-all duration-200 border",
        active ? "bg-ink text-paper border-ink" : "bg-transparent text-ink border-rule hover:border-ink"
      )}
    >
      {children}
    </a>
  );
}
```

Las props de `PageHeader` (`title`, `subtitle`, `numeral`, `eyebrow`) están verificadas contra `cultisoft/components/PageHeader.tsx`.

- [ ] **Step 4: Verificar en el navegador**

Con cultisoft dev corriendo, visitar `/notifications` como admin. Expected: tabla con los envíos de las pruebas E2E de Tasks 7-10 (receta_aprobada sent, etc.), filtros funcionando, subitem visible bajo Dashboard.

- [ ] **Step 5: Build y commit**

Run: `cd cultisoft && npm run build` → verde.

```bash
git add "cultisoft/app/(app)/notifications/page.tsx" cultisoft/lib/permissions.ts cultisoft/components/Sidebar.tsx
git commit -m "Admin Notificaciones: auditoria de envios con filtro por tipo"
```

---

### Task 12: Script de prueba SMS + guía de canales

**Files:**
- Create: `cultimed-store/scripts/test-sms.js`
- Create: `docs/notificaciones-canales.md`

- [ ] **Step 1: Script de prueba del relay TextBee**

```js
// Prueba el relay TextBee: node scripts/test-sms.js +56912345678 "hola desde cultimed"
// Requiere TEXTBEE_API_KEY y TEXTBEE_DEVICE_ID en .env.local (o exportadas).
require("fs").readFileSync(".env.local", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});

const [, , to, ...msgParts] = process.argv;
const message = msgParts.join(" ") || "Prueba de SMS desde Cultimed (TextBee)";
const { TEXTBEE_API_KEY, TEXTBEE_DEVICE_ID } = process.env;
const BASE = process.env.TEXTBEE_BASE_URL || "https://api.textbee.dev/api/v1";

if (!to || !/^\+56\d{9}$/.test(to)) {
  console.error("Uso: node scripts/test-sms.js +569XXXXXXXX [mensaje]");
  process.exit(1);
}
if (!TEXTBEE_API_KEY || !TEXTBEE_DEVICE_ID) {
  console.error("✗ Falta TEXTBEE_API_KEY / TEXTBEE_DEVICE_ID en .env.local");
  process.exit(1);
}

(async () => {
  const res = await fetch(`${BASE}/gateway/devices/${TEXTBEE_DEVICE_ID}/send-sms`, {
    method: "POST",
    headers: { "x-api-key": TEXTBEE_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ recipients: [to], message }),
  });
  const body = await res.text();
  console.log(res.ok ? `✓ HTTP ${res.status}` : `✗ HTTP ${res.status}`, body.slice(0, 500));
  process.exit(res.ok ? 0 : 1);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
```

Verificación hoy (sin relay): correrlo sin las env vars → `✗ Falta TEXTBEE_API_KEY...` exit 1. La prueba real la hace Oscar cuando su P40 Pro esté conectado.

- [ ] **Step 2: Escribir `docs/notificaciones-canales.md`**

```markdown
# Canales de notificación — guía de activación

El sistema (lib/notify.ts en ambas apps) envía por los canales listados en
`CHANNELS_BY_TYPE`. Hoy: solo email. Para activar un canal en un tipo, agregarlo
al array correspondiente en `cultimed-store/lib/notify.ts` Y `cultisoft/lib/notify.ts`
(mantener ambas copias iguales) y hacer deploy.

## SMS — TextBee (relay propio: P40 Pro + Mac Mini M4)

1. Instalar la app TextBee (https://textbee.dev) en el P40 Pro y registrarlo.
2. En el dashboard de TextBee: copiar la **API key** y el **device ID**.
3. Setear en Vercel (proyectos `cultimed` y `cultimed-wey3`) y en `.env.local`:
   - `TEXTBEE_API_KEY=...`
   - `TEXTBEE_DEVICE_ID=...`
   - `TEXTBEE_BASE_URL=` solo si se self-hostea el gateway en el Mac Mini
     (default: `https://api.textbee.dev/api/v1`).
4. Probar: `cd cultimed-store && node scripts/test-sms.js +569XXXXXXXX "prueba"`.
5. Activar tipos: editar `CHANNELS_BY_TYPE` (recomendado partir con
   `pedido_despachado: ["email", "sms"]` — el aviso con más valor inmediato).

Los teléfonos se normalizan a +569XXXXXXXX con `normalizePhoneCL`; fijos y
números no reconocibles quedan `failed` en el log (el email siempre sale igual).

## WhatsApp — Meta Cloud API (fase 2)

Trámite (días a semanas, hacerlo en paralelo):
1. Verificar el negocio en Meta Business Suite (business.facebook.com) —
   requiere documentos de CULTIMED SPA.
2. Crear una app en developers.facebook.com → producto "WhatsApp".
3. Registrar un número dedicado (NO puede ser el +56 9 9317 7375 si ya usa
   WhatsApp normal — Meta exige número sin cuenta WhatsApp activa, o migrarlo).
4. Crear y pre-aprobar plantillas HSM (una por tipo de notificación; Meta las
   revisa; cannabis medicinal puede requerir categoría "utility" estricta —
   partir con las transaccionales: receta, pago, despacho).
5. Obtener token permanente + phone_number_id.
6. Implementar el adapter en `sendOnChannel` (rama `whatsapp`), que hoy es stub:
   POST a `https://graph.facebook.com/v20.0/{phone_number_id}/messages` con la
   plantilla y variables. Envs sugeridas: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`.

Costo aprox: conversación "utility" ~USD $0.05 c/u en Chile (verificar pricing
vigente de Meta al activar).
```

- [ ] **Step 3: Commit**

```bash
git add cultimed-store/scripts/test-sms.js docs/notificaciones-canales.md
git commit -m "Script test-sms (TextBee) + guia de activacion SMS/WhatsApp"
```

---

### Task 13: Verificación final

**Files:** ninguno nuevo.

- [ ] **Step 1: Builds completos**

Run: `cd cultimed-store && npm run build && cd ../cultisoft && npm run build`
Expected: ambos verdes.

- [ ] **Step 2: Revisión del log completo**

`SELECT type, channel, status, COUNT(*) FROM notification_log GROUP BY 1,2,3` (vía node script como en tasks anteriores).
Expected: solo filas `sent` de las pruebas E2E (receta_aprobada; los TEST-* fueron limpiados). Nada `pending` colgado.

- [ ] **Step 3: Checklist de humo contra la spec**

- [ ] Aprobar receta → email inmediato con plantilla nueva (Task 7 ya lo probó).
- [ ] `/notifications` en cultisoft muestra los envíos con filtros.
- [ ] `vercel.json` tiene 5 crons (3 previos + recompra + pedido-abandonado).
- [ ] `/baja?t=<válido>` da de baja; `?t=basura` muestra error amable.
- [ ] `scripts/test-sms.js` falla limpio sin env vars.

- [ ] **Step 4: Commit final si quedó algo suelto y anunciar listo para merge**

Usar superpowers:finishing-a-development-branch para presentar opciones de integración.

---

## Notas operativas post-merge (para Oscar, no bloquean el plan)

- En Vercel, los crons nuevos quedan activos con el deploy — el primer run real
  de `recompra` puede mandar emails a TODOS los clientes que califiquen (los que
  llevan ≥5 días sin recomprar — con umbral tan corto puede ser una lista GRANDE
  el primer día). Si se quiere un arranque suave, correr primero
  el cron manualmente con curl y revisar `candidates` en la respuesta.
- `EMAIL_FROM` debe ser un dominio verificado en Resend para producción
  (`no-reply@dispensariocultimed.cl`).
