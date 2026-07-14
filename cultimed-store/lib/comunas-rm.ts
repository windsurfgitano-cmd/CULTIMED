// Única fuente de verdad de las comunas de la Región Metropolitana y su zona de
// despacho. Cultimed solo despacha dentro de la RM: urbano ($4.990) o alejada
// ($9.990). shipping.ts deriva de aquí — no duplicar la lista.

export interface Comuna {
  name: string;
  /** true = zona alejada ($9.990); false = urbano ($4.990) */
  outlying: boolean;
}

export const COMUNAS_RM: Comuna[] = [
  { name: "Alhué", outlying: true },
  { name: "Buin", outlying: true },
  { name: "Calera de Tango", outlying: true },
  { name: "Cerrillos", outlying: false },
  { name: "Cerro Navia", outlying: false },
  { name: "Colina", outlying: true },
  { name: "Conchalí", outlying: false },
  { name: "Curacaví", outlying: true },
  { name: "El Bosque", outlying: false },
  { name: "El Monte", outlying: true },
  { name: "Estación Central", outlying: false },
  { name: "Huechuraba", outlying: false },
  { name: "Independencia", outlying: false },
  { name: "Isla de Maipo", outlying: true },
  { name: "La Cisterna", outlying: false },
  { name: "La Florida", outlying: false },
  { name: "La Granja", outlying: false },
  { name: "La Pintana", outlying: false },
  { name: "La Reina", outlying: false },
  { name: "Lampa", outlying: true },
  { name: "Las Condes", outlying: false },
  { name: "Lo Barnechea", outlying: false },
  { name: "Lo Espejo", outlying: false },
  { name: "Lo Prado", outlying: false },
  { name: "Macul", outlying: false },
  { name: "Maipú", outlying: false },
  { name: "María Pinto", outlying: true },
  { name: "Melipilla", outlying: true },
  { name: "Ñuñoa", outlying: false },
  { name: "Padre Hurtado", outlying: true },
  { name: "Paine", outlying: true },
  { name: "Pedro Aguirre Cerda", outlying: false },
  { name: "Peñaflor", outlying: true },
  { name: "Peñalolén", outlying: false },
  { name: "Pirque", outlying: true },
  { name: "Providencia", outlying: false },
  { name: "Pudahuel", outlying: false },
  { name: "Puente Alto", outlying: false },
  { name: "Quilicura", outlying: false },
  { name: "Quinta Normal", outlying: false },
  { name: "Recoleta", outlying: false },
  { name: "Renca", outlying: false },
  { name: "San Bernardo", outlying: false },
  { name: "San Joaquín", outlying: false },
  { name: "San José de Maipo", outlying: true },
  { name: "San Miguel", outlying: false },
  { name: "San Pedro", outlying: true },
  { name: "San Ramón", outlying: false },
  { name: "Santiago", outlying: false },
  { name: "Talagante", outlying: true },
  { name: "Til Til", outlying: true },
  { name: "Vitacura", outlying: false },
];

export function normalizeComuna(v: string | null | undefined): string {
  return (v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

export const OUTLYING_COMUNA_KEYS: Set<string> = new Set(
  COMUNAS_RM.filter((c) => c.outlying).map((c) => normalizeComuna(c.name))
);

/** Filtra las comunas por texto (sin tildes, case-insensitive). Query vacío → todas. */
export function filterComunas(query: string): Comuna[] {
  const q = normalizeComuna(query);
  if (!q) return COMUNAS_RM;
  return COMUNAS_RM.filter((c) => normalizeComuna(c.name).includes(q));
}
