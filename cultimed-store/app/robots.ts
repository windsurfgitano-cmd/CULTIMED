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
