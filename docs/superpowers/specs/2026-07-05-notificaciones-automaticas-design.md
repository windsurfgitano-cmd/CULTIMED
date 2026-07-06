# Notificaciones automáticas Cultimed — Diseño

**Fecha:** 2026-07-05
**Estado:** aprobado por Oscar (canal email activo; WhatsApp y SMS preparados)

## Objetivo

Automatizar la comunicación con el paciente en los 4 momentos clave del ciclo
(receta revisada, estados de pedido, recordatorio de recompra, pedido abandonado)
para reducir trabajo manual del equipo y aumentar recompra. Email sale andando hoy
vía Resend (ya configurado). WhatsApp Business API y SMS (relay TextBee) quedan
como canales preparados en el código, listos para activar por variables de entorno.

## Contexto

- Dos apps Next.js (cultisoft admin en `cultisoft/`, tienda en `cultimed-store/`)
  compartiendo un Postgres (Supabase). Patrón establecido: libs pequeñas duplicadas
  entre apps (`lib/pricing.ts`).
- Resend ya funciona: `cultisoft/lib/email.ts` (outreach) y el cron
  `cultimed-store/app/api/cron/receta-expiry/route.ts` (plantilla oscura con logo
  dorado — esta pasa a ser la plantilla oficial).
- `cultimed-store/vercel.json` ya tiene 3 crons; se agregan 2.
- SMS: Oscar está montando un relay TextBee (app Android en Huawei P40 Pro,
  gestionado desde su Mac Mini M4) que expone la API de TextBee con API key.

## Alcance

### Notificaciones (v1, todas por email)

| # | Tipo | Trigger | Contenido |
|---|------|---------|-----------|
| 1 | `receta_aprobada` | Server action de revisión QF en `cultisoft/app/(app)/web-prescriptions/[id]/page.tsx` (tras el `UPDATE prescription_status`) | "Tu receta fue aprobada" + CTA "Ver catálogo →" |
| 2 | `receta_rechazada` | Mismo action, rama rechazo | "Fue rechazada: [motivo del QF]" + CTA "Subir nueva receta →" |
| 3 | `pedido_pago_confirmado` | Server action de `cultisoft/app/(app)/web-orders/[id]/page.tsx`, transición `mark_paid` | "Recibimos tu pago, estamos preparando tu pedido" + resumen |
| 4 | `pedido_despachado` | Mismo action, transición `mark_shipped` | "Tu pedido va en camino" + tracking si existe |
| 5 | `recompra` | Cron diario `cultimed-store/app/api/cron/recompra/route.ts` | Último pedido pagado hace ≥25 días, sin pedido posterior → "¿Se te está acabando?" + CTA catálogo. Marketing: incluye link de baja. |
| 6 | `pedido_abandonado` | Cron diario `cultimed-store/app/api/cron/pedido-abandonado/route.ts` | Pedidos `pending_payment` entre 24h y 7 días → datos de transferencia + total + CTA "Retomar mi pedido →" |

Nota de alcance: los emails de receta aprobada/rechazada **ya existen inline** en
el action del QF (plantilla vieja, sin registro, sin protección contra doble
clic). El trabajo ahí es migrarlos a `notify.ts` — misma conducta visible, pero
con log, dedupe y la plantilla nueva.

Reglas duras:
- **Un solo envío por (tipo, canal, dedupe_key)** — garantizado por constraint
  UNIQUE en `notification_log`, no por lógica de aplicación. La `dedupe_key`
  identifica la *instancia* del evento:
  - pedidos (pago/despacho/abandonado/recompra): el id de la orden.
  - recetas: `{accountId}:{prescription_uploaded_at}` — así el doble clic del QF
    no duplica, pero la renovación de receta del próximo año (nueva subida) sí
    genera su email.
- Los triggers de cultisoft son **fire-and-forget**: si Resend falla, la acción
  del admin NO falla; el intento queda `failed` en el log.
- Recompra respeta `marketing_opt_out`. Receta/pedidos/abandonado son
  transaccionales (siempre se envían; abandonado máximo 1 vez por pedido).

### Migración de datos

```sql
CREATE TABLE notification_log (
  id serial PRIMARY KEY,
  customer_account_id int REFERENCES customer_accounts(id),
  type text NOT NULL,        -- receta_aprobada | receta_rechazada | pedido_pago_confirmado | pedido_despachado | recompra | pedido_abandonado
  channel text NOT NULL DEFAULT 'email',   -- email | whatsapp | sms
  recipient text NOT NULL,   -- email o teléfono E.164 según canal
  dedupe_key text NOT NULL,  -- ver "Reglas duras": id de orden, o accountId:uploadedAt para recetas
  related_id int,            -- customer_orders.id o customer_accounts.id (informativo, para joins en admin)
  status text NOT NULL,      -- sent | failed | skipped_optout | skipped_not_configured
  error text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (type, channel, dedupe_key)
);

ALTER TABLE customer_accounts ADD COLUMN marketing_opt_out boolean NOT NULL DEFAULT false;
```

Script de migración estilo repo: `cultimed-store/scripts/extend-schema-notifications.js`
(plain JS, lee `.env.local`, idempotente con `IF NOT EXISTS`).

### Lib multicanal `lib/notify.ts` (duplicada en cultisoft y cultimed-store)

