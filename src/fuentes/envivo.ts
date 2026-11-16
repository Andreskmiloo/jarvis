// Fuentes en tiempo real o casi real. Todas públicas y con CORS abierto.

const SDM = "https://services2.arcgis.com/NEwhEo9GGSHXcRXV/arcgis/rest/services";
const SIMUR = "https://sig.simur.gov.co/arcgis/rest/services";

async function json<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (d?.error) throw new Error(d.error.message ?? "error del servidor");
  return d as T;
}

// ---------- Semáforos (Secretaría de Movilidad, tiempo real) ----------
export interface FallaSemaforo {
  id: number;
  direccion: string;
  estado: string;
  localidad: string;
  tiempo: string;
  lat: number;
  lng: number;
}

export interface EstadoSemaforos {
  total: number;
  enServicio: number;
  fallas: FallaSemaforo[];
}

type Attrs = Record<string, string | number | null>;

const URL_SEMAFOROS = `${SDM}/FALLAS_TIEMPO_REAL_V1/FeatureServer/0/query`;

/** Solo las intersecciones que NO están en servicio (el servidor entrega máximo 1000 filas por consulta). */
export function urlSemaforos(): string {
  const p = new URLSearchParams({
    where: "ESTADO <> 'EN SERVICIO'",
    outFields: "ID,DIRECCION,ESTADO,LOCALIDAD,TIEMPO_TRANSCURRIDO,LATITUD,LONGITUD",
    returnGeometry: "false",
    f: "json",
  });
  return `${URL_SEMAFOROS}?${p}`;
}

export function leerSemaforos(features: { attributes: Attrs }[]): EstadoSemaforos {
  const fallas: FallaSemaforo[] = [];
  let enServicio = 0;
  for (const { attributes: a } of features) {
    const estado = String(a.ESTADO ?? "").trim().toUpperCase();
    if (estado === "EN SERVICIO") {
      enServicio++;
      continue;
    }
    const lat = Number(a.LATITUD);
    const lng = Number(a.LONGITUD);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) continue;
    fallas.push({
      id: Number(a.ID),
      direccion: String(a.DIRECCION ?? "—"),
      estado: estado || "SIN DATO",
      localidad: String(a.LOCALIDAD ?? "—"),
      tiempo: String(a.TIEMPO_TRANSCURRIDO ?? ""),
      lat,
      lng,
    });
  }
  return { total: features.length, enServicio, fallas };
}

export async function semaforos(signal?: AbortSignal): Promise<EstadoSemaforos> {
  const [d, c] = await Promise.all([
    json<{ features: { attributes: Attrs }[] }>(urlSemaforos(), signal),
    json<{ count: number }>(`${URL_SEMAFOROS}?where=1%3D1&returnCountOnly=true&f=json`, signal),
  ]);
  const e = leerSemaforos(d.features ?? []);
  return { total: c.count, enServicio: c.count - e.fallas.length, fallas: e.fallas };
}

// ---------- Cámaras (ubicación y estado; Bogotá no publica video) ----------
export interface Camara {
  id: string;
  direccion: string;
  tipo: string;
  estado: string;
  lat: number;
  lng: number;
  detalle?: string;
}

export function leerCamarasCGT(features: { attributes: Attrs }[]): Camara[] {
  return features
    .map(({ attributes: a }) => ({
      id: String(a.ID ?? a.FID),
      direccion: String(a.DIRECCION ?? "—"),
      tipo: "Cámara de tráfico (CGT)",
      estado: String(a.ESTADO ?? "—"),
      lat: Number(a.LATITUD),
      lng: Number(a.LONGITUD),
    }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
}

export function leerFotodeteccion(features: { attributes: Attrs }[]): Camara[] {
  return features
    .map(({ attributes: a }) => ({
      id: `foto-${a.OBJECTID}`,
      direccion: String(a.DIRECCION_FOTODETECCION ?? "—"),
      tipo: `Fotodetección${a.TIPO_FOTODETECCION ? ` · ${a.TIPO_FOTODETECCION}` : ""}`,
      estado: String(a.ESTADO_PUNTO ?? "—"),
      lat: Number(a.LATITUD),
      lng: Number(a.LONGITUD),
      detalle: a.VELOCIDAD_FISCALIZACION ? `Límite ${a.VELOCIDAD_FISCALIZACION} km/h` : undefined,
    }))
    .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng) && c.lat !== 0);
}

export async function camaras(signal?: AbortSignal): Promise<Camara[]> {
  const q = "query?where=1%3D1&outFields=*&returnGeometry=false&resultRecordCount=2000&f=json";
  const [cgt, foto] = await Promise.allSettled([
    json<{ features: { attributes: Attrs }[] }>(`${SDM}/Camaras_PP/FeatureServer/0/${q}`, signal),
    json<{ features: { attributes: Attrs }[] }>(`${SIMUR}/DatosAbiertos/CamarasSalvavidas/FeatureServer/0/${q}`, signal),
  ]);
  const lista = [
    ...(cgt.status === "fulfilled" ? leerCamarasCGT(cgt.value.features ?? []) : []),
    ...(foto.status === "fulfilled" ? leerFotodeteccion(foto.value.features ?? []) : []),
  ];
  if (!lista.length) throw new Error("sin respuesta de las capas de cámaras");
  return lista;
}

