import { ARCGIS_BASE, type Atributos } from "../config/capas";

export interface ConsultaPunto {
  lng: number;
  lat: number;
  /** Radio de búsqueda en metros (0 = solo intersección exacta). */
  radio?: number;
  limite?: number;
  geometria?: boolean;
}

export function urlConsultaPunto(ruta: string, c: ConsultaPunto): string {
  const p = new URLSearchParams({
    geometry: `${c.lng},${c.lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: String(c.geometria ?? false),
    f: c.geometria ? "geojson" : "json",
  });
  if (c.radio) {
    p.set("distance", String(c.radio));
    p.set("units", "esriSRUnit_Meter");
  }
  if (c.limite) p.set("resultRecordCount", String(c.limite));
  return `${ARCGIS_BASE}/${ruta}/query?${p}`;
}

export function urlConsultaCaja(
  ruta: string,
  [oeste, sur, este, norte]: [number, number, number, number],
  limite = 2000,
): string {
  const p = new URLSearchParams({
    geometry: `${oeste},${sur},${este},${norte}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "true",
    resultRecordCount: String(limite),
    f: "geojson",
  });
  return `${ARCGIS_BASE}/${ruta}/query?${p}`;
}

async function pedir<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
  if (d && d.error) throw new Error(d.error.message ?? "Error ArcGIS");
  return d as T;
}

/** Atributos de los elementos de una capa en un punto. */
export async function atributosEnPunto(
  ruta: string,
  c: ConsultaPunto,
  signal?: AbortSignal,
): Promise<Atributos[]> {
  const d = await pedir<{ features?: { attributes: Atributos }[] }>(urlConsultaPunto(ruta, c), signal);
  return (d.features ?? []).map((f) => f.attributes);
}

/** Prueba radios crecientes hasta encontrar algo (manzanas no cubren las vías). */
export async function atributosCercanos(
  ruta: string,
  lng: number,
  lat: number,
  radios: number[] = [0],
  signal?: AbortSignal,
): Promise<Atributos | null> {
  for (const radio of radios) {
    const r = await atributosEnPunto(ruta, { lng, lat, radio, limite: 1 }, signal);
    if (r.length) return r[0];
  }
  return null;
}

export async function geojsonCaja(
  ruta: string,
  caja: [number, number, number, number],
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  return pedir(urlConsultaCaja(ruta, caja), signal);
}

export async function geojsonRadio(
  ruta: string,
  lng: number,
  lat: number,
  radio: number,
  signal?: AbortSignal,
): Promise<GeoJSON.FeatureCollection> {
  return pedir(urlConsultaPunto(ruta, { lng, lat, radio, geometria: true, limite: 200 }), signal);
}
