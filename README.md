# Cultimed — Plataforma Dispensario

Plataforma interna + storefront del dispensario Cultimed (Chile · regulado SANNA).

## Estructura del monorepo

```
cultimed/
├── cultisoft/         # Admin / panel interno (puerto 3030)
├── cultimed-store/    # Storefront público (puerto 3000)
├── PLANCULTIMED.md    # Doc operacional del equipo
└── cultimed-v3-documento-maestro.md  # Doc de identidad visual y arquitectura
```

Ambas apps operan contra una base Postgres/Supabase compartida en producción. El histórico SQLite (`cultisoft/data/cultisoft.db`) puede existir localmente, pero el runtime actual (`lib/db.ts`) espera `DATABASE_URL` o `POSTGRES_URL`.

## Stack

- **Next.js 14** (App Router · Server Actions)
- **Postgres/Supabase** vía `postgres-js`
- **Supabase Storage** para documentos/recetas/comprobantes
- **Tailwind CSS** (Editorial Apothecary palette)
- **bcryptjs** + cookies HMAC firmadas (sesiones)

## Setup local

```bash
# 1. Clone
 git clone https://github.com/windsurfgitano-cmd/CULTIMED.git
 cd CULTIMED

# 2. Instalar apps principales
cd cultimed-store && npm install
cd ../cultisoft && npm install

# 3. Configurar env
# Ambas apps necesitan DATABASE_URL o POSTGRES_URL.
# cultimed-store también necesita NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY para Storage.

# 4. Dev servers
cd ../cultimed-store && npm run dev   # http://localhost:3000
cd ../cultisoft && npm run dev        # http://localhost:3030
```

## QA / Smoke tests

```bash
# Desde la raíz del repo
node scripts/smoke-test.mjs              # smoke producción/rutas/API gates
node scripts/e2e-full-flow-direct.mjs    # registro→docs→aprobación→compra→pago→stock con rollback
node scripts/qa-full-check.mjs           # builds + smoke + E2E
```

Ver detalles en `QA-RUNBOOK.md`.

## Variables de entorno

### `cultisoft/.env.local`
```
DATABASE_URL=<postgres/supabase connection string>
SESSION_SECRET=<random hex 32+ bytes>
STORE_PUBLIC_BASE=http://localhost:3000
# opcional para emails desde admin:
RESEND_API_KEY=<resend key>
EMAIL_FROM=<from>
EMAIL_REPLY_TO=<reply-to>
```

### `cultimed-store/.env.local`
```
DATABASE_URL=<postgres/supabase connection string>
SESSION_SECRET=<random hex 32+ bytes — distinto del admin>
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=<supabase url>
SUPABASE_SERVICE_ROLE_KEY=<service role key, server-side only>
# Datos bancarios públicos (checkout transferencia) — ver cultimed-store/.env.example
```

## Deploy

Ver `DEPLOY.md`.

## Compliance

- Datos clínicos protegidos según Ley 19.628 (Chile · datos sensibles).
- Bitácora de dispensaciones según normativa SANNA.
- Recetas almacenadas 5 años, luego archivo offline.