// ---------- Siniestros de los últimos 30 días (SIMUR, Centro de Gestión de Tránsito) ----------
export interface Siniestro {
  fecha: number; // epoch ms (hora local guardada como UTC en la fuente)
  hora: number; // 0-23, hora local
  direccion: string;
  gravedad: string;
  clase: string;
  localidad: string;
  lat: number;
  lng: number;
}

export function leerSiniestros(features: { attributes: Attrs; geometry?: { x: number; y: number } }[]): Siniestro[] {
  return features
    .filter((f) => f.geometry && Number.isFinite(f.geometry.x) && f.geometry.y > 3 && f.geometry.y < 6)
    .map(({ attributes: a, geometry }) => ({
      fecha: Number(a.FECHA_HORA_ACC ?? a.FECHA_OCURRENCIA_ACC ?? 0),
      hora: Number(String(a.HORA_OCURRENCIA_ACC ?? "0").split(":")[0]) || 0,
      direccion: String(a.DIRECCION ?? "—"),
      gravedad: String(a.GRAVEDAD ?? "—"),
      clase: String(a.CLASE_ACC ?? "—"),
      localidad: String(a.LOCALIDAD ?? "—"),
      lat: geometry!.y,
      lng: geometry!.x,
    }))
    .sort((x, y) => y.fecha - x.fecha);
}

export async function siniestrosRecientes(signal?: AbortSignal): Promise<Siniestro[]> {
  // outFields=* falla en este servicio: se piden los campos uno a uno.
  const p = new URLSearchParams({
    where: "1=1",
    outFields: "FECHA_HORA_ACC,HORA_OCURRENCIA_ACC,DIRECCION,GRAVEDAD,CLASE_ACC,LOCALIDAD",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });
  const d = await json<{ features: { attributes: Attrs; geometry?: { x: number; y: number } }[] }>(
    `${SIMUR}/CentroGestion/accidentalidad_30dias/FeatureServer/1/query?${p}`,
    signal,
  );
  return leerSiniestros(d.features ?? []);
}

/** Fecha corta de un instante que la fuente guarda en hora local como UTC. */
export function fechaLocal(ms: number): string {
  const d = new Date(ms);
  const mes = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getUTCMonth()];
  return `${d.getUTCDate()} ${mes} ${d.getUTCFullYear()}`;
}

// ---------- Sismos (USGS) ----------
export interface Sismo {
  id: string;
  magnitud: number;
  lugar: string;
  fecha: number;
  profundidad: number;
  lat: number;
  lng: number;
}

export function urlSismos(dias = 30, ahora = Date.now()): string {
  const p = new URLSearchParams({
    format: "geojson",
    latitude: "4.65",
    longitude: "-74.08",
    maxradiuskm: "400",
    starttime: new Date(ahora - dias * 864e5).toISOString().slice(0, 10),
    orderby: "time",
    limit: "50",
  });
  return `https://earthquake.usgs.gov/fdsnws/event/1/query?${p}`;
}

export async function sismos(signal?: AbortSignal): Promise<Sismo[]> {
  const d = await json<GeoJSON.FeatureCollection<GeoJSON.Point>>(urlSismos(), signal);
  return d.features.map((f) => ({
    id: String(f.id),
    magnitud: Number(f.properties?.mag ?? 0),
    lugar: String(f.properties?.place ?? "—"),
    fecha: Number(f.properties?.time ?? 0),
    profundidad: f.geometry.coordinates[2] ?? 0,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}

// ---------- Radar de lluvia (RainViewer) ----------
export interface CuadroRadar {
  tiempo: number; // epoch s
  plantilla: string; // teselas {z}/{x}/{y}
}

export function leerRadar(d: { host: string; radar?: { past?: { time: number; path: string }[]; nowcast?: { time: number; path: string }[] } }): CuadroRadar[] {
  return [...(d.radar?.past ?? []), ...(d.radar?.nowcast ?? [])].map((c) => ({
    tiempo: c.time,
    plantilla: `${d.host}${c.path}/256/{z}/{x}/{y}/2/1_1.png`,
  }));
}

export async function radar(signal?: AbortSignal): Promise<CuadroRadar[]> {
  return leerRadar(await json("https://api.rainviewer.com/public/weather-maps.json", signal));
}

export function hace(ms: number, ahora = Date.now()): string {
  const s = Math.max(0, Math.round((ahora - ms) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) return `hace ${Math.round(s / 3600)} h`;
  return `hace ${Math.round(s / 86400)} d`;
}