```ts
type NotificationChannel = "email" | "whatsapp" | "sms";
type NotificationType = "receta_aprobada" | "receta_rechazada"
  | "pedido_pago_confirmado" | "pedido_despachado" | "recompra" | "pedido_abandonado";

// Routing por tipo: qué canales intenta cada notificación.
// v1: todo email. Para activar SMS/WhatsApp en un tipo: agregar el canal aquí.
const CHANNELS_BY_TYPE: Record<NotificationType, NotificationChannel[]> = { ... };

async function sendNotification(input: {
  type: NotificationType;
  customerAccountId: number;
  recipientEmail: string;
  recipientPhone?: string | null;
  dedupeKey: string;              // ver "Reglas duras" — el caller la construye
  relatedId: number;              // informativo (joins en admin)
  data: Record<string, unknown>;  // nombres, montos, tracking, motivo rechazo, etc.
}): Promise<void>
```

Flujo interno por canal: `INSERT INTO notification_log ... ON CONFLICT DO NOTHING`
→ si no insertó fila, ya se envió antes: no hace nada → renderiza plantilla →
envía → `UPDATE status`.

Adapters:
- **email**: fetch a `https://api.resend.com/emails` (patrón existente), plantilla
  unificada = la del cron receta-expiry (fondo `#0F1A22`, logo dorado desde
  Supabase Storage, tipografía Georgia). Cada tipo tiene su asunto/título/cuerpo/CTA.
- **sms (TextBee)**: `POST {TEXTBEE_BASE_URL}/gateway/devices/{TEXTBEE_DEVICE_ID}/send-sms`
  con header `x-api-key: TEXTBEE_API_KEY`, body `{ recipients: [phoneE164], message }`.
  Env vars: `TEXTBEE_API_KEY`, `TEXTBEE_DEVICE_ID`, `TEXTBEE_BASE_URL`
  (default `https://api.textbee.dev/api/v1`; apuntable al Mac Mini si Oscar
  self-hostea). Sin las vars → `skipped_not_configured`. Mensajes SMS: versión
  corta de cada plantilla (≤160 chars, sin HTML, con link corto).
- **whatsapp**: stub que registra `skipped_not_configured`. Interface lista para
  Meta Cloud API (fase 2).

Utilidad `normalizePhoneCL(raw: string): string | null` → E.164 chileno
(`+569XXXXXXXX`); tolera formatos `9 1234 5678`, `56912345678`, con/sin `+`,
puntos y espacios. Si no se puede normalizar → el canal SMS se salta con `failed`
y error descriptivo (email sigue saliendo).

### Baja de marketing (unsubscribe)

- Página `cultimed-store/app/baja/page.tsx` (server component): recibe `?t=<token>`
  donde token = HMAC firmado con `SESSION_SECRET` sobre el id de cuenta (mismo
  patrón de firma que `lib/auth.ts`). Con token válido setea
  `marketing_opt_out = true` y muestra confirmación con el estilo editorial del
  sitio; token inválido muestra error amable. Sin login.
- El email de recompra incluye el link en el footer: "No quiero recordatorios de
  recompra".

### Crons nuevos (cultimed-store)

- `app/api/cron/recompra/route.ts` y `app/api/cron/pedido-abandonado/route.ts`,
  con la misma autenticación y estructura que los crons existentes.
- `vercel.json`: dos entradas nuevas con horarios tipo `0 13 * * *` (≈9-10am Chile)
  separados por algunos minutos.
- Query recompra: última orden por cliente con status pagado/entregado, `created_at
  <= now() - interval '25 days'`, sin orden posterior de ese cliente, sin
  `marketing_opt_out`, sin registro previo en `notification_log` para esa orden.
- Query abandonado: órdenes `pending_payment` con `created_at` entre 7 días y 24
  horas atrás, sin registro previo.

### Página admin "Notificaciones" (cultisoft)

- `cultisoft/app/(app)/notifications/page.tsx`: tabla server-rendered de los
  últimos 100 registros de `notification_log` (fecha, tipo, canal, destinatario,
  estado, error si hubo), con filtro por tipo vía searchParam. Sin acciones de
  escritura en v1.
- Nav: subitem "Notificaciones" bajo Dashboard en `components/Sidebar.tsx`
  (roles admin/superadmin) + entrada en `lib/permissions.ts`.

### Documentación de canales pendientes

`docs/notificaciones-canales.md` en el repo raíz:
1. **WhatsApp Business API**: pasos del trámite Meta (verificar Meta Business,
  número dedicado, plantillas HSM pre-aprobadas, tokens) y dónde enchufarlo en
  `lib/notify.ts`.
2. **TextBee**: cómo obtener API key + device id en textbee.dev, qué env vars
  setear en Vercel, cómo probar con `scripts/test-sms.js` (script incluido que
  manda un SMS de prueba al número que le pases).

## Verificación

- Migración corrida contra la DB real (idempotente).
- Unit-level: `normalizePhoneCL` con casos chilenos típicos (script de test plain JS).
- E2E manual con la cuenta `rincondeoz@gmail.com`: aprobar receta → llega email;
  confirmar pago → email; despachar → email; forzar fechas en DB para simular
  recompra y abandonado → correr crons localmente con curl → llegan emails y el
  log queda `sent`; segundo run del cron → 0 envíos (idempotencia).
- Página admin muestra los envíos.
- `npm run build` verde en ambas apps.

## Fuera de alcance (v1)

- Envío real por WhatsApp (requiere aprobación Meta — fase 2).
- Activación de SMS en producción (depende del relay TextBee de Oscar; el código
  queda listo y probado contra la API con un script).
- Reintentos automáticos de envíos `failed` (el log los deja visibles; retry
  manual re-corriendo la acción si algún día hace falta).
- Preferencias de canal por paciente (v1: routing global por tipo en
  `CHANNELS_BY_TYPE`).
