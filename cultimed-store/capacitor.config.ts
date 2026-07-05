import type { CapacitorConfig } from "@capacitor/cli";

// La app nativa es un shell que apunta al sitio ya deployado en Vercel
// (dispensariocultimed.cl) -- no empaquetamos un build estatico porque
// cultimed-store usa Server Actions, cookies de sesion y rutas dinamicas
// que un "next export" estatico rompería. El carrito/checkout se abre en
// el navegador del sistema (ver lib/native-bridge.ts) para cumplir la
// politica de Google Play, que prohibe el carrito de compra 100% nativo
// para productos de cannabis.
const config: CapacitorConfig = {
  appId: "cl.dispensariocultimed.app",
  appName: "Cultimed",
  webDir: "public",
  server: {
    url: "https://dispensariocultimed.cl",
    cleartext: false,
  },
  ios: {
    contentInset: "automatic",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#F4EFE6",
      showSpinner: false,
    },
  },
};

export default config;
