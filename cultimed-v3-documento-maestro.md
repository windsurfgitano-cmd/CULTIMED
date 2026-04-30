 # CULTIMED v3 — DOCUMENTO MAESTRO DE IMPLEMENTACIÓN
**Versión:** 3.0  
**Fecha:** 2026-04-28  
**Agente autor:** OSCARBOT / Hermes  
**Destinatario:** EQUIPO
**Estado:** PRODUCCIÓN — Listo para implementar

---

## RIGEN/CONCEPTO CENTRAL

> **"El dispensario de Chile que se mira en el espejo de una clínica suiza o una farmacia de Harvard — pero habla como un paciente chileno."**

No es un headshop. No es una tienda de vapers. Es una **plataforma de acceso a medicina**.

- Premium = Sí.
- Expuesto/llamativo de forma recreativa = NO.
- Discreto, autoritario, cálido = Sí.
- El usuario cuando entra debe sentir: *"Esto es más serio que mi clínica, pero no me trata como enfermo"*.

---

## 1. DISEÑO VISUAL — GUÍA COMPLETA

### 1.1 Paleta Oficial
| Rol | Hex | Uso |
|---|---|---|
| **Navy Profundo** | `#0A1628` | Fondo base. Esto NO es negro puro, es azul muy oscuro con carga hospitalaria pero sofisticada. |
| **Verde Bosque** | `#1A3A2F` | Color de acento medicinal. No verde neón. Verde de laboratorio/pino. |
| **Dorado / Ámbar** | `#C9A96E` | Color premium. Botones primarios, acentos, iconografía destacada. |
| **Blanco Hueso** | `#F5F2EC` | Tipografía principal sobre dark. Más cálido que blanco puro. |
| **Gris Piedra** | `#8B95A5` | Texto secundario, metadatos, captions. |
| **Rojo Sangría** | `#8B3A3A` | Advertencias legales, tags de receta requerida, alertas médicas. Nunca para marketing. |

### 1.2 Tipografía
| Jerarquía | Fuente | Peso | Tracking | Notas |
|---|---|---|---|---|
| **H1 / Display** | `Tiempos Text` o `Playfair Display` | 700 | -0.02em | Serif con autoridad médica/editorial. Úsala para títulos de sección, hero, nombres de producto. |
| **H2-H4 / UI** | `Geist` o `Inter` | 500-600 | 0em | Sans-serif SC (small caps) para etiquetas de categoría: "ACEITES", "CÁPSULAS". Uppercase + tracking widened. |
| **Cuerpo** | `Geist` / `Inter` | 400 | 0.01em | Tamaño 16px base. Leading 1.6. |
| **Micro / Legal** | `Geist Mono` / `JetBrains Mono` | 400 | 0.05em | Disclaimer, COA data, lotes. Tiene que sentirse como un documento médico. |

### 1.3 UI Patterns Premium (NO Tailwind-genérico)
- **Gradientes:** NUNCA gradientes psicodélicos. Solo gradientes sutiles:
  - `linear-gradient(135deg, #0A1628 0%, #1A3A2F 100%)` para fondos de sección.
  - `linear-gradient(90deg, transparent, #C9A96E20, transparent)` como hairline divisor.
- **Bordes:** Radios pequeños (6-8px) para tarjetas médicas. NO 24px bubbly.
- **Glassmorphism:** Permitido solo en modales (age gate, login médico). Con `backdrop-blur-md` y `bg-white/3 border-white/10`.
- **Sombras:** Sutil. `box-shadow: 0 4px 20px rgba(0,0,0,0.4)`. Nada de glows de neón.
- **Iconografía:** Lucide icons. Todos con strokeWidth=1.5. Nunca emojis.
- **Espaciado:** Generoso. Secciones con padding `py-24` mínimo. El aire es lujo.

### 1.4 Referentes de Diseño a Emular
| Sitio | Qué copiar | Qué NO copiar |
|---|---|---|
| **Aesop** (aesop.com) | Tipografía serif + espaciado generoso + minimalismo editorial | Sus precios visibles libremente (nosotros ocultamos) |
| **The Botanist** (thebotanist.care) | Verde bosque + dorado. Estética apothecary. | El tono recreativo de algunas secciones |
| **MedMen** (medmen.com) | Estructura e-commerce limpia, minimalista | Colores recreativos |
| **Mayo Clinic** (mayoclinic.org) | Autoridad médica, disclaimers prominentes, jerarquía clara | El diseño clínico frío — nosotros somos más cálidos |

