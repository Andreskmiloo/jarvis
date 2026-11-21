// Perfil de gustos. Formato acordado con la sesión de recopilación (data/perfil-gustos.json).
import type { Etiquetas } from "../fuentes/overpass";
import catalogo from "./catalogo.json";

export interface LugarConocido {
  nombre: string;
  direccion_o_link?: string;
  visitado?: boolean;
  nota?: string;
}

export interface Gusto {
  id: string;
  nombre: string;
  nivel?: number;
  preferencias?: Record<string, unknown>;
  osm?: Etiquetas[];
  palabras_clave?: string[];
  lugares_conocidos?: LugarConocido[];
  notas?: string;
  /** Capas oficiales de Bogotá (ids de CAPAS_POI) que también aplican. */
  capas?: string[];
  /** Respaldo con Photon: categorías OSM y filtro por nombre (regex). */
  photon?: { include: string[]; nombre?: string };
  /** Emoji del pin (si no, se deduce del id). */
  icono?: string;
  /** Capa oficial que se mezcla en los lugares guardados. */
  oficial?: string;
}

export interface Area {
  area: string;
  gustos: Gusto[];
}

export interface Perfil {
  version: number;
  actualizado?: string;
  areas: Area[];
}

/** Intereses de arranque mientras se llena el perfil real (catálogo compartido con el script de lugares). */
export const PERFIL_BASE: Perfil = { version: 1, areas: (catalogo as unknown as { areas: Area[] }).areas };

export function esPerfil(x: unknown): x is Perfil {
  if (!x || typeof x !== "object") return false;
  const p = x as Perfil;
  return (
    typeof p.version === "number" &&
    Array.isArray(p.areas) &&
    p.areas.every((a) => typeof a.area === "string" && Array.isArray(a.gustos) && a.gustos.every((g) => typeof g.id === "string" && typeof g.nombre === "string"))
  );
}

/** Une el perfil real con el base: los gustos reales mandan, los base rellenan. */
export function fusionar(base: Perfil, real: Perfil | null): Perfil {
  if (!real) return base;
  const areas = new Map<string, Map<string, Gusto>>();
  for (const p of [base, real]) {
    for (const a of p.areas) {
      const m = areas.get(a.area) ?? new Map<string, Gusto>();
      for (const g of a.gustos) {
        const previo = m.get(g.id);
        m.set(g.id, previo ? { ...previo, ...g, osm: g.osm?.length ? g.osm : previo.osm, capas: g.capas ?? previo.capas } : g);
      }
      areas.set(a.area, m);
    }
  }
  return {
    version: real.version,
    actualizado: real.actualizado,
    areas: [...areas].map(([area, m]) => ({ area, gustos: [...m.values()].sort((x, y) => (y.nivel ?? 0) - (x.nivel ?? 0)) })),
  };
}

// El perfil vive en data/ (raíz del repo). Vite lo incrusta en el build si existe.
const archivos = import.meta.glob<unknown>("/data/perfil-gustos*.json", { eager: true, import: "default" });

/** Devuelve el perfil real (o el de ejemplo) fusionado con el base. */
export function cargarPerfil(): Perfil {
  const real = archivos["/data/perfil-gustos.json"] ?? archivos["/data/perfil-gustos.ejemplo.json"];
  return esPerfil(real) ? fusionar(PERFIL_BASE, real) : PERFIL_BASE;
}
