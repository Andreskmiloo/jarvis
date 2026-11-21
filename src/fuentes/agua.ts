// Agua: caudal de ríos y quebradas (Open-Meteo Flood, modelo GloFAS) y lluvia de los
// últimos 30 días frente a lo normal (Open-Meteo histórico ERA5). CORS abierto, sin clave.
export interface Rio {
  hoy: number; // m³/s
  mediana: number;
  relacion: number; // hoy / mediana
  nivel: "bajo" | "normal" | "alto" | "muy alto";
  proximos: { fecha: string; caudal: number }[];
}

export function nivelRio(rel: number): Rio["nivel"] {
  if (rel >= 2) return "muy alto";
  if (rel >= 1.3) return "alto";
  if (rel <= 0.6) return "bajo";
  return "normal";
}

export function leerRio(d: { daily?: { time: string[]; river_discharge: (number | null)[]; river_discharge_median: (number | null)[] } }, hoyISO: string): Rio | null {
  const t = d.daily;
  if (!t) return null;
  let i = t.time.indexOf(hoyISO);
  if (i < 0) i = t.time.length - 1;
  const hoy = t.river_discharge[i], med = t.river_discharge_median[i];
  if (hoy == null || med == null || med <= 0) return null;
  const relacion = hoy / med;
  return {
    hoy,
    mediana: med,
    relacion: Math.round(relacion * 100) / 100,
    nivel: nivelRio(relacion),
    proximos: t.time.slice(i + 1).map((f, k) => ({ fecha: f, caudal: t.river_discharge[i + 1 + k] ?? 0 })),
  };
}

const hoyBogota = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);

export async function rio(lat: number, lng: number, signal?: AbortSignal): Promise<Rio | null> {
  const p = new URLSearchParams({ latitude: String(lat), longitude: String(lng), daily: "river_discharge,river_discharge_median", past_days: "1", forecast_days: "5" });
  const r = await fetch(`https://flood-api.open-meteo.com/v1/flood?${p}`, { signal });
  if (!r.ok) throw new Error(`Caudal HTTP ${r.status}`);
  return leerRio(await r.json(), hoyBogota());
}

export interface Lluvia {
  ultimos30: number; // mm
  normal: number; // promedio de los mismos 30 días en años anteriores
  relacion: number;
  texto: string;
}

export function compararLluvia(ultimos: number, anteriores: number[]): Lluvia | null {
  const v = anteriores.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  const normal = v.reduce((a, b) => a + b, 0) / v.length;
  const relacion = normal > 0 ? ultimos / normal : 1;
  const texto = relacion >= 1.4 ? "mucho más lluvia de lo normal" : relacion >= 1.1 ? "algo más lluviosa de lo normal" : relacion <= 0.6 ? "mucho más seca de lo normal" : relacion <= 0.9 ? "algo más seca de lo normal" : "lluvia normal para la época";
  return { ultimos30: Math.round(ultimos), normal: Math.round(normal), relacion: Math.round(relacion * 100) / 100, texto };
}

/** Suma la lluvia de cada ventana [inicio, fin] (fechas ISO) sobre una serie diaria. */
export function sumarVentanas(fechas: string[], lluvia: (number | null)[], ventanas: [string, string][]): number[] {
  return ventanas.map(([a, b]) => fechas.reduce((s, f, i) => (f >= a && f <= b ? s + (lluvia[i] ?? 0) : s), 0));
}

/**
 * Lluvia acumulada de los últimos 30 días vs. los mismos días de los 5 años anteriores.
 * Una sola consulta con la serie diaria de 5 años (Open-Meteo pide uso moderado).
 */
export async function lluviaVsNormal(lat: number, lng: number, signal?: AbortSignal): Promise<Lluvia | null> {
  const fin = new Date(Date.now() - 5 * 3600e3 - 2 * 864e5); // ERA5 llega con ~2 días de retraso
  const ini = new Date(fin.getTime() - 29 * 864e5);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const ventanas = [0, 1, 2, 3, 4, 5].map((k) => {
    const a = new Date(ini), b = new Date(fin);
    a.setUTCFullYear(a.getUTCFullYear() - k);
    b.setUTCFullYear(b.getUTCFullYear() - k);
    return [iso(a), iso(b)] as [string, string];
  });
  const p = new URLSearchParams({ latitude: lat.toFixed(3), longitude: lng.toFixed(3), start_date: ventanas[5][0], end_date: ventanas[0][1], daily: "precipitation_sum", timezone: "America/Bogota" });
  const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?${p}`, { signal });
  if (r.status === 429) throw new Error("límite de consultas, intenta en un rato");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = (await r.json()) as { daily?: { time: string[]; precipitation_sum: (number | null)[] } };
  if (!d.daily) return null;
  const sumas = sumarVentanas(d.daily.time, d.daily.precipitation_sum, ventanas);
  return compararLluvia(sumas[0], sumas.slice(1));
}
