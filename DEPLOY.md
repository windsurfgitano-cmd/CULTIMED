# Deploy Cultimed → Vercel + Supabase

Stack final:
- **Vercel** (free tier) hostea los 2 apps Next.js
- **Supabase** (free tier) provee Postgres + Storage para uploads
- **Cloudflare** (free) maneja DNS

Costo total mensual: **$0** dentro de los free tiers.

---

## 1. Crear proyecto Supabase (5 min)

1. `https://supabase.com/dashboard` → New project
2. Nombre: `cultimed`, región: `South America (São Paulo)` (la más cercana a Chile).
3. Generar password fuerte (guardarlo en un manager).
4. Plan: **Free** (500 MB Postgres + 1 GB Storage incluidos).

### Aplicar el schema
1. SQL Editor → New query
2. Pegar contenido de `supabase/schema.sql`
3. Run.

### Crear los buckets de Storage
1. Storage → New bucket → `prescriptions` → Private (no public) → Create
2. Storage → New bucket → `payment-proofs` → Private → Create

### Anotar credenciales
- Settings → API:
  - `URL` → `NEXT_PUBLIC_SUPABASE_URL`
  - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (¡secreto!)
- Settings → Database → Connection string → **Transaction (port 6543)**:
  - `DATABASE_URL` (esa misma URL con tu password)

---

## 2. Migrar datos locales a Supabase

Una vez aplicado el schema:

```bash
# Desde la raíz del repo, en tu PC local
cd "C:/Users/Ozymandias/Documents/CultiSoft"

# Setear DATABASE_URL apuntando a Supabase
export DATABASE_URL="postgres://postgres.xxxx:[PWD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"

# Correr la migración
node supabase/migrate-data.js
```

El script lee tu SQLite local y replica todo (104 pacientes, 20 productos, recetas, dispensaciones, staff). Es idempotente: si lo corres dos veces, hace UPSERT.

---

## 3. Deploy a Vercel (15 min)

### Crear cuenta y conectar GitHub
1. `https://vercel.com/signup` → Continue with GitHub
2. Authorize Vercel para leer el repo `windsurfgitano-cmd/CULTIMED`

### Service 1: cultimed-store (storefront)
1. Vercel Dashboard → Add New Project → Import `CULTIMED`
2. **Root Directory**: `cultimed-store`
3. Framework: Next.js (auto-detectado)
4. Environment Variables (pegar valores de Supabase):
   ```
   DATABASE_URL=postgres://postgres.xxxx:[PWD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   SUPABASE_SERVICE_ROLE_KEY=eyJ...
   SESSION_SECRET=<openssl rand -hex 32>
   NEXT_PUBLIC_BASE_URL=https://app.dispensariocultimed.cl
   MP_ACCESS_TOKEN=  (vacío hasta tener keys)
   MP_PUBLIC_KEY=    (vacío hasta tener keys)
   NEXT_PUBLIC_BANK_NAME=BancoEstado
   NEXT_PUBLIC_BANK_ACCOUNT_TYPE=Cuenta Corriente
   NEXT_PUBLIC_BANK_ACCOUNT_NUMBER=00012345678
   NEXT_PUBLIC_BANK_RUT=76.123.456-7
   NEXT_PUBLIC_BANK_HOLDER=Cultimed SpA
   NEXT_PUBLIC_BANK_EMAIL=pagos@dispensariocultimed.cl
   ```
5. Deploy.

### Service 2: cultisoft (admin)
1. Vercel Dashboard → Add New Project → Import `CULTIMED` (sí, el mismo repo otra vez)
2. **Root Directory**: `cultisoft`
3. Environment Variables:
   ```
   DATABASE_URL=  (igual al store, misma BD)
   NEXT_PUBLIC_SUPABASE_URL=  (igual)
   SUPABASE_SERVICE_ROLE_KEY=  (igual)
   SESSION_SECRET=<DISTINTO al store, openssl rand -hex 32>
   STORE_PUBLIC_BASE=https://app.dispensariocultimed.cl
   ```
4. Deploy.

### Verificación
- `https://[proyecto-store].vercel.app/api/health` → `{"status":"ok","db":true}`
- `https://[proyecto-admin].vercel.app/api/health` → `{"status":"ok","db":true}`

---

## 4. Custom domains + DNS (Cloudflare)

> **Importante**: `dispensariocultimed.cl` está vivo con Shopify y tiene clientes activos.
> No tocamos el dominio principal. Solo agregamos subdominios.

### Cloudflare
1. Si el dominio NO está en Cloudflare:
   - Add Site → `dispensariocultimed.cl` → Free plan
   - Cambiar nameservers en NIC.cl a los de Cloudflare (15 min – 24h propagación)
2. DNS → Add record:
   - Type: CNAME · Name: `app` · Target: `cname.vercel-dns.com` · Proxy: DNS only (gris)
   - Type: CNAME · Name: `panel` · Target: `cname.vercel-dns.com` · Proxy: DNS only

### Vercel
1. Project store → Settings → Domains → Add → `app.dispensariocultimed.cl`
2. Project admin → Settings → Domains → Add → `panel.cultimed.cl` (o `panel.dispensariocultimed.cl`)
3. Vercel valida y emite SSL automático (Let's Encrypt) en 1-2 minutos.

---

## 5. Smoke test producción

```bash
curl -I https://app.dispensariocultimed.cl/api/health
curl -I https://panel.cultimed.cl/api/health
```

Después en navegador:
1. Storefront: `https://app.dispensariocultimed.cl`
   - Crear cuenta nueva → /mi-cuenta → subir receta → comprobar que llega a Supabase Storage (bucket prescriptions)
2. Admin: `https://panel.cultimed.cl/login`
   - Login con un staff existente (ej `qf.morales@cultimed.cl`)
   - /web-prescriptions → ver la receta del paciente nuevo (signed URL desde Storage)
3. Volver al storefront → catálogo → carrito → checkout transferencia → ver 10% off
4. Subir comprobante → verificar en Supabase Storage bucket payment-proofs
5. Admin → /web-orders → confirmar pago → comisión de embajadores se registra

---

## 6. MercadoPago (cuando tengas las keys)

1. `https://www.mercadopago.cl/developers` → tu app → Producción → Credenciales
2. Vercel → Project store → Settings → Environment Variables → editar:
   - `MP_ACCESS_TOKEN` = `APP_USR-...`
   - `MP_PUBLIC_KEY` = `APP_USR-...`
3. Settings → Deployments → "Redeploy"

En MercadoPago, configurar el webhook URL:
`https://app.dispensariocultimed.cl/api/payments/mp-webhook`

---

## Costos esperados

| Servicio | Free tier | Costo |
|---|---|---|
| Vercel Hobby (2 projects) | 100 GB bandwidth/mes | $0 |
| Supabase Free | 500 MB Postgres + 1 GB Storage + 5 GB bandwidth | $0 |
| Cloudflare DNS | ilimitado | $0 |
| MercadoPago | comisión por venta (no fijo) | variable |
| **TOTAL fijo** | — | **$0 USD/mes** |

Cuando crezca la BD a >500MB pasamos a Supabase Pro ($25/mes con 8GB).

---

## Backups

Supabase Free hace **backups diarios automáticos** retenidos 7 días.
Para production crítico: configurar PITR (point-in-time recovery) en Supabase Pro.

Manual: Database → Backups → Download.

---

## Rollback

Si un deploy falla:
- Vercel → Deployments → click anterior estable → Promote to Production.
- Tarda <30 segundos.
