// Clima y calidad del aire por coordenada. Open-Meteo: gratis, sin clave, CORS abierto.

export interface Clima {
  temperatura: number;
  sensacion: number;
  humedad: number;
  lluvia: number;
  viento: number;
  codigo: number;
  probLluviaProx3h: number;
}

export interface Aire {
  pm25: number;
  pm10: number;
  ozono: number;
  indiceUS: number;
  uv: number;
}

export function urlClima(lat: number, lng: number): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m,weather_code",
    hourly: "precipitation_probability",
    forecast_hours: "3",
    timezone: "America/Bogota",
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

export function urlAire(lat: number, lng: number): string {
  const p = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: "pm2_5,pm10,ozone,us_aqi,uv_index",
    timezone: "America/Bogota",
  });
  return `https://air-quality-api.open-meteo.com/v1/air-quality?${p}`;
}

async function pedir(url: string, signal?: AbortSignal) {
  const r = await fetch(url, { signal });
  if (r.status === 429) throw new Error("límite de consultas alcanzado, intenta en un rato");
  if (!r.ok) throw new Error(`no disponible (HTTP ${r.status})`);
  const d = await r.json();
  if (!d?.current) throw new Error("respuesta sin datos");
  return d;
}

export async function clima(lat: number, lng: number, signal?: AbortSignal): Promise<Clima> {
  const d = await pedir(urlClima(lat, lng), signal);
  const c = d.current;
  const probs: number[] = d.hourly?.precipitation_probability ?? [];
  return {
    temperatura: c.temperature_2m,
    sensacion: c.apparent_temperature,
    humedad: c.relative_humidity_2m,
    lluvia: c.precipitation,
    viento: c.wind_speed_10m,
    codigo: c.weather_code,
    probLluviaProx3h: probs.length ? Math.max(...probs) : 0,
  };
}

export async function aire(lat: number, lng: number, signal?: AbortSignal): Promise<Aire> {
  const d = await pedir(urlAire(lat, lng), signal);
  const c = d.current;
  return { pm25: c.pm2_5, pm10: c.pm10, ozono: c.ozone, indiceUS: c.us_aqi, uv: c.uv_index };
}

const CODIGOS: [number, string][] = [
  [0, "Despejado"],
  [3, "Parcialmente nublado"],
  [48, "Niebla"],
  [57, "Llovizna"],
  [67, "Lluvia"],
  [77, "Granizo/nieve"],
  [82, "Chubascos"],
  [99, "Tormenta"],
];

export function describirClima(codigo: number): string {
  for (const [max, t] of CODIGOS) if (codigo <= max) return t;
  return "—";
}

/** Categoría del índice de calidad del aire (escala US AQI). */
export function categoriaAire(aqi: number): { texto: string; color: string } {
  if (aqi <= 50) return { texto: "Buena", color: "#2ecc71" };
  if (aqi <= 100) return { texto: "Moderada", color: "#f1c40f" };
  if (aqi <= 150) return { texto: "Dañina para sensibles", color: "#e67e22" };
  if (aqi <= 200) return { texto: "Dañina", color: "#e74c3c" };
  return { texto: "Muy dañina", color: "#8e44ad" };
}
