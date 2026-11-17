// Cómo llegar: rutas OSRM sobre OpenStreetMap (servidores de routing.openstreetmap.de,
// con perfiles de carro, bici y a pie; CORS abierto, sin clave).
export type Modo = "carro" | "bici" | "pie";
const PERFIL: Record<Modo, string> = { carro: "routed-car", bici: "routed-bike", pie: "routed-foot" };

export interface Ruta {
  modo: Modo;
  metros: number;
  segundos: number;
  linea: [number, number][];
}

export function urlRuta(modo: Modo, desde: { lat: number; lng: number }, hasta: { lat: number; lng: number }): string {
  const c = `${desde.lng.toFixed(6)},${desde.lat.toFixed(6)};${hasta.lng.toFixed(6)},${hasta.lat.toFixed(6)}`;
  return `https://routing.openstreetmap.de/${PERFIL[modo]}/route/v1/driving/${c}?overview=full&geometries=geojson`;
}

export function leerRuta(modo: Modo, d: { code: string; routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[] }): Ruta | null {
  const r = d.code === "Ok" ? d.routes?.[0] : undefined;
  if (!r) return null;
  return { modo, metros: r.distance, segundos: r.duration, linea: r.geometry?.coordinates ?? [] };
}

export async function ruta(modo: Modo, desde: { lat: number; lng: number }, hasta: { lat: number; lng: number }, signal?: AbortSignal): Promise<Ruta | null> {
  const r = await fetch(urlRuta(modo, desde, hasta), { signal });
  if (!r.ok) throw new Error(`Rutas HTTP ${r.status}`);
  return leerRuta(modo, await r.json());
}

export function textoDuracion(seg: number): string {
  const m = Math.round(seg / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}
