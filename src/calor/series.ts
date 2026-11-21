// Series de calor: puntos con un valor por cuadro de tiempo (hora).
import { fechaLocal, type Siniestro } from "../fuentes/envivo";
import { CAJA_BOGOTA, type Caja } from "../fuentes/overpass";

export interface PuntoSerie {
  lng: number;
  lat: number;
  valores: number[];
}

export interface Serie {
  id: string;
  nombre: string;
  unidad: string;
  /** Radio de influencia de cada punto, en metros. */
  radioM: number;
  /** Valor que se pinta como calor máximo. */
  tope: number;
  etiquetas: string[];
  puntos: PuntoSerie[];
  /** Cuadro en el que arranca la animación (p.ej. la hora actual). */
  inicio: number;
  nota: string;
}

export function malla(caja: Caja = CAJA_BOGOTA, columnas = 6, filas = 9): { lat: number; lng: number }[] {
  const [o, s, e, n] = caja;
  const pts: { lat: number; lng: number }[] = [];
  for (let f = 0; f < filas; f++)
    for (let c = 0; c < columnas; c++)
      pts.push({
        lat: +(s + ((n - s) * (f + 0.5)) / filas).toFixed(4),
        lng: +(o + ((e - o) * (c + 0.5)) / columnas).toFixed(4),
      });
  return pts;
}

const hora12 = (h: number) => `${String(h).padStart(2, "0")}:00`;

// ---------- Siniestros de los últimos 30 días, por hora del día ----------
const PESO_GRAVEDAD = (g: string) => (/MUERT|FALLEC/i.test(g) ? 3 : /HERID/i.test(g) ? 2 : 1);

export function serieSiniestros(lista: Siniestro[], horaActual = new Date().getHours()): Serie {
  const fechas = lista.map((x) => x.fecha).filter(Boolean);
  const rango = fechas.length ? `${fechaLocal(Math.min(...fechas))} – ${fechaLocal(Math.max(...fechas))}` : "sin datos";
  return {
    id: "siniestros",
    nombre: "Siniestros de tránsito",
    unidad: "siniestros",
    radioM: 650,
    tope: 1.3,
    etiquetas: Array.from({ length: 24 }, (_, h) => hora12(h)),
    // Cada siniestro "calienta" su hora y se desvanece en las dos horas vecinas.
    puntos: lista.map((x) => ({
      lng: x.lng,
      lat: x.lat,
      valores: Array.from({ length: 24 }, (_, h) => {
        const d = Math.min(Math.abs(h - x.hora), 24 - Math.abs(h - x.hora));
        return +(PESO_GRAVEDAD(x.gravedad) * Math.max(0, 1 - d / 2.5)).toFixed(2);
      }),
    })),
    inicio: horaActual,
    nota: `${lista.length} siniestros reportados (${rango}), según la hora en que ocurrieron. Fuente: Centro de Gestión de Tránsito, Secretaría de Movilidad.`,
  };
}

// ---------- Malla de Open-Meteo (aire y lluvia, hora a hora) ----------
export type Variable = "pm2_5" | "precipitation";

export function urlMalla(variable: Variable, pts = malla()): string {
  const base = variable === "pm2_5" ? "https://air-quality-api.open-meteo.com/v1/air-quality" : "https://api.open-meteo.com/v1/forecast";
  const p = new URLSearchParams({
    latitude: pts.map((x) => x.lat).join(","),
    longitude: pts.map((x) => x.lng).join(","),
    hourly: variable,
    past_days: "1",
    forecast_days: "2",
    timezone: "America/Bogota",
  });
  return `${base}?${p}`;
}

interface RespuestaMalla {
  latitude: number;
  longitude: number;
  hourly: { time: string[] } & Record<string, (number | null)[] | string[]>;
}

export function serieMalla(variable: Variable, datos: RespuestaMalla[], ahora = new Date()): Serie {
  const tiempos = datos[0]?.hourly.time ?? [];
  // Hora local de Bogotá en el mismo formato de la API (YYYY-MM-DDTHH:00).
  const local = new Date(ahora.getTime() - 5 * 3600e3).toISOString().slice(0, 13) + ":00";
  const inicio = Math.max(0, tiempos.indexOf(local));
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const aire = variable === "pm2_5";
  return {
    id: variable,
    nombre: aire ? "Aire · PM2.5" : "Lluvia prevista",
    unidad: aire ? "µg/m³" : "mm/h",
    radioM: 5200,
    tope: aire ? 55 : 4,
    etiquetas: tiempos.map((t, i) => `${dias[new Date(t + ":00Z").getUTCDay()]} ${t.slice(11, 16)}${i > inicio ? " · pronóstico" : ""}`),
    puntos: datos.map((d) => ({
      lat: d.latitude,
      lng: d.longitude,
      valores: (d.hourly[variable] as (number | null)[]).map((v) => v ?? 0),
    })),
    inicio,
    nota: aire
      ? "Modelo CAMS vía Open-Meteo, malla de ~11 km: muestra la tendencia de la ciudad, no calle por calle."
      : "Modelo de pronóstico vía Open-Meteo: ayer, hoy y mañana hora a hora.",
  };
}

const cache = new Map<string, Promise<Serie>>();

export function cargarMalla(variable: Variable): Promise<Serie> {
  const k = `${variable}:${new Date().toISOString().slice(0, 13)}`;
  if (!cache.has(k)) {
    const p = fetch(urlMalla(variable))
      .then((r) => {
        if (r.status === 429) throw new Error("Open-Meteo: límite de consultas, intenta en un rato");
        if (!r.ok) throw new Error(`Open-Meteo HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => serieMalla(variable, Array.isArray(d) ? d : [d]));
    p.catch(() => cache.delete(k));
    cache.set(k, p);
  }
  return cache.get(k)!;
}
