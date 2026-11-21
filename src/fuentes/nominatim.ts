// Geocodificación con Nominatim (OpenStreetMap). Uso moderado: 1 consulta por búsqueda.
import { CAJA_BOGOTA } from "./overpass";

export interface ResultadoBusqueda {
  nombre: string;
  lat: number;
  lng: number;
  /** Tipo de resultado (suburb, road, amenity…): define qué tan cerca se aterriza. */
  tipo?: string;
}

/** Acepta "4.65, -74.06" o un link de Google Maps con @lat,lng o ?q=lat,lng. */
export function coordenadasEnTexto(t: string): { lat: number; lng: number } | null {
  const m =
    t.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) ??
    t.match(/[?&](?:q|query|ll)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) ??
    t.match(/^\s*(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

export async function buscarDireccion(texto: string, signal?: AbortSignal): Promise<ResultadoBusqueda[]> {
  const coords = coordenadasEnTexto(texto);
  if (coords) return [{ nombre: texto.trim(), ...coords }];
  const [o, s, e, n] = CAJA_BOGOTA;
  const p = new URLSearchParams({
    q: texto,
    format: "jsonv2",
    limit: "5",
    countrycodes: "co",
    viewbox: `${o},${n},${e},${s}`,
    "accept-language": "es",
  });
  const r = await fetch(`https://nominatim.openstreetmap.org/search?${p}`, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as { display_name: string; lat: string; lon: string; addresstype?: string; type?: string }[];
  return d.map((x) => ({ nombre: x.display_name, lat: Number(x.lat), lng: Number(x.lon), tipo: ["suburb", "city_district", "borough", "quarter", "neighbourhood", "city", "town"].includes(x.addresstype ?? x.type ?? "") ? "barrio" : x.addresstype }));
}
