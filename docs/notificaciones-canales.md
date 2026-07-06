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