### 1.5 Animaciones Permitidas
- Fade-up suave en scroll (intersection observer, 0.6s, ease-out).
- Micro-interacciones en botones: scale(1.02) + shadow on hover.
- **PROHIBIDO:** Glitch effects, particles de humo, animaciones de hojas moviéndose, loaders psicodélicos.

---

## 2. ARQUITECTURA DE NAVEGACIÓN & PÁGINAS

### 2.1 Páginas obligatorias
| Ruta | Descripción | Acceso |
|---|---|---|
| `/` | Home / Portal | Público (con age gate) |
| `/ingresar` | Login paciente | Público |
| `/registro` | Registro paciente (con validación de identidad) | Público |
| `/productos` | Catálogo informativo | Público (sin precios/stock) |
| `/productos/[slug]` | Ficha técnica de producto | Público (detalle, sin precios/stock) |
| `/consulta` | Agendar consulta médica online | Público |
| `/trazabilidad` | Rastrear mi pedido/lote | Paciente logueado |
| `/compliance` | Normativa y regulación | Público |
| `/privacidad` | Política de privacidad (Ley 19.628) | Público |
| `/terminos` | Términos de uso | Público |
| `/derechos-paciente` | Derechos del paciente | Público |
| `/mi-cuenta` | Dashboard paciente | Paciente logueado |
| `/mi-cuenta/recetas` | Mis recetas médicas | Paciente logueado |
| `/mi-cuenta/pedidos` | Historial de pedidos | Paciente logueado |
| `/carrito` | Carrito de compras (items ocultos hasta validación) | Paciente logueado + receta validada |
| `/checkout` | Proceso de pago (transferencia) | Paciente logueado + receta validada |
| `/confirmacion` | Página post-compra con instrucciones de transferencia | Paciente |
| `/admin` | Panel administrativo | Admin/Staff |
| `/admin/pedidos` | Gestión de pedidos + comprobantes | Admin/Staff |
| `/admin/transferencias` | Tracking de transferencias entrantes | Admin/Staff |
| `/admin/envios` | Gestión de envíos y trazabilidad post-venta | Admin/Staff |

### 2.2 Navegación Principal
```
[LOGO]  Productos  Consulta Médica  Trazabilidad  Compliance  [Login | Mi Cuenta]
```
- No poner "Catálogo" suelto. "Productos" con el tono de ficha técnica.
- "Consulta Médica" es CTA principal de conversión (más que compra directa).

---

## 3. FLUJOS DE USUARIO (UX)

### 3.1 Paciente Nuevo — Flujo Completo
```
1. Entra al sitio
   → Age Gate (18+ + receta médica + ubicación Chile)
   
2. Ve Homepage
   → Hero: "Cannabis medicinal de precisión"
   → CTA primario: "Agendar consulta médica"
   → CTA secundario: "Explorar productos" (catálogo informativo)
   
3. Si quiere comprar:
   a. Click en producto → ficha técnica (sin precio visible)
   b. "Para ver disponibilidad y precios, ingresa con tu cuenta y receta médica"
   c. Lo lleva a `/registro` o `/ingresar`
   
4. Registro:
   → Email, nombre, RUT, teléfono
   → Checkbox: "Confirmo que cuento con receta médica vigente"
   → Checkbox: "Acepto política de privacidad y términos de uso"
   → Link: "¿No tienes receta? Agenda consulta médica"
   
5. Post-registro:
   → Email de bienvenida con instrucciones
   → Dashboard vacío con CTA: "Sube tu receta médica"
   
6. Subida de receta:
   → Upload de imagen/PDF (frontal y reverso si aplica)
   → Estado: "Pendiente de validación" (staff humano lo aprueba)
   → Email cuando se aprueba
   
7. Una vez aprobada:
   → Productos muestran precios
   → "Agregar al carrito" se habilita
   → Stock aparece como "Disponible / Consultar" (booleano, no número exacto)
   
8. Checkout:
   → Revisión de carrito
   → Selección de dirección de despacho
   → Generación de orden con datos de transferencia
   → Instrucciones: "Realiza transferencia a [cuenta] y sube tu comprobante"
   
9. Post-transferencia:
   → Paciente sube comprobante (imagen)
   → Estado: "Verificando pago"
   → Admin valida comprobante en panel /admin
   → Estado: "Pago confirmado → Preparando despacho"
   
10. Trazabilidad post-venta:
    → Paciente ve estado: "Cultivado → Procesado → Envasado → En tránsito → Entregado"
    → Cada hito con timestamp
    → Lote asociado con link a COA
```

