// Fuentes del planeta que el navegador puede pedir directo (CORS abierto), más los
// archivos que GitHub Actions guarda cada pocas horas (TLE e incendios FIRMS).
// Fuentes elegidas con base en OSIRIS (simplifaisoul/osiris, MIT).
import { leerTle, type Tle } from "../espacio/orbitas";

// ---------- NASA EONET: eventos naturales abiertos ----------
export interface EventoNatural {
  id: string;
  titulo: string;
  categoria: string;
  icono: string;
  lat: number;
  lng: number;
  fecha: string;
  magnitud?: string;
  fuente?: string;
}

const CATEGORIAS: Record<string, [string, string]> = {
  wildfires: ["Incendio forestal", "🔥"],
  volcanoes: ["Volcán", "🌋"],
  severeStorms: ["Tormenta severa", "🌀"],
  floods: ["Inundación", "🌊"],
  landslides: ["Deslizamiento", "⛰"],
  earthquakes: ["Sismo", "〰"],
  seaLakeIce: ["Hielo", "🧊"],
  dustHaze: ["Polvo / bruma", "🌫"],
  drought: ["Sequía", "🏜"],
  snow: ["Nieve", "❄"],
  tempExtremes: ["Temperatura extrema", "🌡"],
  manmade: ["Causado por humanos", "🏭"],
  waterColor: ["Color del agua", "💧"],
};

interface EonetCrudo {
  events: { id: string; title: string; categories: { id: string }[]; sources?: { url: string }[]; geometry: { date: string; type: string; coordinates: unknown; magnitudeValue?: number; magnitudeUnit?: string }[] }[];
}

export function leerEonet(d: EonetCrudo): EventoNatural[] {
  const out: EventoNatural[] = [];
  for (const e of d.events ?? []) {
    const g = e.geometry?.[e.geometry.length - 1];
    if (!g) continue;
    let lng: number, lat: number;
    if (g.type === "Point") [lng, lat] = g.coordinates as [number, number];
    else if (g.type === "Polygon") {
      const r = (g.coordinates as number[][][])[0];
      lng = r.reduce((a, p) => a + p[0], 0) / r.length;
      lat = r.reduce((a, p) => a + p[1], 0) / r.length;
    } else continue;
    const [nombre, icono] = CATEGORIAS[e.categories?.[0]?.id] ?? ["Evento", "⚠"];
    out.push({
      id: e.id,
      titulo: e.title,
      categoria: nombre,
      icono,
      lat,
      lng,
      fecha: g.date,
      magnitud: g.magnitudeValue !== undefined ? `${g.magnitudeValue} ${g.magnitudeUnit ?? ""}`.trim() : undefined,
      fuente: e.sources?.[0]?.url,
    });
  }
  return out;
}

export async function eventosNaturales(signal?: AbortSignal): Promise<EventoNatural[]> {
  const r = await fetch("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30&limit=500", { signal });
  if (!r.ok) throw new Error(`EONET HTTP ${r.status}`);
  return leerEonet(await r.json());
}

// ---------- NOAA SWPC: índice Kp (tormentas geomagnéticas) ----------
export interface Kp {
  kp: number;
  hora: string;
  nivel: string;
}

export function nivelKp(kp: number): string {
  if (kp >= 9) return "G5 extrema";
  if (kp >= 8) return "G4 severa";
  if (kp >= 7) return "G3 fuerte";
  if (kp >= 6) return "G2 moderada";
  if (kp >= 5) return "G1 menor";
  if (kp >= 4) return "activo";
  return "tranquilo";
}

export function leerKp(d: { time_tag: string; estimated_kp?: number; kp_index?: number }[]): Kp | null {
  const u = d[d.length - 1];
  if (!u) return null;
  const kp = Math.round((u.estimated_kp ?? u.kp_index ?? 0) * 10) / 10;
  return { kp, hora: u.time_tag.endsWith("Z") ? u.time_tag : `${u.time_tag}Z`, nivel: nivelKp(kp) };
}

export async function climaEspacial(signal?: AbortSignal): Promise<Kp | null> {
  const r = await fetch("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json", { signal });
  if (!r.ok) throw new Error(`NOAA SWPC HTTP ${r.status}`);
  return leerKp(await r.json());
}

// ---------- GDELT: noticias de las últimas horas ----------
export interface Noticia {
  titulo: string;
  url: string;
  medio: string;
  fecha: Date;
  imagen?: string;
}

export function leerGdelt(d: { articles?: { title: string; url: string; domain: string; seendate: string; socialimage?: string }[] }): Noticia[] {
  const vistos = new Set<string>();
  return (d.articles ?? [])
    .map((a) => {
      const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(a.seendate);
      return {
        titulo: a.title.trim(),
        url: a.url,
        medio: a.domain,
        fecha: m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])) : new Date(NaN),
        imagen: a.socialimage || undefined,
      };
    })
    .filter((n) => {
      const k = n.titulo.toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
}

/** GDELT pide máximo una consulta cada 5 s: se encolan y se guardan 10 min. */
let cola: Promise<unknown> = Promise.resolve();
let ultimaGdelt = 0;
const cacheNoticias = new Map<string, { t: number; v: Promise<Noticia[]> }>();
export function noticias(tema: string, horas = 24, max = 15): Promise<Noticia[]> {
  const q = `"${tema}" sourcecountry:colombia`;
  const k = `${q}|${horas}|${max}`;
  const c = cacheNoticias.get(k);
  if (c && Date.now() - c.t < 600_000) return c.v;
  const p = new URLSearchParams({ query: q, mode: "artlist", format: "json", maxrecords: String(max), timespan: `${horas}h`, sort: "datedesc" });
  const v = (cola = cola
    .catch(() => undefined)
    .then(() => new Promise((ok) => setTimeout(ok, Math.max(0, ultimaGdelt + 5200 - Date.now()))))
    .then(async () => {
      ultimaGdelt = Date.now();
      const r = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?${p}`);
      const txt = await r.text();
      if (!r.ok || !txt.trim().startsWith("{")) throw new Error(txt.trim() ? "GDELT ocupado, intenta en un momento" : "sin noticias");
      return leerGdelt(JSON.parse(txt));
    })) as Promise<Noticia[]>;
  cacheNoticias.set(k, { t: Date.now(), v });
  v.catch(() => cacheNoticias.delete(k));
  return v;
}

// ---------- Archivos guardados por GitHub Actions ----------
export interface Foco {
  lat: number;
  lng: number;
  cuando: string;
  frp: number;
  confianza: string;
  satelite: string;
  dia: boolean;
}

export async function incendios(): Promise<{ generado: string; fuente: string; focos: Foco[] }> {
  const r = await fetch("data/espacio/incendios.json");
  if (!r.ok) throw new Error("sin archivo de incendios");
  return r.json();
}

export async function satelitesGuardados(): Promise<Tle[]> {
  const r = await fetch("data/espacio/tle.txt");
  if (!r.ok) throw new Error("sin archivo de satélites");
  return leerTle(await r.text());
}
