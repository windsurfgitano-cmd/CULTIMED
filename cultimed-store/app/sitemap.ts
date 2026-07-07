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
