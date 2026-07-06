# SEO técnico + preview WhatsApp (cultimed-store) — Diseño

**Fecha:** 2026-07-06
**Estado:** aprobado por Oscar (textos del sitio como fuente; sin GSC ni contenido nuevo)

## Objetivo

Que Google pueda encontrar y entender las páginas públicas de la tienda, y que
cualquier link compartido por WhatsApp/redes muestre una tarjeta con imagen de
marca, título y descripción. Además, sacar el panel admin de los buscadores.

## Contexto actual

- `cultimed-store/app/layout.tsx` tiene solo `title`, `description` y `keywords`
  globales. Sin `metadataBase`, sin Open Graph/Twitter, sin canonicals.
- No existen `app/sitemap.ts`, `app/robots.ts` ni imagen OG.
- El catálogo y las fichas de producto están tras login (gating SANNA) — no son
  indexables y no deben aparecer en el sitemap.
- `app/consulta` es un redirect (no se indexa).
- cultisoft (panel) no tiene ninguna directiva de robots.

## Alcance

### 1. Imagen OG de marca — `cultimed-store/public/og.png`

- 1200×630 px, generada con `sharp` (devDependency ya usada antes para los
  iconos) vía script one-off `cultimed-store/scripts/generate-og.js`:
  fondo `#0F1A22`, logo dorado (descargado de
  `https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png`),
  tagline "Dispensario médico autorizado · Chile" en serif claro (`#F7F1E5`).
- El script se commitea (reproducible); el PNG también (asset estático).

### 2. Metadata global — `app/layout.tsx`

```ts
export const metadata: Metadata = {
  metadataBase: new URL("https://dispensariocultimed.cl"),
  title: {
    default: "Cultimed · Dispensario médico autorizado",
    template: "%s · Cultimed",
  },
  description: "Dispensario médico autorizado en Chile. Cannabis medicinal con receta médica vigente, validación por químico farmacéutico y despacho a todo Chile.",
  keywords: [...las existentes + "cannabis medicinal", "Ley 20.850", "SANNA"],
  openGraph: {
    type: "website",
    locale: "es_CL",
    siteName: "Cultimed",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Cultimed · Dispensario médico autorizado" }],
  },
  twitter: { card: "summary_large_image" },
};
```

Los títulos/descripciones por página heredan la imagen OG global.

### 3. Metadata por página pública (7 archivos, `export const metadata`)

| Página | Título (entra al template) | Descripción (≤160 chars, keywords naturales) |
|---|---|---|
| `/` | (default del layout) | (default del layout) |
| `/compliance` | Cumplimiento y normativa | Marco legal del dispensario: Ley 20.850, D.S. 345/2016, SANNA e ISP. Cómo operamos un dispensario de cannabis medicinal en Chile. |
| `/derechos-paciente` | Derechos del paciente | Tus derechos como paciente de cannabis medicinal en Chile: receta, privacidad de datos clínicos (Ley 19.628) y dispensación segura. |
| `/trazabilidad` | Trazabilidad por lote | Cada producto con número de lote, análisis de laboratorio independiente (COA) y registro sanitario. Trazabilidad completa de tu tratamiento. |
| `/embajadores` | Programa de embajadores | Recomienda Cultimed y obtén beneficios. Programa de embajadores para pacientes del dispensario. |
| `/terminos` | Términos de uso | Términos y condiciones de uso del dispensario Cultimed. |
| `/privacidad` | Política de privacidad | Cómo protegemos tus datos personales y clínicos bajo la Ley 19.628. |
| `/registro` | Crear cuenta de paciente | Crea tu cuenta, sube tu receta médica y accede al catálogo de cannabis medicinal validado por químico farmacéutico. |

Nota: si alguna de estas páginas es client component ("use client"), la metadata
se exporta desde un `layout.tsx` del segmento o se convierte el page a server
component con el contenido cliente extraído — decisión por página en el plan.

### 4. Robots — `app/robots.ts`

```ts
// Indexables: /, /compliance, /derechos-paciente, /trazabilidad, /embajadores,
// /terminos, /privacidad, /registro
disallow: ["/mi-cuenta", "/carrito", "/checkout", "/baja", "/api/", "/ingresar",
           "/recuperar", "/productos", "/consulta", "/r/"]
sitemap: "https://dispensariocultimed.cl/sitemap.xml"
```

Refuerzo: `robots: { index: false }` en la metadata de las páginas privadas que
tengan layout propio accesible (mínimo: productos vía CatalogGate no aplica —
con robots.txt basta para v1).

### 5. Sitemap — `app/sitemap.ts`

Las 8 rutas indexables con `changeFrequency` y `priority` razonables
(home 1.0 weekly; registro 0.9; informativas 0.6 monthly; legales 0.3 yearly).

### 6. JSON-LD Organization — en `app/layout.tsx`

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Cultimed",
  "url": "https://dispensariocultimed.cl",
  "logo": "https://ibkhvopshhlbvjwrmuzm.supabase.co/storage/v1/object/public/email-assets/cultimed-logo-gold.png",
  "contactPoint": { "@type": "ContactPoint", "telephone": "+56993177375",
                    "email": "contacto@dispensariocultimed.cl", "contactType": "customer service" }
}
```

Inyectado como `<script type="application/ld+json">` en el layout.

### 7. Panel fuera de Google — cultisoft

- `cultisoft/app/robots.ts`: `disallow: "/"` completo.
- `robots: { index: false, follow: false }` en la metadata del layout raíz.

## Verificación

- Build verde en ambas apps.
- `curl` local: `/robots.txt` y `/sitemap.xml` responden con el contenido esperado.
- HTML de home y 2 páginas más contiene `og:image`, `og:title`, `og:description`,
  `twitter:card` y el JSON-LD (grep sobre el HTML renderizado).
- `og.png` existe, 1200×630, <300KB.
- Panel: `/robots.txt` con disallow total y meta noindex presente.
- Post-deploy: verificación en producción de los mismos puntos + preview real
  compartiendo el link (la hace Oscar en WhatsApp).

## Fuera de alcance

- Google Search Console (requiere cuenta — opcional futuro).
- Contenido nuevo/blog, SEO del catálogo (gated por diseño).
- Imágenes OG dinámicas por página (una estática global basta para 8 páginas).
