# Deploy de Cultimed a Producción

> **Stack elegido:** Railway (host) + Cloudflare (DNS) + Resend (email transaccional, fase 2).

## Arquitectura productiva

```
                      ┌────────────────────────────────┐
                      │  Cloudflare DNS                │
                      │  dispensariocultimed.cl  →     │
                      │  app.dispensariocultimed.cl    │  ← storefront público
                      │  panel.cultimed.cl             │  ← admin interno
                      └────────────┬───────────────────┘
                                   │
                  ┌────────────────┴───────────────┐
                  │     Railway Project            │
                  │                                │
                  │  ┌─────────────┐  ┌─────────┐  │
                  │  │ cultimed-   │  │ culti-  │  │
                  │  │   store     │  │  soft   │  │
                  │  │  :3000      │  │  :3030  │  │
                  │  └──────┬──────┘  └────┬────┘  │
                  │         │               │       │
                  │         └───────┬───────┘       │
                  │                 │                │
                  │     ┌───────────┴────────┐      │
                  │     │  Volumen /data     │      │
                  │     │  cultisoft.db      │      │
                  │     │  uploads/*         │      │
                  │     └────────────────────┘      │
                  └────────────────────────────────┘
```

Ambas apps comparten un mismo volumen persistente. Esto permite:
- BD SQLite única (datos coherentes admin ↔ store).
- Uploads de recetas y comprobantes accesibles desde ambas apps.

---

## Paso a paso: setup Railway (primer deploy)

### 1. Crear cuenta Railway
- `https://railway.app` → Login con GitHub
- Plan: Hobby ($5/mes, suficiente para hoy)

### 2. Crear proyecto desde GitHub
- New Project → Deploy from GitHub repo
- Selecciona `windsurfgitano-cmd/CULTIMED`
- Cuando pregunte por el directorio root: lo dejas en `/` (monorepo, vamos a crear 2 services).

### 3. Crear el primer service: cultimed-store
- Settings → Service → Root Directory: `cultimed-store`
- Settings → Build → Dockerfile path: `Dockerfile`
- Settings → Networking → Generate Domain (Railway-provided, ej: `cultimed-store-production.up.railway.app`)

### 4. Volume persistente (CRÍTICO)
- En el service `cultimed-store`:
- Variables → Volume → New Volume
  - Name: `cultimed-data`
  - Mount path: `/data`
- Esto monta un disco persistente de Railway en `/data` dentro del container.

### 5. Variables de entorno del store

Variables → New Variable, agregar uno por uno:

| Variable | Valor |
|---|---|
| `DB_PATH` | `/data/cultisoft.db` |
| `SESSION_SECRET` | `<openssl rand -hex 32>` (genera uno único) |
| `NEXT_PUBLIC_BASE_URL` | `https://app.dispensariocultimed.cl` (después del DNS) |
| `MP_ACCESS_TOKEN` | (vacío hasta que tengamos las keys de MercadoPago) |
| `MP_PUBLIC_KEY` | (vacío) |
| `NODE_ENV` | `production` |

### 6. Crear el segundo service: cultisoft
- New → Empty Service (o New → GitHub Repo y reusar el repo)
- Settings → Source → Repo: `windsurfgitano-cmd/CULTIMED` · Root: `cultisoft`
- Settings → Build → Dockerfile path: `Dockerfile`

### 7. Compartir el volumen entre los dos services
- En el service `cultisoft`:
- Variables → Volume → Attach existing volume → seleccionar `cultimed-data`
- Mount path: `/data`

### 8. Variables de entorno del admin

| Variable | Valor |
|---|---|
| `DB_PATH` | `/data/cultisoft.db` |
| `SESSION_SECRET` | `<openssl rand -hex 32>` (DISTINTO del store) |
| `STORE_PUBLIC_BASE` | `https://app.dispensariocultimed.cl` |
| `NODE_ENV` | `production` |

### 9. Inicializar la BD por primera vez
La primera vez que arranca, la BD no existe. Hay que correrlo manualmente:

**Desde la consola de Railway** (cultisoft service → tab Shell, o Railway CLI):
```bash
node scripts/init-db.js          # crea schema base
# El extend-schema lo correrá el cultimed-store al arrancar (ver más abajo).
```

