# Cultimed Launch Day · Cheat Sheet

## 🚀 Disparar batch de 102 emails (post-reunión, desde phone o cualquier PC)

```bash
curl -X POST "https://dispensariocultimed.cl/api/cron/migrate-shopify" \
  -H "Authorization: Bearer BWzJ-ApkayDG5IHdPQPmufmpL9XmPlmO"
```

**Tarda ~10 segundos** (envío en paralelo). Devuelve JSON con `email_ok`, `email_failed`, etc.

### Verificar primero con dry-run (NO envía emails, NO crea cuentas):

```bash
curl -X POST "https://dispensariocultimed.cl/api/cron/migrate-shopify?dry_run=1&limit=3" \
  -H "Authorization: Bearer BWzJ-ApkayDG5IHdPQPmufmpL9XmPlmO"
```

### Cron automático

Vercel cron está armado para fire-and-forget **diariamente a 13:34 UTC** (= 09:34 PC clock UTC-8). El endpoint es **idempotente** — si ya migró ≥80% de los pacientes, retorna `{"skipped":"already_run"}` sin tocar nada.

---

## 🛍️ Apagar Shopify (lo único que solo puedes hacer tú)

DNS ya apunta a Vercel ✅. Pero hay que sacar el dominio del lado Shopify para que ellos liberen el cert SSL viejo.

1. https://admin.shopify.com → tu tienda
2. **Settings → Domains**
3. Ubicar `dispensariocultimed.cl`
4. Click "Remove" (NO "Disconnect" si aparece — quieres remover)
5. Confirmar

Opcionalmente: pausar la tienda en **Settings → Plan → Pause and build** (cobra menos mientras está pausada).

---

## ✅ Estado actual al cierre

| Componente | Estado |
|---|---|
| `dispensariocultimed.cl` | ✅ LIVE (Vercel/Next.js) |
| `www.dispensariocultimed.cl` | ✅ Redirect 308 → apex |
| `app.dispensariocultimed.cl` | ✅ Redirect 308 → apex |
| `panel.dispensariocultimed.cl` | ✅ Cultisoft admin |
| Email migración (logo + hero apothecary) | ✅ Aprobado |
| Pickup farmacia | ✅ Deshabilitado (próximamente) |
| Productos consolidados (7 publicaciones) | ✅ Variant selector + imágenes |
| E2E client + admin | ✅ Probado (folio CM-2026-MOSFFJ35) |
| Vercel cron `/api/cron/migrate-shopify` | ✅ Deployed |
| MIGRATION_SECRET | ✅ Set en Vercel + guardado en `.migration-secret.txt` |

---

## 🆘 Si algo se rompe

| Síntoma | Solución |
|---|---|
| `dispensariocultimed.cl` muestra Shopify viejo | DNS aún propagando. Espera 5-30 min o flush DNS local |
| Endpoint cron 404 | Deploy aún en queue. Ver Vercel dashboard |
| Endpoint 401 | Token mal copiado. Revisa `.migration-secret.txt` |
| Email_failed > 5 | Revisa Resend dashboard, posible bounces |
| Cliente no recibe email | Carpeta spam + revisa Resend logs por dominio |

---

## 📞 Soporte

- Resend dashboard: https://resend.com/dashboard
- Vercel deployments: https://vercel.com/ozymandias1/cultimed
- Cultisoft admin: https://panel.dispensariocultimed.cl (admin@cultimed.cl / admin123)
- Cliente test: rincondeoz@gmail.com / caca123

---

Buen mediodía, jefe. Apaga el PC tranquilo.