### 3.2 Admin / Staff — Flujos
```
Panel /admin:

- Dashboard:
  → Pedidos pendientes de validación de pago
  → Recetas médicas por aprobar
  → Transferencias por confirmar
  → Stock por debajo de umbral

- Gestión de Pedidos:
  → Lista con filtros (pendiente, pagado, en preparación, enviado, entregado)
  → Click → detalle: datos paciente, productos, receta adjunta, comprobante de transferencia
  → Acciones: Confirmar pago, Generar guía de despacho, Marcar como enviado, Marcar como entregado
  → Cada acción genera notificación al paciente

- Validación de Comprobantes:
  → Grid de comprobantes subidos por pacientes
  → Preview de imagen
  → Datos: monto, banco, fecha según OCR (opcional futuro)
  → Botón: "Confirmar" | "Rechazar (solicitar nuevo comprobante)"
```

---

## 4. SISTEMA DE PAGOS — TRANSFERENCIA BANCARIA + COMPROBANTE

### 4.1 Flujo Técnico
```
Checkout → Generar Orden (estado: PENDIENTE_PAGO)
         → Mostrar datos bancarios:
             - Banco: [BancoEstado / BCI / Santander]
             - Cuenta corriente: XXXX-XXXX-XXXX
             - Rut: XX.XXX.XXX-X
             - Nombre: Cultimed SpA
             - Email: pagos@cordobacapitalpizzeria.cl (placeholder, ajustar)
             - Monto: $XX.XXX CLP
             - Referencia obligatoria: RUT del paciente
         → Timer: "Tienes 24 horas para realizar la transferencia"
         → Botón: "Ya transferí → Subir comprobante"
         → Input: Upload imagen (JPG/PNG/PDF, max 5MB)
         → Estado cambia a: PAGO_PENDIENTE_VALIDACION

Admin revisa en /admin/transferencias
         → Ve comprobante
         → Confirma/rechaza
         → Si confirma → Estado: PAGO_CONFIRMADO → se activa preparación
```

### 4.2 Estructura de Datos (Tablas Supabase)
```sql
-- Tabla: orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL CHECK (status IN (
    'pendiente_pago', 'pago_pendiente_validacion', 'pago_confirmado', 
    'en_preparacion', 'enviado', 'entregado', 'cancelado'
  )),
  total_amount INTEGER NOT NULL,
  transfer_proof_url TEXT, -- URL en storage de comprobante
  transfer_confirmed_by UUID REFERENCES auth.users(id), -- admin que validó
  transfer_confirmed_at TIMESTAMP,
  shipping_address JSONB,
  lot_tracking JSONB, -- [{"step":"cultivado","at":"...","lot_id":"..."}, ...]
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: prescriptions
CREATE TABLE prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  image_url TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendiente', 'aprobada', 'rechazada', 'vencida')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP,
  expires_at TIMESTAMP,
  doctor_name TEXT,
  doctor_rut TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabla: order_items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id),
  product_id UUID REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  lot_id TEXT -- lote asignado al item
);
```

### 4.3 Notificaciones Automáticas (Email)
| Trigger | Email al paciente |
|---|---|
| Orden creada | "Tu orden #123 está pendiente de pago. Instrucciones de transferencia." |
| Comprobante subido | "Hemos recibido tu comprobante. Lo validaremos en menos de 24h." |
| Pago confirmado | "Pago confirmado. Tu pedido está en preparación." |
| Pedido enviado | "Tu pedido ha sido despachado. Aquí está tu código de seguimiento." |
| Pedido entregado | "Tu pedido fue entregado. Gracias por confiar en Cultimed." |
| Receta aprobada | "Tu receta médica ha sido validada. Ya puedes realizar compras." |

---

## 5. TRAZABILIDAD — DESDE CULTIVO HASTA EL CLIENTE

