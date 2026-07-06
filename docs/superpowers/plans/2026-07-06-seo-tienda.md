# SEO Técnico + Preview WhatsApp — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Google indexe correctamente las páginas públicas de la tienda, que cualquier link compartido por WhatsApp muestre tarjeta con imagen de marca, y que el panel admin quede invisible para buscadores.

**Architecture:** Todo con primitivas nativas de Next.js App Router: `metadata` exports (global con template + por página), `app/robots.ts`, `app/sitemap.ts`, JSON-LD inyectado en el layout, e imagen OG estática generada una vez con sharp. Spec aprobada: `docs/superpowers/specs/2026-07-06-seo-tienda-design.md`.

**Tech Stack:** Next.js 14 App Router (Metadata API, MetadataRoute), sharp (devDependency, solo para el script one-off del og.png).

**Convenciones de esta máquina/repo (OBLIGATORIAS):**
- Worktree: crear con superpowers:using-git-worktrees, rama `feature/seo-tienda`; copiar a mano `cultimed-store/.env.local` y `cultisoft/.env.local` al worktree (gitignored, necesarios para builds).
- Puertos: 3000 y 3030 están OCUPADOS por servers del repo principal. Dev servers de prueba: tienda → `npx next dev -p 3005`, cultisoft → `npx next dev -p 3006`. Matar por PID específico al terminar.
- Commits en español, cortos, sin punto final.
- Las 7 páginas públicas son SERVER components (verificado) — `export const metadata` va directo en cada `page.tsx`.
- `cultisoft/app/layout.tsx` YA tiene `robots: { index: false, follow: false }` — NO tocarlo; solo falta su `robots.ts`.

---

## Mapa de archivos

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `cultimed-store/scripts/generate-og.js` | Create | Genera `public/og.png` 1200×630 (one-off, reproducible) |
| `cultimed-store/public/og.png` | Create (generado) | Imagen de marca para OG/WhatsApp |
| `cultimed-store/package.json` | Modify | + devDependency `sharp` |
| `cultimed-store/app/layout.tsx` | Modify | metadataBase, title template, OG/Twitter global, JSON-LD |
| `cultimed-store/app/{compliance,derechos-paciente,trazabilidad,embajadores,terminos,privacidad,registro}/page.tsx` | Modify (7) | `export const metadata` por página |
| `cultimed-store/app/robots.ts` | Create | Reglas de indexación + link al sitemap |
| `cultimed-store/app/sitemap.ts` | Create | 8 URLs indexables |
| `cultisoft/app/robots.ts` | Create | Disallow total del panel |

---

### Task 1: Imagen OG de marca

**Files:**
- Create: `cultimed-store/scripts/generate-og.js`
- Create: `cultimed-store/public/og.png` (generado por el script)
- Modify: `cultimed-store/package.json` (+ sharp devDependency)

- [ ] **Step 1: Instalar sharp**

Run: `cd cultimed-store && npm install -D sharp`
Expected: agregado a devDependencies sin errores.

- [ ] **Step 2: Escribir el script**

```js
// Genera public/og.png (1200x630) para Open Graph / preview de WhatsApp.
// One-off reproducible: fondo oscuro de marca + logo dorado + tagline.
// Uso: node scripts/generate-og.js
const sharp = require("sharp");

const LOGO_URL =
  "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png";

(async () => {
  const res = await fetch(LOGO_URL);
  if (!res.ok) throw new Error(`logo HTTP ${res.status}`);
  const logo = Buffer.from(await res.arrayBuffer());
  const logoResized = await sharp(logo).resize({ width: 460, fit: "inside" }).png().toBuffer();
  const logoMeta = await sharp(logoResized).metadata();

  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0F1A22"/>
  <rect x="40" y="40" width="1120" height="550" fill="none" stroke="#C9B891" stroke-width="1" opacity="0.35"/>
  <text x="600" y="468" font-family="Georgia, serif" font-size="34" fill="#F7F1E5" text-anchor="middle" opacity="0.92">Dispensario m&#233;dico autorizado &#183; Chile</text>
  <text x="600" y="522" font-family="Georgia, serif" font-size="19" fill="#C9B891" text-anchor="middle" letter-spacing="6" opacity="0.8">CANNABIS MEDICINAL &#183; LEY 20.850</text>
</svg>`;

  const top = Math.round((400 - (logoMeta.height || 200)) / 2) + 40;
  const left = Math.round((1200 - (logoMeta.width || 460)) / 2);

  await sharp(Buffer.from(svg))
    .composite([{ input: logoResized, top, left }])
    .png()
    .toFile("public/og.png");

  const out = await sharp("public/og.png").metadata();
  console.log(`✓ public/og.png ${out.width}x${out.height}`);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
