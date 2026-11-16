// Cúpulas de calor: una por localidad. La altura y el color siguen el valor de cada
// hora y una onda de radar palpita en el suelo desde el centro.
import type { ExpressionSpecification, Map as Mapa } from "maplibre-gl";
import { ARCGIS_BASE } from "../config/capas";
import { expresionPeso, expresionRadio } from "./expresiones";
import type { Serie } from "./series";

export interface Localidad {
  nombre: string;
  centro: [number, number]; // lng, lat
  radioM: number;
  anillos: number[][][]; // polígonos (solo anillo exterior)
}

const M_POR_GRADO = 111_320;
const ANILLOS = 7;

/** Centroide y área (m²) de un anillo, por la fórmula del polígono. */
export function centroide(anillo: number[][]): { centro: [number, number]; area: number } {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const f = anillo[j][0] * anillo[i][1] - anillo[i][0] * anillo[j][1];
    a += f;
    cx += (anillo[j][0] + anillo[i][0]) * f;
    cy += (anillo[j][1] + anillo[i][1]) * f;
  }
  a /= 2;
  if (!a) return { centro: [anillo[0][0], anillo[0][1]], area: 0 };
  const lat = cy / (6 * a);
  return { centro: [cx / (6 * a), lat], area: Math.abs(a) * M_POR_GRADO * M_POR_GRADO * Math.cos((lat * Math.PI) / 180) };
}

export function dentro(lng: number, lat: number, anillo: number[][]): boolean {
  let d = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d;
  }
  return d;
}

export function leerLocalidades(fc: GeoJSON.FeatureCollection): Localidad[] {
  const lista: Localidad[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g || (g.type !== "Polygon" && g.type !== "MultiPolygon")) continue;
    const anillos = (g.type === "Polygon" ? [g.coordinates] : g.coordinates).map((p) => p[0]);
    const mayor = anillos.map((a) => ({ a, ...centroide(a) })).sort((x, y) => y.area - x.area)[0];
    if (!mayor?.area) continue;
    lista.push({
      nombre: String(f.properties?.LOCNOMBRE ?? "—"),
      centro: mayor.centro,
      // Radio proporcional al tamaño, acotado para que las localidades rurales no tapen la ciudad.
      radioM: Math.min(3000, Math.max(900, Math.sqrt(mayor.area / Math.PI) * 0.55)),
      anillos,
    });
  }
  return lista;
}

/** Valor por cuadro de cada localidad: suma (conteos) o promedio (mallas) de sus puntos. */
export function agregar(serie: Serie, locs: Localidad[], modo: "suma" | "promedio"): number[][] {
  const n = serie.etiquetas.length;
  return locs.map((l) => {
    let dentroDe = serie.puntos.filter((p) => l.anillos.some((a) => dentro(p.lng, p.lat, a)));
    if (!dentroDe.length && modo === "promedio") {
      // Malla gruesa: se toma el punto más cercano al centro.
      const d = (p: { lng: number; lat: number }) => (p.lng - l.centro[0]) ** 2 + (p.lat - l.centro[1]) ** 2;
      dentroDe = [...serie.puntos].sort((x, y) => d(x) - d(y)).slice(0, 1);
    }
    const v = new Array<number>(n).fill(0);
    for (const p of dentroDe) for (let i = 0; i < n; i++) v[i] += p.valores[i] ?? 0;
    return modo === "promedio" && dentroDe.length ? v.map((x) => x / dentroDe.length) : v;
  });
}

function circulo([lng, lat]: [number, number], radioM: number, lados = 40): number[][] {
  const dy = radioM / M_POR_GRADO;
  const dx = dy / Math.cos((lat * Math.PI) / 180);
  const pts: number[][] = [];
  for (let i = 0; i <= lados; i++) {
    const t = (i / lados) * 2 * Math.PI;
    pts.push([+(lng + dx * Math.cos(t)).toFixed(6), +(lat + dy * Math.sin(t)).toFixed(6)]);
  }
  return pts;
}

/**
 * Cada cúpula son cilindros concéntricos: radio r·cos(θ) y altura proporcional a sin(θ).
 * `k` guarda esa proporción y `v0..vN` el valor normalizado (0..1) de cada cuadro.
 */
export function geojsonCupulas(locs: Localidad[], valores: number[][], tope: number): { domos: GeoJSON.FeatureCollection; centros: GeoJSON.FeatureCollection } {
  const domos: GeoJSON.Feature[] = [];
  const centros: GeoJSON.Feature[] = [];
  locs.forEach((l, li) => {
    const v: Record<string, number> = {};
    valores[li].forEach((x, i) => (v[`v${i}`] = +Math.min(1, x / tope).toFixed(3)));
    if (!valores[li].some((x) => x > 0)) return;
    for (let a = 0; a < ANILLOS; a++) {
      const t = ((a + 0.5) / ANILLOS) * (Math.PI / 2);
      domos.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [circulo(l.centro, l.radioM * Math.cos(t))] },
        properties: { ...v, k: +(Math.sin(t) * l.radioM * 1.6).toFixed(1), nombre: l.nombre },
      });
    }
    centros.push({ type: "Feature", geometry: { type: "Point", coordinates: l.centro }, properties: { ...v, r: l.radioM, nombre: l.nombre } });
  });
  return { domos: { type: "FeatureCollection", features: domos }, centros: { type: "FeatureCollection", features: centros } };
}