**O** subir tu BD local actual al volumen:
```bash
# En tu terminal local
railway login
railway link  # selecciona el proyecto Cultimed
railway run --service cultimed-store \
  bash -c "cat > /data/cultisoft.db" < cultisoft/data/cultisoft.db
```

### 10. Migrate al primer deploy (extender schema con tablas storefront + payments + referrals)
Después del primer deploy del cultimed-store, en su Shell:
```bash
DB_PATH=/data/cultisoft.db npm run db:migrate
```

### 11. Generar dominios
- Cada service tiene un subdomain `*.up.railway.app` por default. Verifica que ambas apps respondan en sus dominios.
- Smoke test: `curl https://cultimed-store-production.up.railway.app/api/health`

---

## Paso a paso: DNS (Cloudflare)

> Esto NO afecta a `dispensariocultimed.cl` (que sigue apuntando a Shopify).
> Solo agregamos subdominios nuevos.

### 1. Si el dominio aún no está en Cloudflare
- Login Cloudflare → Add Site → `dispensariocultimed.cl`
- Cloudflare detecta los DNS records actuales (A, MX, CNAME).
- En tu registrar (NIC.cl o donde tengas `.cl`), cambia los nameservers a los de Cloudflare (te los muestra al agregar el sitio).
- Espera propagación (15 min – 24h).

### 2. Agregar subdominios CNAME a Railway
- En el panel de Cloudflare → DNS → Add record:
  - Type: CNAME
  - Name: `app`
  - Target: `cultimed-store-production.up.railway.app` (el dominio Railway)
  - Proxy status: Proxied (naranja, mejor) o DNS only (gris)
- Idem para `panel`:
  - Type: CNAME · Name: `panel` · Target: `cultisoft-production.up.railway.app`

### 3. Configurar custom domains en Railway
- Service cultimed-store → Settings → Networking → Custom Domain → `app.dispensariocultimed.cl`
- Railway emite cert SSL automático (Let's Encrypt) en 1-2 minutos.
- Idem para `panel.cultimed.cl` en el cultisoft service.

### 4. Verificar HTTPS
- `curl -I https://app.dispensariocultimed.cl/api/health` → 200 OK
- `curl -I https://panel.cultimed.cl/api/health` → 200 OK

---

## Smoke test post-deploy

1. Login admin: `https://panel.cultimed.cl/login`
   - Use credenciales de un staff existente (ej. `qf.morales@cultimed.cl`).
2. Storefront: `https://app.dispensariocultimed.cl`
   - Registrar cuenta nueva → subir receta de prueba → admin valida.
3. Checkout transferencia → ver descuento 10% aplicado.
4. Subida de comprobante → admin confirma pago → status correcto.
5. (Cuando MP esté activo) Checkout MP → completar pago en sandbox MP → webhook recibe → status auto.
6. `/embajadores` → renderiza FAQ.
7. `/mi-cuenta/embajador` (con receta aprobada) → ver código + QR.

---

## Backups

### Local (manual, desde tu PC mientras desarrollas)
```bash
# Antes de cualquier cambio importante
cp cultisoft/data/cultisoft.db _backups/cultisoft-$(date +%Y%m%d-%H%M%S).db
```

### Railway (automatizar para producción)
Crear un cron job en Railway que:
1. Cada 6h hace `cp /data/cultisoft.db /data/backups/cultisoft-$(date).db`
2. Sube a Backblaze B2 con `rclone` (TODO post-launch).

---

## Rollback de emergencia

Si el deploy falla:
- Railway → Deployments → click en el deploy anterior estable → Redeploy.
- DNS → si Cloudflare está proxied, cambias DNS al deploy estable inmediato.

---

## Costos esperados

| Servicio | Costo/mes |
|---|---|
| Railway Hobby (2 services + volumen) | ~$10 USD |
| Cloudflare DNS | $0 |
| MercadoPago | comisión por venta (no fijo) |
| **TOTAL fijo** | **~$10 USD/mes** |

Cuando crezca el tráfico (>1k visitas diarias), evaluar Hetzner CX22 (€6/mes) con docker-compose.