```

- [ ] **Step 3: Generar y verificar**

Run: `node scripts/generate-og.js`
Expected: `✓ public/og.png 1200x630`

Run: `node -e "const s=require('fs').statSync('public/og.png');console.log(Math.round(s.size/1024)+'KB', s.size < 300*1024 ? 'OK' : 'MUY GRANDE')"`
Expected: `<N>KB OK` (menos de 300KB).

- [ ] **Step 4: Commit**

```bash
git add cultimed-store/scripts/generate-og.js cultimed-store/public/og.png cultimed-store/package.json cultimed-store/package-lock.json
git commit -m "Imagen OG de marca para preview de WhatsApp"
```

---

### Task 2: Metadata global + JSON-LD en el layout

**Files:**
- Modify: `cultimed-store/app/layout.tsx`

- [ ] **Step 1: Reemplazar el bloque `metadata` (líneas 8-13) por:**

```ts
export const metadata: Metadata = {
  metadataBase: new URL("https://dispensariocultimed.cl"),
  title: {
    default: "Cultimed · Dispensario médico autorizado",
    template: "%s · Cultimed",
  },
  description:
    "Dispensario médico autorizado en Chile. Cannabis medicinal con receta médica vigente, validación por químico farmacéutico y despacho a todo Chile.",
  keywords: [
    "dispensario médico", "receta médica", "Chile", "cultimed",
    "cannabis medicinal", "Ley 20.850", "SANNA",
  ],
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "Cultimed",
    title: "Cultimed · Dispensario médico autorizado",
    description:
      "Cannabis medicinal con receta médica vigente. Validación por químico farmacéutico y despacho a todo Chile.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Cultimed · Dispensario médico autorizado" }],
  },
  twitter: { card: "summary_large_image" },
};
```

- [ ] **Step 2: Agregar el JSON-LD.** Sobre la función `RootLayout`, agregar la constante; dentro del `<head>` existente (después del `<link rel="stylesheet" ...>`), agregar el script:

```tsx
// Datos estructurados: ayuda a Google a entender la organización.
const ORG_JSONLD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Cultimed",
  url: "https://dispensariocultimed.cl",
  logo: "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+56993177375",
    email: "contacto@dispensariocultimed.cl",
    contactType: "customer service",
  },
};
```

```tsx
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
        />
```

- [ ] **Step 3: Verificar tipos**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add cultimed-store/app/layout.tsx
git commit -m "Metadata global con OG/Twitter y JSON-LD Organization"
```

---

### Task 3: Metadata por página pública (7 páginas)

**Files:**
- Modify: `cultimed-store/app/compliance/page.tsx`, `app/derechos-paciente/page.tsx`, `app/trazabilidad/page.tsx`, `app/embajadores/page.tsx`, `app/terminos/page.tsx`, `app/privacidad/page.tsx`, `app/registro/page.tsx`

- [ ] **Step 1: Agregar a cada archivo, después de los imports existentes** (si el archivo no importa `Metadata`, agregar `import type { Metadata } from "next";`):

`app/compliance/page.tsx`:
```ts
export const metadata: Metadata = {
  title: "Cumplimiento y normativa",
  description:
    "Marco legal del dispensario: Ley 20.850, D.S. 345/2016, SANNA e ISP. Cómo operamos un dispensario de cannabis medicinal en Chile.",
};
```

`app/derechos-paciente/page.tsx`:
```ts
export const metadata: Metadata = {
  title: "Derechos del paciente",
  description:
    "Tus derechos como paciente de cannabis medicinal en Chile: receta, privacidad de datos clínicos (Ley 19.628) y dispensación segura.",
};
```

`app/trazabilidad/page.tsx`:
```ts
export const metadata: Metadata = {
  title: "Trazabilidad por lote",
  description:
    "Cada producto con número de lote, análisis de laboratorio independiente (COA) y registro sanitario. Trazabilidad completa de tu tratamiento.",
};
```

`app/embajadores/page.tsx`:
```ts
export const metadata: Metadata = {
  title: "Programa de embajadores",
  description:
    "Recomienda Cultimed y obtén beneficios. Programa de embajadores para pacientes del dispensario.",
};
```

`app/terminos/page.tsx`:
```ts
export const metadata: Metadata = {
  title: "Términos de uso",
  description: "Términos y condiciones de uso del dispensario Cultimed.",
};
```

`app/privacidad/page.tsx`:
```ts
export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo protegemos tus datos personales y clínicos bajo la Ley 19.628.",
};
```

`app/registro/page.tsx`:
```ts
export const metadata: Metadata = {
  title: "Crear cuenta de paciente",
  description:
    "Crea tu cuenta, sube tu receta médica y accede al catálogo de cannabis medicinal validado por químico farmacéutico.",
};
```

- [ ] **Step 2: Verificar tipos**

