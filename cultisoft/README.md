# CultiSoft

Sistema interno de manejo del dispensario **Cultimed**: pacientes, inventario, recetas, dispensaciones y reportes. MVP funcional, **100% local**, sin dependencias de la nube.

> **Stack:** Next.js 14 (App Router) · SQLite (better-sqlite3) · Tailwind CSS · TypeScript · sin ORM externo · auth con cookie firmada (HMAC + bcrypt)

---

## ⚡ Setup rápido

Requiere **Node.js 20+** instalado.

### Windows

```bat
cd cultisoft
setup.bat
npm run dev
```

### macOS / Linux

```bash
cd cultisoft
chmod +x setup.sh && ./setup.sh
npm run dev
```

Luego abre **http://localhost:3030**.

---

## 👥 Credenciales de prueba

| Usuario                  | Contraseña     | Rol                       |
|--------------------------|----------------|---------------------------|
| `admin@cultimed.cl`      | `admin123`     | Administrador             |
| `farmacia@cultimed.cl`   | `farma123`     | Dispensador               |
| `qf.morales@cultimed.cl` | `quimico123`   | Químico Farmacéutico      |
| `dr.silva@cultimed.cl`   | `doctor123`    | Doctor (staff interno)    |

---

## 📦 Datos cargados — qué es real vs qué es demo

⚠️ El export de Shopify de clientes tiene los campos `Total Spent` y `Total Orders` **contaminados** (montos mezclados entre clientes, órdenes que nunca fueron del cliente). Por eso el seed los ignora explícitamente. El histórico transaccional NO viene del export.

### Modo DEMO (default — `npm run db:reset`)

| Tabla | Origen | ¿Real? |
|---|---|---|
| `staff` (4 cuentas) | Hardcodeado en seed | Demo |
| `doctors` (6) | Sintéticos | Demo |
| `patients` (~104) | `customers_export.csv` — nombres, emails, teléfonos, direcciones, tags de aprobación | ✅ Real |
| `products` (~16) | `products_export_1.csv` — solo los que tienen `Status = active` | ✅ Real |
| `batches` (~16) | Cantidades = `Variant Inventory Qty` × 5 + 25 (boost para demo) | ⚠️ Real con boost |
| `prescriptions` (~35) | Sintéticas con CIE-10 reales, asignadas al azar | Demo |
| `dispensations` (~60) + `dispensation_items` | Sintéticas con totales fabricados | Demo |
| `inventory_movements` | Mezcla: ingresos reales del CSV + salidas sintéticas | Mixto |
| `audit_logs` | Vacío (las acciones reales del staff sí escriben aquí) | Real |

### Modo CLEAN (producción — `npm run db:reset:clean`)

Solo identidad real. Recetas, dispensaciones, movimientos de stock por dispensación y audit logs quedan **vacíos**, listos para que el equipo los vaya creando desde la app real.

| Tabla | Estado en CLEAN |
|---|---|
| `staff`, `doctors`, `patients`, `products`, `batches` | ✅ Cargados (real) |
| `prescriptions`, `dispensations`, `dispensation_items`, `audit_logs` | Vacíos |

> **Para producción:** ejecuta `npm run db:reset:clean` y empieza a usar el sistema desde la web.

---

## 🧭 Módulos

- **Dashboard**: KPIs operacionales, alertas (stock bajo, recetas pendientes, lotes por vencer), dispensaciones recientes y accesos rápidos.
- **Pacientes**: listado con búsqueda y filtros, ficha completa con historial de recetas y dispensaciones, alta de nuevo paciente con validación RUT chileno.
- **Inventario**: vista por lotes con barra de stock, filtros por categoría/stock bajo/por vencer, ingreso de lote nuevo, ajustes manuales, historial de movimientos.
- **Recetas**: listado por estado, ficha de receta con productos prescritos, creación con múltiples productos y posología, cambio de estado (verificar/rechazar).
- **Dispensaciones**: flujo guiado de 3 pasos (Paciente → Carrito → Confirmación), descuento atómico de stock, asociación a receta cuando aplica, comprobante imprimible.
- **Reportes**: ingresos diarios, top productos, top pacientes, breakdown por categoría/método de pago/operador, rangos de 7/30/90/180 días.

