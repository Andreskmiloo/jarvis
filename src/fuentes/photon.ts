// Respaldo en vivo con Photon (OpenStreetMap) cuando Overpass no responde. Máximo 50 por consulta.
import type { Caja, LugarOSM } from "./overpass";

export function urlPhoton(include: string[], caja: Caja): string {
  const p = new URLSearchParams({ bbox: caja.join(","), limit: "50" });
  include.forEach((i) => p.append("include", i));
  return `https://photon.komoot.io/api/?${p}`;
}

interface FeaturePhoton {
  geometry: { coordinates: [number, number] };
  properties: { osm_type: string; osm_id: number; name?: string; street?: string; housenumber?: string };
}

export function leerPhoton(d: { features?: FeaturePhoton[] }, nombre?: string): LugarOSM[] {
  const re = nombre ? new RegExp(nombre, "i") : null;
  return (d.features ?? [])
    .map((f) => ({
      id: `${f.properties.osm_type === "N" ? "node" : f.properties.osm_type === "W" ? "way" : "relation"}/${f.properties.osm_id}`,
      nombre: f.properties.name ?? "(sin nombre en OSM)",
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      etiquetas: {},
      direccion: [f.properties.street, f.properties.housenumber].filter(Boolean).join(" ") || undefined,
    }))
    .filter((l) => !re || re.test(l.nombre));
}

export async function buscarPhoton(include: string[], caja: Caja, nombre?: string, signal?: AbortSignal): Promise<LugarOSM[]> {
  const r = await fetch(urlPhoton(include, caja), { signal });
  if (!r.ok) throw new Error(`Photon HTTP ${r.status}`);
  return leerPhoton(await r.json(), nombre);
}