Run: `cd cultimed-store && npx tsc --noEmit`
Expected: sin errores. (Si alguna página resultara tener `"use client"` pese a la verificación previa, mover su metadata a un `layout.tsx` del segmento y reportarlo.)

- [ ] **Step 3: Commit**

```bash
git add cultimed-store/app/compliance/page.tsx cultimed-store/app/derechos-paciente/page.tsx cultimed-store/app/trazabilidad/page.tsx cultimed-store/app/embajadores/page.tsx cultimed-store/app/terminos/page.tsx cultimed-store/app/privacidad/page.tsx cultimed-store/app/registro/page.tsx
git commit -m "Metadata unica por pagina publica"
```

---

### Task 4: robots.ts + sitemap.ts de la tienda

**Files:**
- Create: `cultimed-store/app/robots.ts`
- Create: `cultimed-store/app/sitemap.ts`

- [ ] **Step 1: Crear `app/robots.ts`**

```ts
import type { MetadataRoute } from "next";

// Lo privado y lo gated (catálogo tras login) fuera de los buscadores.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/mi-cuenta", "/carrito", "/checkout", "/baja", "/api/",
          "/ingresar", "/recuperar", "/productos", "/consulta", "/r/",
        ],
      },
    ],
    sitemap: "https://dispensariocultimed.cl/sitemap.xml",
  };
}
```

- [ ] **Step 2: Crear `app/sitemap.ts`**

```ts
import type { MetadataRoute } from "next";

const BASE = "https://dispensariocultimed.cl";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${BASE}/`, changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE}/registro`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE}/compliance`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/derechos-paciente`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/trazabilidad`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/embajadores`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/terminos`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/privacidad`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
```

- [ ] **Step 3: Verificar con el dev server** (puerto 3005):

```bash
cd cultimed-store && npx next dev -p 3005 &
# esperar a Ready, luego:
curl -s http://localhost:3005/robots.txt
curl -s http://localhost:3005/sitemap.xml | grep -c "<url>"
```
Expected: robots.txt con las 10 rutas disallow y la línea `Sitemap: https://dispensariocultimed.cl/sitemap.xml`; el grep del sitemap devuelve `8`. Matar el server por PID.

- [ ] **Step 4: Commit**

```bash
git add cultimed-store/app/robots.ts cultimed-store/app/sitemap.ts
git commit -m "robots.ts y sitemap.ts de la tienda"
```

---

### Task 5: robots.ts del panel (cultisoft)

**Files:**
- Create: `cultisoft/app/robots.ts`

- [ ] **Step 1: Crear el archivo** (el meta noindex YA existe en el layout — esto es el refuerzo a nivel robots.txt):

```ts
import type { MetadataRoute } from "next";

// Panel de administración: nada de esto debe aparecer en buscadores.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
```

- [ ] **Step 2: Verificar**

Run: `cd cultisoft && npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add cultisoft/app/robots.ts
git commit -m "Panel fuera de buscadores: robots.ts con disallow total"
```

---

### Task 6: Verificación integral

**Files:** ninguno nuevo.

- [ ] **Step 1: Builds completos**

Run: `cd cultimed-store && npm run build && cd ../cultisoft && npm run build`
Expected: ambos verdes; en la tienda aparecen `/robots.txt` y `/sitemap.xml` en el output del build.

- [ ] **Step 2: Smoke del HTML renderizado** (tienda en puerto 3005):

```bash
cd cultimed-store && npx next dev -p 3005 &
# esperar Ready, luego:
curl -s http://localhost:3005/ | grep -o 'property="og:image" content="[^"]*"'
curl -s http://localhost:3005/ | grep -o 'name="twitter:card" content="[^"]*"'
curl -s http://localhost:3005/ | grep -c 'application/ld+json'
curl -s http://localhost:3005/compliance | grep -o '<title>[^<]*</title>'
curl -s http://localhost:3005/registro | grep -o '<title>[^<]*</title>'
```
Expected: og:image apunta a `/og.png` (URL absoluta con dispensariocultimed.cl por metadataBase); twitter:card = `summary_large_image`; JSON-LD count = 1; títulos = `Cumplimiento y normativa · Cultimed` y `Crear cuenta de paciente · Cultimed`. Matar server por PID.

- [ ] **Step 3: Smoke del panel** (cultisoft en puerto 3006):

```bash
cd cultisoft && npx next dev -p 3006 &
curl -s http://localhost:3006/robots.txt
```
Expected: `User-Agent: *` / `Disallow: /`. Matar server por PID.

- [ ] **Step 4: Anunciar listo para merge** — usar superpowers:finishing-a-development-branch.

**Post-merge (para Oscar, no bloquea):** compartir `https://dispensariocultimed.cl` en un chat de WhatsApp para ver la tarjeta con imagen. Si WhatsApp cacheó el preview viejo, se refresca solo en ~24h.
