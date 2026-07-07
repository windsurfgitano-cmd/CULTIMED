import type { MetadataRoute } from "next";

// Panel de administración: nada de esto debe aparecer en buscadores.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
