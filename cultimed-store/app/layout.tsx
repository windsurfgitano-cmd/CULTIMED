import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AgeGate from "@/components/AgeGate";
import { getCurrentCustomer } from "@/lib/auth";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F4EFE6",
};

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const customer = await getCurrentCustomer();
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,200..900,0..100;1,9..144,200..900,0..100&family=Manrope:wght@200..800&family=JetBrains+Mono:ital,wght@0,400..700;1,400&display=swap"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <Header customer={customer ? { full_name: customer.full_name, email: customer.email } : null} />
        <main className="flex-1 pt-16 lg:pt-20">{children}</main>
        <Footer />
        <AgeGate />
      </body>
    </html>
  );
}
