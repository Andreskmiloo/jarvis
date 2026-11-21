// Lugares guardados con la página (public/data/lugares/*.json, generados por scripts/guardar-lugares.mjs).
// Cargan al instante y no dependen de ningún servidor externo.
import type { Caja, LugarOSM } from "./overpass";

export interface ArchivoLugares {
  id: string;
  generado: string;
  fuente: string;
  lugares: (Omit<LugarOSM, "etiquetas"> & { deporte?: string; fuente?: string })[];
}

const cache = new Map<string, Promise<ArchivoLugares | null>>();

export function cargarGuardados(id: string): Promise<ArchivoLugares | null> {
  if (!cache.has(id))
    cache.set(
      id,
      fetch(`data/lugares/${encodeURIComponent(id)}.json`)
        .then((r) => (r.ok ? (r.json() as Promise<ArchivoLugares>) : null))
        .catch(() => null),
    );
  return cache.get(id)!;
}

export function aLugaresOSM(a: ArchivoLugares): LugarOSM[] {
  return a.lugares.map((l) => ({
    ...l,
    nombre: l.nombre || (l.deporte ? `Cancha (${l.deporte})` : "(sin nombre en OSM)"),
    etiquetas: (l.deporte ? { sport: l.deporte } : {}) as Record<string, string>,
  }));
}

export function dentroDeCaja(l: { lat: number; lng: number }, [o, s, e, n]: Caja): boolean {
  return l.lng >= o && l.lng <= e && l.lat >= s && l.lat <= n;
}

/** GeoJSON de puntos para pintar una capa desde un archivo guardado. */
export function geojsonGuardados(a: ArchivoLugares): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: a.lugares.map((l) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [l.lng, l.lat] },
      properties: { NOMBRE: l.nombre || "Sin nombre", DIRECCION: l.direccion ?? "", FUENTE: l.fuente === "oficial" ? "Nomenclátor oficial" : "OpenStreetMap", HORARIO: l.horario ?? "" },
    })),
  };
}
