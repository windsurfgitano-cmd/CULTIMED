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

Ambas apps comparten una sola base SQLite ubicada en `cultisoft/data/cultisoft.db`.

## Stack

- **Next.js 14** (App Router · Server Actions)
- **better-sqlite3** (BD compartida, file-based)
- **Tailwind CSS** (Editorial Apothecary palette)
- **bcryptjs** + cookies HMAC firmadas (sesiones)

## Setup local

```bash
# 1. Clone
git clone https://github.com/windsurfgitano-cmd/CULTIMED.git
cd CULTIMED

# 2. Cultisoft (admin)
cd cultisoft
npm install
npm run db:init          # crea schema
npm run db:seed          # carga catálogo + staff demo (opcional)
npm run dev              # http://localhost:3030

# 3. Cultimed-store (storefront, en otra terminal)
cd ../cultimed-store
npm install
npm run db:extend        # extiende schema con tablas storefront
npm run dev              # http://localhost:3000
```

## Variables de entorno

### `cultisoft/.env.local`
```
DB_PATH=./data/cultisoft.db
SESSION_SECRET=<random hex 32+ bytes>
STORE_PUBLIC_BASE=http://localhost:3000
```

### `cultimed-store/.env.local`
```
DB_PATH=../cultisoft/data/cultisoft.db
SESSION_SECRET=<random hex 32+ bytes — distinto del admin>
NEXT_PUBLIC_BASE_URL=http://localhost:3000
MP_ACCESS_TOKEN=<MercadoPago access token, prod>
MP_PUBLIC_KEY=<MercadoPago public key, prod>
```

## Deploy

Ver `DEPLOY.md` (TODO).

## Compliance

- Datos clínicos protegidos según Ley 19.628 (Chile · datos sensibles).
- Bitácora de dispensaciones según normativa SANNA.
- Recetas almacenadas 5 años, luego archivo offline.
