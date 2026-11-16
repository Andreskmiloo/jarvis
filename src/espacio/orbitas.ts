// Satélites en órbita: propagación SGP4 real (satellite.js) a partir de TLE.
// Reingeniería de `src/lib/orbit.ts` y la clasificación por misión de OSIRIS
// (github.com/simplifaisoul/osiris, licencia MIT); aquí todo corre en el navegador
// y se cruza con Bogotá: qué pasa por encima de ti y cuándo.
import { degreesLat, degreesLong, ecfToLookAngles, eciToEcf, eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";

export interface Tle {
  nombre: string;
  l1: string;
  l2: string;
}

export interface Posicion {
  lat: number;
  lng: number;
  altKm: number;
}

export interface Mision {
  mision: string;
  color: string;
  icono: string;
}

/** Misión por palabra clave del nombre (orden: lo más específico primero). */
const MISIONES: [string, Mision][] = [
  ["ISS", { mision: "Estación espacial", color: "#ffd700", icono: "🛰" }],
  ["ZARYA", { mision: "Estación espacial", color: "#ffd700", icono: "🛰" }],
  ["TIANGONG", { mision: "Estación espacial", color: "#ffd700", icono: "🛰" }],
  ["CSS", { mision: "Estación espacial", color: "#ffd700", icono: "🛰" }],
  ["HST", { mision: "Telescopio espacial", color: "#ffd700", icono: "🔭" }],
  ["HUBBLE", { mision: "Telescopio espacial", color: "#ffd700", icono: "🔭" }],
  ["STARLINK", { mision: "Internet satelital", color: "#00e676", icono: "📡" }],
  ["ONEWEB", { mision: "Internet satelital", color: "#00e676", icono: "📡" }],
  ["GOES", { mision: "Clima", color: "#87ceeb", icono: "🌦" }],
  ["NOAA", { mision: "Clima", color: "#87ceeb", icono: "🌦" }],
  ["METEOSAT", { mision: "Clima", color: "#87ceeb", icono: "🌦" }],
  ["METEOR", { mision: "Clima", color: "#87ceeb", icono: "🌦" }],
  ["FENGYUN", { mision: "Clima", color: "#87ceeb", icono: "🌦" }],
  ["SENTINEL", { mision: "Observación de la Tierra", color: "#90ee90", icono: "🌍" }],
  ["LANDSAT", { mision: "Observación de la Tierra", color: "#90ee90", icono: "🌍" }],
  ["TERRA", { mision: "Observación de la Tierra", color: "#90ee90", icono: "🌍" }],
  ["AQUA", { mision: "Observación de la Tierra", color: "#90ee90", icono: "🌍" }],
  ["SUOMI", { mision: "Observación de la Tierra", color: "#90ee90", icono: "🌍" }],
  ["WORLDVIEW", { mision: "Imágenes comerciales", color: "#90ee90", icono: "🌍" }],
  ["GPS", { mision: "Navegación", color: "#448aff", icono: "🧭" }],
  ["NAVSTAR", { mision: "Navegación", color: "#448aff", icono: "🧭" }],
  ["GLONASS", { mision: "Navegación", color: "#448aff", icono: "🧭" }],
  ["GALILEO", { mision: "Navegación", color: "#448aff", icono: "🧭" }],
  ["BEIDOU", { mision: "Navegación", color: "#448aff", icono: "🧭" }],
  ["R/B", { mision: "Cuerpo de cohete", color: "#9aa0a6", icono: "🚀" }],
  ["DEB", { mision: "Basura espacial", color: "#9aa0a6", icono: "☄" }],
];

export function clasificar(nombre: string): Mision {
  const n = nombre.toUpperCase();
  for (const [k, m] of MISIONES) if (n.includes(k)) return m;
  return { mision: "Otro", color: "#00e5ff", icono: "🛰" };
}

/** Lee TLE en texto de 3 líneas (nombre, línea 1, línea 2). */
export function leerTle(texto: string): Tle[] {
  const lineas = texto.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out: Tle[] = [];
  for (let i = 0; i + 2 < lineas.length + 0; i++) {
    if (lineas[i + 1]?.startsWith("1 ") && lineas[i + 2]?.startsWith("2 ")) {
      out.push({ nombre: lineas[i].replace(/^0 /, "").trim(), l1: lineas[i + 1], l2: lineas[i + 2] });
      i += 2;
    }
  }
  return out;
}

const satrecs = new Map<string, SatRec | null>();
function satrec(t: Tle): SatRec | null {
  const k = t.l1;
  if (!satrecs.has(k)) {
    try {
      const s = twoline2satrec(t.l1, t.l2);
      satrecs.set(k, s && !(s as { error?: number }).error ? s : null);
    } catch {
      satrecs.set(k, null);
    }
  }
  return satrecs.get(k)!;
}

export const envolver = (g: number) => ((((g + 180) % 360) + 360) % 360) - 180;

/** Posición geodésica (WGS84) en un instante; null si SGP4 no puede modelarlo. */
export function posicion(t: Tle, cuando = new Date()): Posicion | null {
  const s = satrec(t);
  if (!s) return null;
  let eci;
  try {
    eci = propagate(s, cuando);
  } catch {
    return null;
  }
  const p = eci?.position;
  if (!p || typeof p === "boolean") return null;
  const g = eciToGeodetic(p, gstime(cuando));
  const lat = degreesLat(g.latitude);
  const lng = envolver(degreesLong(g.longitude));
  if (![lat, lng, g.height].every(Number.isFinite) || g.height < 80 || g.height > 60000) return null;
  return { lat, lng, altKm: g.height };
}

/** Periodo orbital en minutos (movimiento medio, revoluciones/día). */
export function periodoMin(t: Tle): number | null {
  const n = parseFloat(t.l2.substring(52, 63));
  return Number.isFinite(n) && n > 0 ? 1440 / n : null;
}

/** Una vuelta completa desde ahora, partida donde cruza el antimeridiano. */
export function trayectoria(t: Tle, desde = new Date(), pasos = 160): [number, number][][] {
  const per = periodoMin(t);
  if (!per) return [];
  const tramos: [number, number][][] = [];
  let tramo: [number, number][] = [];
  let previo: number | null = null;
  for (let i = 0; i <= pasos; i++) {
    const p = posicion(t, new Date(desde.getTime() + (per * 60_000 * i) / pasos));
    if (!p) continue;
    if (previo !== null && Math.abs(p.lng - previo) > 180) {
      if (tramo.length > 1) tramos.push(tramo);
      tramo = [];
    }
    tramo.push([p.lng, p.lat]);
    previo = p.lng;
  }
  if (tramo.length > 1) tramos.push(tramo);
  return tramos;
}

export interface Paso {
  inicio: Date;
  maximo: Date;
  fin: Date;
  elevacionMax: number;
  /** Visible durante toda la ventana (p. ej. geoestacionario). */
  siempre?: boolean;
}

/** Elevación (grados) del satélite vista desde un punto en tierra. */
export function elevacion(t: Tle, lat: number, lng: number, altKm: number, cuando: Date): number | null {
  const s = satrec(t);
  if (!s) return null;
  const eci = propagate(s, cuando)?.position;
  if (!eci || typeof eci === "boolean") return null;
  const obs = { latitude: (lat * Math.PI) / 180, longitude: (lng * Math.PI) / 180, height: altKm };
  return (ecfToLookAngles(obs, eciToEcf(eci, gstime(cuando))).elevation * 180) / Math.PI;
}

/**
 * Próximo paso visible por encima de `minimo` grados sobre el horizonte, buscando
 * hasta `horas` adelante (paso grueso de 30 s y refinamiento fino del máximo).
 */
export function proximoPaso(t: Tle, lat: number, lng: number, desde = new Date(), horas = 24, minimo = 10, altKm = 2.6): Paso | null {
  const PASO = 30_000;
  const fin = desde.getTime() + horas * 3600e3;
  let dentro: { inicio: number; max: number; elev: number } | null = null;
  for (let ms = desde.getTime(); ms <= fin; ms += PASO) {
    const e = elevacion(t, lat, lng, altKm, new Date(ms));
    if (e === null) return null;
    if (e >= minimo) {
      if (!dentro) dentro = { inicio: ms, max: ms, elev: e };
      else if (e > dentro.elev) dentro = { inicio: dentro.inicio, max: ms, elev: e };
    } else if (dentro) {
      return { inicio: new Date(dentro.inicio), maximo: new Date(dentro.max), fin: new Date(ms), elevacionMax: Math.round(dentro.elev) };
    }
  }
  // Sigue encima al final de la ventana (geoestacionario o paso largo): visible todo el tiempo.
  if (dentro) return { inicio: new Date(dentro.inicio), maximo: new Date(dentro.max), fin: new Date(fin), elevacionMax: Math.round(dentro.elev), siempre: dentro.inicio === desde.getTime() };
  return null;
}

/** Satélites que ahora mismo están sobre el horizonte de un punto. */
export function encima(lista: Tle[], lat: number, lng: number, cuando = new Date(), minimo = 10): { tle: Tle; elevacion: number }[] {
  const out: { tle: Tle; elevacion: number }[] = [];
  for (const t of lista) {
    const e = elevacion(t, lat, lng, 2.6, cuando);
    if (e !== null && e >= minimo) out.push({ tle: t, elevacion: Math.round(e) });
  }
  return out.sort((a, b) => b.elevacion - a.elevacion);
}
