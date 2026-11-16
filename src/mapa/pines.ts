// Pines 3D: cada punto de interés se dibuja como un alfiler extruido (tallo + cabeza)
// del color de su categoría. Se recalculan al cambiar el zoom para que conserven
// su tamaño en pantalla.
import type { GeoJSONSource, Map as Mapa } from "maplibre-gl";

export interface EstiloPin {
  /** Color fijo o función según las propiedades del punto. */
  color: string | ((p: Record<string, unknown>) => string);
  /** Multiplicador de tamaño (1 = normal). */
  escala?: number;
}

interface Grupo {
  puntos: GeoJSON.Feature<GeoJSON.Point>[];
  estilo: EstiloPin;
}

const ZOOM_MIN = 11.5;
const LADOS = 8;
const MAX_PINES = 2500;

/** Metros por píxel a una latitud y zoom (teselas de 512 px de MapLibre). */
export function metrosPorPixel(lat: number, zoom: number): number {
  return (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

export function poligono(lng: number, lat: number, radioM: number, lados = LADOS): number[][] {
  const dy = radioM / 111_320;
  const dx = dy / Math.cos((lat * Math.PI) / 180);
  const pts: number[][] = [];
  for (let i = 0; i <= lados; i++) {
    const t = (i / lados) * 2 * Math.PI + Math.PI / lados;
    pts.push([lng + dx * Math.cos(t), lat + dy * Math.sin(t)]);
  }
  return pts;
}

/** Convierte puntos en polígonos de tallo y cabeza con alturas en metros. */
export function geometriaPines(puntos: { lng: number; lat: number; color: string; escala: number; props: Record<string, unknown> }[], zoom: number): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const p of puntos.slice(0, MAX_PINES)) {
    const m = metrosPorPixel(p.lat, zoom) * p.escala;
    const alto = 30 * m;
    const props = { ...p.props, __color: p.color };
    features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [poligono(p.lng, p.lat, 1.3 * m, 6)] }, properties: { ...props, __base: 0, __alto: alto, __parte: "tallo" } });
    features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [poligono(p.lng, p.lat, 5 * m)] }, properties: { ...props, __base: alto, __alto: alto + 9 * m, __parte: "cabeza" } });
  }
  return { type: "FeatureCollection", features };
}

export class Pines {
  private grupos = new Map<string, Grupo>();
  private listo = false;
  private pendiente = 0;
  activo = true;

  constructor(private mapa: Mapa) {
    const crear = () => {
      mapa.addSource("pines-3d", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mapa.addLayer(
        {
          id: "pines-3d",
          type: "fill-extrusion",
          source: "pines-3d",
          minzoom: ZOOM_MIN,
          paint: {
            "fill-extrusion-color": ["case", ["==", ["get", "__parte"], "tallo"], "#e8e8e6", ["get", "__color"]],
            "fill-extrusion-base": ["get", "__base"],
            "fill-extrusion-height": ["get", "__alto"],
            "fill-extrusion-opacity": 0.95,
            "fill-extrusion-vertical-gradient": true,
          },
        },
        mapa.getLayer("nombres-vias") ? "nombres-vias" : undefined,
      );
      this.listo = true;
      this.dibujar();
    };
    if (mapa.loaded()) crear();
    else mapa.once("load", crear);
    mapa.on("zoomend", () => this.programar());
  }

  poner(grupo: string, fc: GeoJSON.FeatureCollection, estilo: EstiloPin) {
    const puntos = fc.features.filter((f): f is GeoJSON.Feature<GeoJSON.Point> => f.geometry?.type === "Point");
    if (puntos.length) this.grupos.set(grupo, { puntos, estilo });
    else this.grupos.delete(grupo);
    this.programar();
  }

  quitar(grupo: string) {
    if (this.grupos.delete(grupo)) this.programar();
  }

  alternar(activo: boolean) {
    this.activo = activo;
    if (this.listo) this.mapa.setLayoutProperty("pines-3d", "visibility", activo ? "visible" : "none");
  }

  private programar() {
    cancelAnimationFrame(this.pendiente);
    this.pendiente = requestAnimationFrame(() => this.dibujar());
  }

  private dibujar() {
    if (!this.listo) return;
    const zoom = Math.max(ZOOM_MIN, this.mapa.getZoom());
    const lista = [...this.grupos.values()].flatMap((g) =>
      g.puntos.map((f) => {
        const props = (f.properties ?? {}) as Record<string, unknown>;
        return {
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          color: typeof g.estilo.color === "function" ? g.estilo.color(props) : g.estilo.color,
          escala: g.estilo.escala ?? 1,
          props,
        };
      }),
    );
    (this.mapa.getSource("pines-3d") as GeoJSONSource | undefined)?.setData(geometriaPines(lista, zoom));
  }
}

let instancia: Pines | null = null;
export function iniciarPines(mapa: Mapa): Pines {
  instancia ??= new Pines(mapa);
  return instancia;
}
/** Acceso desde otros módulos; no hace nada si el mapa aún no creó los pines. */
export function pines(): Pines | null {
  return instancia;
}