const RAMPA = (peso: ExpressionSpecification): ExpressionSpecification => ["interpolate", ["linear"], peso, 0, "#ffe45c", 0.35, "#ffa200", 0.7, "#ff5a00", 1, "#ff003c"];

let cacheLoc: Promise<Localidad[]> | null = null;
export function cargarLocalidades(): Promise<Localidad[]> {
  if (!cacheLoc) {
    const p = new URLSearchParams({ where: "1=1", outFields: "LOCNOMBRE", outSR: "4326", maxAllowableOffset: "0.0006", f: "geojson" });
    cacheLoc = fetch(`${ARCGIS_BASE}/ordenamientoterritorial/localidad/MapServer/0/query?${p}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(leerLocalidades);
    cacheLoc.catch(() => (cacheLoc = null));
  }
  return cacheLoc;
}

export class Cupulas {
  private total = 0;
  private ultimoQ = -1;
  activo = false;

  constructor(private mapa: Mapa, private antesDe?: string) {}

  mostrar(serie: Serie, locs: Localidad[], modo: "suma" | "promedio") {
    this.ocultar();
    const valores = agregar(serie, locs, modo);
    const maximo = Math.max(...valores.flat());
    // Los conteos se comparan entre localidades; las mallas usan el tope físico de la variable.
    const { domos, centros } = geojsonCupulas(locs, valores, modo === "suma" ? Math.max(1, maximo) : serie.tope);
    this.total = serie.etiquetas.length;
    this.ultimoQ = -1;
    const m = this.mapa;
    const antes = this.antesDe && m.getLayer(this.antesDe) ? this.antesDe : undefined;
    m.addSource("cupulas", { type: "geojson", data: domos });
    m.addSource("cupulas-centro", { type: "geojson", data: centros });
    const peso = expresionPeso(serie.inicio, this.total);
    m.addLayer(
      {
        id: "cupulas-onda",
        type: "circle",
        source: "cupulas-centro",
        paint: {
          "circle-pitch-alignment": "map",
          "circle-color": "rgba(0,0,0,0)",
          "circle-stroke-color": RAMPA(peso),
          "circle-stroke-width": 2,
          "circle-stroke-opacity": 0,
          "circle-radius": 0,
        },
      },
      antes,
    );
    m.addLayer(
      {
        id: "cupulas",
        type: "fill-extrusion",
        source: "cupulas",
        paint: {
          "fill-extrusion-color": RAMPA(peso),
          "fill-extrusion-height": ["*", ["get", "k"], peso],
          "fill-extrusion-opacity": 0.32,
          "fill-extrusion-vertical-gradient": false,
        },
      },
      antes,
    );
    this.activo = true;
  }

  /** `cuadro` puede ser fraccionario; `t` es el reloj (ms) para la palpitación. */
  pintar(cuadro: number, t: number, palpita: boolean) {
    if (!this.activo || !this.mapa.getLayer("cupulas")) return;
    const m = this.mapa;
    // La cúpula (cara: fill-extrusion) solo cambia cuando el cuadro avanza ~0,1; la onda de
    // radar (barata: un círculo) es la que late cada 2,6 s.
    const q = Math.round(cuadro * 10) / 10;
    if (q !== this.ultimoQ) {
      this.ultimoQ = q;
      const peso = expresionPeso(q, this.total);
      m.setPaintProperty("cupulas", "fill-extrusion-height", ["*", ["get", "k"], ["+", 0.08, ["*", 0.92, peso]]]);
      m.setPaintProperty("cupulas", "fill-extrusion-color", RAMPA(peso));
      m.setPaintProperty("cupulas-onda", "circle-stroke-color", RAMPA(peso));
    }
    if (!palpita) return;
    const fase = (t % 2600) / 2600;
    const px = expresionRadio(1) as unknown as [string, unknown, unknown, number, number, number, number];
    m.setPaintProperty("cupulas-onda", "circle-radius", ["interpolate", ["exponential", 2], ["zoom"], 0, ["*", ["get", "r"], px[4] * 1.9 * fase], 22, ["*", ["get", "r"], px[6] * 1.9 * fase]]);
    m.setPaintProperty("cupulas-onda", "circle-stroke-opacity", 0.9 * (1 - fase) ** 1.5);
  }

  ocultar() {
    const m = this.mapa;
    for (const id of ["cupulas", "cupulas-onda"]) if (m.getLayer(id)) m.removeLayer(id);
    for (const id of ["cupulas", "cupulas-centro"]) if (m.getSource(id)) m.removeSource(id);
    this.activo = false;
  }
}
