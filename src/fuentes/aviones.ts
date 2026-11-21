// Aviones en tiempo real (ADS-B) desde OpenSky Network.
// OpenSky no permite consultas directas desde otras páginas (CORS), así que la app
// usa un puente: VITE_AVIONES_URL apunta al Worker de workers/aviones-proxy.js.

export interface Avion {
  icao: string;
  vuelo: string;
  pais: string;
  lat: number;
  lng: number;
  /** Altitud sobre el nivel del mar, en metros. */
  altitud: number;
  /** m/s */
  velocidad: number;
  /** grados desde el norte */
  rumbo: number;
  vertical: number;
  enTierra: boolean;
  /** epoch s de la última posición */
  visto: number;
}

export const CAJA_AVIONES = { lamin: 3.9, lomin: -75.0, lamax: 5.5, lomax: -73.2 };
export const URL_PUENTE: string = import.meta.env.VITE_AVIONES_URL ?? "";

export function urlAviones(base = URL_PUENTE): string {
  const p = new URLSearchParams(Object.entries(CAJA_AVIONES).map(([k, v]) => [k, String(v)]));
  return `${base || "https://opensky-network.org/api/states/all"}?${p}`;
}

type Estado = (string | number | boolean | null)[];

/** Formato "states" de OpenSky: un arreglo por avión. */
export function leerAviones(d: { time?: number; states?: Estado[] | null }): Avion[] {
  return (d.states ?? [])
    .map((s) => ({
      icao: String(s[0]),
      vuelo: String(s[1] ?? "").trim() || String(s[0]).toUpperCase(),
      pais: String(s[2] ?? ""),
      visto: Number(s[4] ?? d.time ?? 0),
      lng: Number(s[5]),
      lat: Number(s[6]),
      altitud: Number(s[13] ?? s[7] ?? 0),
      enTierra: Boolean(s[8]),
      velocidad: Number(s[9] ?? 0),
      rumbo: Number(s[10] ?? 0),
      vertical: Number(s[11] ?? 0),
    }))
    .filter((a) => Number.isFinite(a.lat) && Number.isFinite(a.lng) && s0(a));
}
const s0 = (a: Avion) => a.lat !== 0 || a.lng !== 0;

export async function aviones(signal?: AbortSignal): Promise<{ lista: Avion[]; hora: number }> {
  const r = await fetch(urlAviones(), { signal });
  if (r.status === 429) throw new Error("OpenSky: límite de consultas, reintento en un rato");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  return { lista: leerAviones(d), hora: Number(d.time ?? Date.now() / 1000) };
}

/** Posición estimada `seg` segundos después, con rumbo y velocidad (para animar entre lecturas). */
export function avanzar(a: Avion, seg: number): { lat: number; lng: number; altitud: number } {
  if (a.enTierra || !a.velocidad) return { lat: a.lat, lng: a.lng, altitud: a.altitud };
  const d = a.velocidad * Math.max(0, Math.min(seg, 60));
  const r = (a.rumbo * Math.PI) / 180;
  const lat = a.lat + (d * Math.cos(r)) / 111_320;
  const lng = a.lng + (d * Math.sin(r)) / (111_320 * Math.cos((a.lat * Math.PI) / 180));
  return { lat, lng, altitud: a.altitud + a.vertical * Math.max(0, Math.min(seg, 60)) };
}

// ---------- Tipo de aeronave por indicativo (idea de OSIRIS, MIT; reglas para Colombia) ----------
export type TipoAvion = "comercial" | "carga" | "estatal" | "privado" | "desconocido";

/** Prefijos OACI de aerolíneas que operan en Bogotá (pasajeros y carga). */
const AEROLINEAS = new Set(["AVA", "LAN", "LPE", "LXP", "ARE", "RPB", "JAT", "VVC", "SKU", "CMP", "AAL", "UAL", "DAL", "JBU", "NKS", "IBE", "AFR", "KLM", "DLH", "TPU", "TAI", "AMX", "AEA", "CUB", "VOI", "AZU", "GLO", "BOV", "AMV", "SRU", "EZA", "SAE", "TPA", "LCO", "AVB", "NSE", "CKS", "ABX", "FDX", "UPS", "GTI", "DAE", "KRE", "SWL", "LTG"]);
const CARGA = new Set(["TPA", "LCO", "CKS", "ABX", "FDX", "UPS", "GTI", "DAE", "AVB", "KRE", "SWL", "LTG"]);
/** Fuerza Aérea, Ejército, Armada, Policía y aviación de Estado de Colombia. */
const ESTATAL = ["FAC", "EJC", "ARC", "PNC"];

export function tipoAvion(indicativo: string): TipoAvion {
  const v = indicativo.trim().toUpperCase();
  if (!v) return "desconocido";
  const pre = v.slice(0, 3);
  if (ESTATAL.includes(pre) && /\d/.test(v.slice(3))) return "estatal";
  if (CARGA.has(pre) && /^\d/.test(v.slice(3))) return "carga";
  if (AEROLINEAS.has(pre) && /^\d/.test(v.slice(3))) return "comercial";
  // Matrícula como indicativo (aviación general): HK-1234, N123AB, etc.
  if (/^HK\d{3,4}[A-Z]?$/.test(v) || /^N\d{1,5}[A-Z]{0,2}$/.test(v) || /^[A-Z]{2}[A-Z0-9]{3,4}$/.test(v)) return "privado";
  if (/^[A-Z]{3}\d/.test(v)) return "comercial";
  return "desconocido";
}

export const COLOR_TIPO: Record<TipoAvion, string> = { comercial: "#ffffff", carga: "#ffb300", estatal: "#ff5252", privado: "#40c4ff", desconocido: "#b0bec5" };
