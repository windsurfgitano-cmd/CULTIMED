import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import AgeGate from "@/components/AgeGate";
import { getCurrentCustomer } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Cultimed · Cannabis medicinal de precisión",
  description:
    "Dispensario de cannabis medicinal autorizado en Chile. Cada lote certificado por laboratorio independiente. Bajo prescripción médica.",
  keywords: ["cannabis medicinal", "CBD Chile", "dispensario cannabis", "SANNA", "cultimed"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F4EFE6",
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