---

## 🗂️ Estructura

```
cultisoft/
├── app/
│   ├── (app)/              # rutas autenticadas (layout con TopBar + Sidebar)
│   │   ├── dashboard/
│   │   ├── patients/
│   │   ├── inventory/
│   │   ├── prescriptions/
│   │   ├── dispensations/
│   │   └── reports/
│   ├── login/
│   ├── api/logout/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx            # redirige a /dashboard o /login
├── components/             # KpiCard, Sidebar, TopBar, StatusBadge, etc.
├── lib/
│   ├── db.ts               # conexión SQLite singleton
│   ├── schema.sql          # esquema completo
│   ├── auth.ts             # login/logout/sesión cookie HMAC
│   ├── format.ts           # CLP, fechas, edad, días-hasta
│   ├── rut.ts              # validación RUT chileno
│   └── audit.ts            # log de auditoría
├── scripts/
│   ├── init-db.js          # aplica schema.sql
│   ├── seed.js             # importa CSVs + sintetiza recetas/dispensaciones
│   ├── reset-db.js         # init + seed
│   └── source-data/        # CSVs de Shopify
├── data/cultisoft.db       # DB SQLite (creada en setup)
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── setup.bat / setup.sh
└── README.md
```

---

## 🛠️ Scripts disponibles

| Comando               | Qué hace                                                  |
|-----------------------|-----------------------------------------------------------|
| `npm run dev`         | Inicia servidor en http://localhost:3030                  |
| `npm run build`       | Compila producción                                        |
| `npm run start`       | Sirve build de producción                                 |
| `npm run db:init`        | Aplica `schema.sql` (idempotente)                       |
| `npm run db:seed`        | Llena en **modo DEMO** (real + datos sintéticos)        |
| `npm run db:clean`       | Llena en **modo CLEAN** (solo identidad real)           |
| `npm run db:reset`       | Borra DB y reseedea en modo DEMO                         |
| `npm run db:reset:clean` | Borra DB y reseedea en modo CLEAN (para producción)      |
| `npm run setup`          | Atajo: install + db:reset                                |

---

## 🔐 Auditoría y compliance

Cada acción crítica se registra en `audit_logs` con `staff_id`, `action`, `entity_type`, `entity_id`, `details` (JSON). Esto incluye:
- Login de personal
- Creación de pacientes y recetas
- Cambios de estado de recetas/pacientes
- Dispensaciones (con lotes consumidos y total)
- Ajustes manuales de inventario

Cada movimiento de stock queda en `inventory_movements` (in/out/adjustment/return/recall) con referencia a la dispensación, compra o ajuste manual.

---

## 🎨 Diseño

Estilo **Material Clinical**: paleta azul médica (`#00568e` primary), tipografía Inter, iconografía Material Symbols Outlined. Basado en los mockups de Stitch ubicados en `../stitch/stitch/`. Layout de 240px sidebar fijo + topbar 56px.

---

## 🔮 Próximos pasos sugeridos (post-MVP)

- [ ] Panel Super Admin (gestión de personal, doctores, configuración)
- [ ] Reportes exportables a Excel/PDF
- [ ] Carga de PDF de recetas digitales (S3/local)
- [ ] Notificaciones de stock bajo a Slack/email
- [ ] Integración con SANNA (envío de reportes obligatorios)
- [ ] App móvil para escanear códigos de barra/QR de lotes
- [ ] Sincronización con web pública Cultimed (`../webapp/`)

---

## 📝 Notas técnicas

- **Una BD = un archivo**: todo el estado vive en `data/cultisoft.db`. Backup = copiar el archivo.
- **Sin migraciones**: el schema usa `CREATE TABLE IF NOT EXISTS` y no soporta cambios destructivos. Para evolucionar el schema, edita `lib/schema.sql` y considera reseedear o hacer migración manual.
- **Sesiones**: cookies HMAC firmadas con `SESSION_SECRET` (en `.env.local`). Caducan a los 7 días. Cambia el secret en producción.
- **No envíes** `data/cultisoft.db` a git. El `.gitignore` ya lo excluye.