### 5.1 Flujo de Estados por Lote
```
SEMILLA     → Plantada en invernadero [fecha, lote_id, cepa, genética]
     ↓
VEGETACIÓN  → Registro de condiciones [temp, humedad, fertilizantes]
     ↓
FLORACIÓN   → Registro de cosecha [fecha, peso fresco, responsable]
     ↓
SECADO      → Peso post-secado, humedad final
     ↓
CURADO      → Semanas de curado, ambiente controlado
     ↓
LABORATORIO → COA generado [%THC, %CBD, terpenos, contaminantes]
     ↓
ENVASADO    → Presentación final, etiquetado, número de lote
     ↓
INVENTARIO  → Entrada a stock del dispensario
     ↓
DESPACHO    → Asignado a orden de paciente
     ↓
ENVÍO       → En tránsito (courier, código de seguimiento)
     ↓
ENTREGADO   → Confirmación de recepción por paciente o courier
```

### 5.2 En la Web (Vista PACIENTE)
En `/trazabilidad` o dentro del detalle de each pedido en `/mi-cuenta/pedidos`:
- Timeline vertical con cada estado.
- Iconos de estado (check, truck, flask, seedling).
- Fechas reales.
- Botón "Ver Certificado de Análisis" → abre PDF del COA correspondiente al lote.
- Mensaje final: "Este producto fue cultivado y procesado bajo estándares GMP según resolución ISP [número]."

### 5.3 En el Admin (Vista STAFF)
- Tablas de lotes activos.
- Cada lote tiene QR code generado para etiquetado físico.
- Scaneo de QR en cada transición de estado.
- Alertas de lotes próximos a vencer.

---

## 6. COPYS LEGALES — TEXTO MODELO (Chile)

### 6.1 Age Gate Completo
```
TÍTULO: Verificación de Acceso
SUB: Este sitio contiene información sobre productos de cannabis medicinal
      disponibles exclusivamente bajo prescripción médica en Chile.

[×] Confirmo que soy mayor de 18 años.
[×] Confirmo que cuento con receta médica vigente o soy representante legal
    de un paciente con receta vigente, conforme a la Ley 20.850.
[×] Acepto los Términos de Uso y Política de Privacidad del sitio.

[BOTÓN: Ingresar] (disabled hasta marcar las 3)

Link: "¿No tienes receta médica? Agenda una consulta aquí" → /consulta

MICROLEGAL debajo:
"El acceso a este sitio está regulado por la Ley 20.850 y el D.S. N° 345/2016.
La comercialización no autorizada de cannabis está penada por la Ley 20.000.
Cultimed opera exclusivamente dentro del marco legal vigente."
```

### 6.2 Disclaimer Médico (Footer global)
```
"Cultimed es un dispensario de cannabis medicinal autorizado en Chile.
Los productos comercializados requieren prescripción médica vigente conforme
a la Ley 20.850 y el D.S. N° 345/2016. Este sitio tiene fines exclusivamente
informativos y no constituye asesoría médica. No automedicarse.
Consulte siempre a un profesional de salud habilitado.
Los efectos terapéuticos pueden variar entre pacientes.
"
```

### 6.3 Producto — Ficha Técnica (nunca "venta")
```
NOMBRE: Aceite CBD Full Spectrum 5%
SUB: Formulación farmacéutica con espectro completo de cannabinoides

INFO TÉCNICA:
- Concentración: 500mg CBD / 10ml
- THC: <0.3%
- CBD: 5%
- Volumen: 10ml
- Vía de administración: Sublingual
- Origen: Cultivo indoor controlado, Chile
- Lote: [número] | Ver COA → [link]

DESCRIPCIÓN:
"Formulación de cannabidiol de espectro completo, desarrollada como punto
inicial para pacientes que comienzan terapia cannabinoide bajo supervisión
médica. Cada gota contiene aproximadamente 2.5mg de CBD. Contiene el perfil
completo de cannabinoides, terpenos y flavonoides para maximizar el efecto séquito.
Incluye certificado de análisis de laboratorio independiente."

⚠️ RECETA REQUERIDA: Este producto requiere prescripción médica vigente.
    Su dispensación está sujeta a validación de receta por personal autorizado.

[BOTÓN: Solicitar con receta] → Si logueado + receta: [Agregar]
```

### 6.4 Checkout — Transferencia
```
TÍTULO: Pago por Transferencia Bancaria

Para completar tu compra, realiza una transferencia con los siguientes datos:

Banco: Banco Santander
Tipo: Cuenta Corriente
N° Cuenta: [REDACTED - llenar con datos reales]
Rut: [REDACTED]
Nombre: Cultimed Dispensario
Email: contacto@dispensariocultimed.cl
Monto a transferir: $35.000 CLP
Referencia obligatoria: Tu RUT sin puntos ni guión

⚠️ IMPORTANTE:
- Tienes 24 horas para realizar la transferencia.
- Debes usar tu RUT como referencia para identificar el pago.
- Una vez realizada, sube el comprobante de transferencia.
- Tu pedido será preparado una vez confirmado el pago por nuestro equipo.

[Subir comprobante → Upload de imagen]
[He realizado la transferencia, notifíquenme por email]
```

