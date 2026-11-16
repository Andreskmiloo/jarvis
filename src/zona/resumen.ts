// Ficha de una zona: junta todas las fuentes públicas en un punto.
import { CAPAS_POI, CAPAS_ZONA, type CapaPOI } from "../config/capas";
import { atributosCercanos, geojsonRadio } from "../fuentes/arcgis";
import { cargarGuardados, geojsonGuardados } from "../fuentes/guardados";
import { aire, clima, type Aire, type Clima } from "../fuentes/openmeteo";

export interface Dato {
  etiqueta: string;
  valor: string;
}

export interface Cercano {
  capa: CapaPOI;
  total: number;
  ejemplos: { nombre: string; metros: number }[];
}

export interface Resumen {
  lat: number;
  lng: number;
  zona: Dato[];
  clima?: Clima;
  aire?: Aire;
  cerca: Cercano[];
  errores: string[];
}

/** Distancia en metros (haversine). */
export function distancia(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Centro aproximado de una geometría GeoJSON (promedio de vértices). */
export function centro(g: GeoJSON.Geometry): [number, number] | null {
  const pts: number[][] = [];
  const rec = (c: unknown): void => {
    if (Array.isArray(c) && typeof c[0] === "number") pts.push(c as number[]);
    else if (Array.isArray(c)) c.forEach(rec);
  };
  if (g.type === "GeometryCollection") g.geometries.forEach((x) => rec((x as GeoJSON.Point).coordinates));
  else rec(g.coordinates);
  if (!pts.length) return null;
  const s = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]);
  return [s[0] / pts.length, s[1] / pts.length];
}

const CERCANOS = ["tm-estaciones", "sitp", "metro", "centros-comerciales", "parques", "canchas-sinteticas", "cicloparqueaderos", "banos"];

export async function resumir(lat: number, lng: number, radio = 500, signal?: AbortSignal): Promise<Resumen> {
  const errores: string[] = [];
  const atrapar = <T>(nombre: string, p: Promise<T>) =>
    p.catch((e) => {
      if (!signal?.aborted) errores.push(`${nombre}: ${e instanceof Error ? e.message : e}`);
      return undefined;
    });

  const zonaP = Promise.all(
    CAPAS_ZONA.map((c) =>
      atrapar(c.nombre, atributosCercanos(c.ruta, lng, lat, c.radios, signal, c.donde)).then((a) => (a ? c.formatear(a) : [])),
    ),
  );
  const climaP = atrapar("Clima", clima(lat, lng, signal));
  const aireP = atrapar("Aire", aire(lat, lng, signal));
  const cercaP = Promise.all(
    CAPAS_POI.filter((c) => CERCANOS.includes(c.id)).map(async (capa): Promise<Cercano | null> => {
      const fc = capa.archivo ? await cercaGuardados(capa.archivo, lat, lng, radio) : await atrapar(capa.nombre, geojsonRadio(capa.ruta, lng, lat, radio, signal));
      if (!fc) return null;
      const ejemplos = fc.features
        .map((f) => {
          const c = f.geometry ? centro(f.geometry) : null;
          return {
            nombre: capa.titulo((f.properties ?? {}) as never),
            metros: c ? Math.round(distancia(lat, lng, c[1], c[0])) : radio,
          };
        })
        .sort((a, b) => a.metros - b.metros);
      return { capa, total: fc.features.length, ejemplos: ejemplos.slice(0, 3) };
    }),
  );

  const [zona, cl, ai, cerca] = await Promise.all([zonaP, climaP, aireP, cercaP]);
  return {
    lat,
    lng,
    zona: zona.flat(),
    clima: cl,
    aire: ai,
    cerca: cerca.filter((c): c is Cercano => c !== null),
    errores,
  };
}

/** Puntos de un archivo guardado a menos de `radio` metros. */
async function cercaGuardados(archivo: string, lat: number, lng: number, radio: number): Promise<GeoJSON.FeatureCollection | undefined> {
  const a = await cargarGuardados(archivo);
  if (!a) return undefined;
  const fc = geojsonGuardados(a);
  return { ...fc, features: fc.features.filter((f) => {
    const [x, y] = (f.geometry as GeoJSON.Point).coordinates;
    return distancia(lat, lng, y, x) <= radio;
  }) };
}