### 6.5 Política de Privacidad — Extracto Legal (Ley 19.628)
```
"De conformidad con la Ley N° 19.628 sobre Protección de la Vida Privada,
Cultimed garantiza la confidencialidad de sus datos personales y sensibles
(especialmente aquellos relativos a su salud y uso de cannabis medicinal).

Sus datos serán utilizados exclusivamente para:
- Verificación de identidad y mayoria de edad
- Validación de recetas médicas
- Procesamiento de pedidos y seguimiento de envíos
- Contacto relacionado con su tratamiento

No compartiremos sus datos con terceros sin su consentimiento expreso,
salvo obligación legal o requerimiento de autoridad competente (ISP, PDI).
Sus datos de salud están clasificados como sensibles y gozan de protección
reforzada conforme al artículo 11 de la Ley 19.628."
```

---

## 7. DATOS A MIGRAR (Desde la base existente)

Según contexto del proyecto, ya existe una base de datos con:
- **Productos/cepas** (23+ en seed SQL)
- **Clientes**

### 7.1 Migración Requerida
- Productos existentes → Migrar a estructura `products` + vincular con tabla `batches`.
- Cada producto necesita: `lot_id`, `coa_url`, `isp_registration_number`.
- Clientes existentes → Migrar a `auth.users` + crear perfil en tabla `profiles`.
- Para cada cliente: si ya tienen receta médica en el sistema antiguo, migrar a tabla `prescriptions` con estado `aprobada`.

### 7.2 Seed SQL Necesario (Nuevas Tablas)
- Tabla `batches` con lotes activos y trazabilidad.
- Tabla `orders` con estados del flujo de pago.
- Tabla `prescriptions` con estados de validación.
- Tabla `notifications` para tracking de emails/push.

---

## 8. STACK TÉCNICO RECOMENDADO (Confirmado)

| Capa | Tecnología | Justificación |
|---|---|---|
| Framework | Next.js 14 (App Router) | SSR/ISR para SEO, protección de rutas con middleware |
| Estilos | Tailwind CSS + Config custom (no default) | Velocidad de desarrollo sin parecer genérico |
| Base de Datos | Supabase (Postgres) | Auth integrada, RLS para seguridad de datos de pacientes |
| ORM | Prisma | Tipado fuerte, migraciones |
| Storage | Supabase Storage | Comprobantes de transferencia (imágenes), recetas, COAs |
| Auth | Supabase Auth | Login email/pass, RUT como metadata |
| Notificaciones | Resend / SendGrid | Emails transaccionales (órdenes, recetas) |
| Hosting | Vercel | Edge network, rápido |
| Analytics | Plausible o GA4 con server-side | Respeto a privacidad de pacientes |

---

## 9. AGENTE DE IMPLEMENTACIÓN

### Tareas inmediatas a ejecutar:
1. Crear componente `AgeGateDual` (3 checkboxes obligatorios + juramento).
2. Refactorizar `compliance/page.tsx` (Ley 20.850, DS 345/2016, Ley 21.368).
3. Crear páginas legales faltantes: `/privacidad`, `/terminos`, `/derechos-paciente`.
4. Refactorizar `ProductCatalog.tsx`:
   - Ocultar precios/stock a usuarios sin `prescription_status === 'aprobada'`.
   - Reemplazar "Agregar al carrito" por "Solicitar con receta" (público) o "Agregar" (autorizado).
   - Revisar copys de `lib/products.ts` y eliminar health claims directos.
5. Crear flujo de upload de receta médica (`/mi-cuenta/recetas`).
6. Crear dashboard admin (`/admin`) con gestión de pedidos y validación de comprobantes.
7. Implementar flujo de checkout con transferencia + upload de comprobante.
8. Implementar timeline de trazabilidad en pedidos.
9. Crear seed SQL con estructura de tablas `orders`, `prescriptions`, `batches`, `order_items`.
10. Migrar datos existentes de productos y clientes.

---

*Fin del Documento Maestro. Versión 3.0 — Listo para implementación.*
