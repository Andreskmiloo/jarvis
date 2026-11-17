// Pines: cada punto de interés es un alfiler parado sobre el mapa con la figura de lo que es
// (📷 cámara, 🛍️ centro comercial, 🏐 cancha de vóley…). Es una capa de símbolos: la GPU
// los dibuja de una vez y no hay que recalcular nada al hacer zoom (antes eran miles de
// polígonos extruidos que se rehacían en cada zoom).
import type { GeoJSONSource, Map as Mapa } from "maplibre-gl";
import { centro } from "../zona/resumen";

type Props = Record<string, unknown>;

export interface EstiloPin {
  /** Color fijo o función según las propiedades del punto. */
  color: string | ((p: Props) => string);
  /** Emoji fijo, función, o se deduce del grupo con `elegirIcono`. */
  icono?: string | ((p: Props) => string);
  /** Multiplicador de tamaño (1 = normal). */
  escala?: number;
}

interface Grupo {
  puntos: GeoJSON.Feature<GeoJSON.Point>[];
  estilo: EstiloPin;
}

export const ZOOM_MIN = 9;
const MAX_PINES = 4000;

/** Figura por grupo o categoría. La clave puede ser el id de una capa, un gusto o una clase de cámara. */
export const ICONOS: Record<string, string> = {
  // en vivo
  webcam: "🎥", transito: "📷", foto: "📸", detector: "📡", osm: "👁", camaras: "📷", "camaras-propias": "🎥", fallas: "🚦", sismos: "〰",
  // capas oficiales
  "centros-comerciales": "🛍", "tm-estaciones": "🚌", sitp: "🚏", metro: "🚇", cicloparqueaderos: "🚲", parques: "🌳",
  "canchas-sinteticas": "⚽", museos: "🏛", teatros: "🎭", cines: "🎬", banos: "🚻",
  // gustos
  voley: "🏐", futbol: "⚽", baloncesto: "🏀", canchas: "🥅", gimnasio: "🏋", ciclismo: "🚴", supermercados: "🛒",
  helado: "🍦", cafe: "☕", panaderia: "🥐", cine: "🎬", teatro: "🎭", bibliotecas: "📚", miradores: "🔭",
  // tuyos
  casa: "🏠", "mis-lugares": "⭐", visitado: "✅",
};

export function elegirIcono(...claves: (string | undefined)[]): string {
  for (const c of claves) if (c && ICONOS[c]) return ICONOS[c];
  return "📍";
}

/** Metros por píxel a una latitud y zoom (teselas de 512 px de MapLibre). */
export function metrosPorPixel(lat: number, zoom: number): number {
  return (78271.517 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Polígono regular alrededor de un punto (lo usan los aviones 3D). */
export function poligono(lng: number, lat: number, radioM: number, lados = 8): number[][] {
  const dy = radioM / 111_320;
  const dx = dy / Math.cos((lat * Math.PI) / 180);
  const pts: number[][] = [];
  for (let i = 0; i <= lados; i++) {
    const t = (i / lados) * 2 * Math.PI + Math.PI / lados;
    pts.push([lng + dx * Math.cos(t), lat + dy * Math.sin(t)]);
  }
  return pts;
}

/** Puntos con su figura y color listos para la capa de símbolos. */
export function geojsonPines(grupos: Iterable<[string, Grupo]>): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const [nombre, g] of grupos) {
    for (const f of g.puntos) {
      if (features.length >= MAX_PINES) break;
      const p = (f.properties ?? {}) as Props;
      const color = typeof g.estilo.color === "function" ? g.estilo.color(p) : g.estilo.color;
      const icono = typeof g.estilo.icono === "function" ? g.estilo.icono(p) : g.estilo.icono ?? elegirIcono(nombre);
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: { ...p, __img: claveImagen(icono, color), __escala: g.estilo.escala ?? 1, __orden: -f.geometry.coordinates[1] },
      });
    }
  }
  return { type: "FeatureCollection", features };
}

const PREFIJO = "pin|";
export const claveImagen = (icono: string, color: string) => `${PREFIJO}${icono}|${color}`;

/** Dibuja un alfiler (gota) del color dado con el emoji adentro. 2x para pantallas densas. */
function dibujarPin(icono: string, color: string): ImageData | null {
  const W = 64, H = 84, r = 26, cx = W / 2, cy = 30;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const x = c.getContext("2d");
  if (!x) return null;
  // sombra suave
  x.shadowColor = "rgba(0,0,0,.45)";
  x.shadowBlur = 6;
  x.shadowOffsetY = 3;
  // gota: arco por arriba y punta abajo
  const ang = 0.62;
  x.beginPath();
  x.arc(cx, cy, r, Math.PI / 2 + ang, Math.PI / 2 - ang);
  x.lineTo(cx, H - 4);
  x.closePath();
  const grad = x.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, color);
  grad.addColorStop(1, sombrear(color, 0.55));
  x.fillStyle = grad;
  x.fill();
  x.shadowColor = "transparent";
  x.lineWidth = 3;
  x.strokeStyle = "rgba(255,255,255,.92)";
  x.stroke();
  // círculo claro para que el emoji se lea sobre cualquier color
  x.beginPath();
  x.arc(cx, cy, r - 6, 0, Math.PI * 2);
  x.fillStyle = "rgba(255,255,255,.94)";
  x.fill();
  x.font = `30px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillStyle = "#111";
  x.fillText(icono, cx, cy + 2);
  return x.getImageData(0, 0, W, H);
}

function sombrear(hex: string, k: number): string {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgb(${m.slice(1).map((h) => Math.round(parseInt(h, 16) * k)).join(",")})`;
}

export class Pines {
  private grupos = new Map<string, Grupo>();
  private listo = false;
  private pendiente = 0;
  activo = true;

  constructor(private mapa: Mapa) {
    // Las figuras se dibujan solo cuando hacen falta, una vez por combinación emoji+color.
    mapa.on("styleimagemissing", (e: { id: string }) => {
      if (!e.id.startsWith(PREFIJO) || mapa.hasImage(e.id)) return;
      const [, icono, color] = e.id.split("|");
      const img = dibujarPin(icono, color);
      if (img) mapa.addImage(e.id, img, { pixelRatio: 2 });
    });
    const crear = () => {
      // Agrupados: de lejos, una burbuja con el número; al acercarse se abren en pines con figura.
      mapa.addSource("pines-3d", { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterRadius: 42, clusterMaxZoom: 14 });
      const antes = mapa.getLayer("nombres-vias") ? "nombres-vias" : undefined;
      mapa.addLayer(
        {
          id: "pines-sombra",
          type: "circle",
          source: "pines-3d",
          filter: ["!", ["has", "point_count"]],
          minzoom: ZOOM_MIN - 3, // teselas lejanas (vista inclinada) son de zoom menor; se ocultan por opacidad
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 1.5, 16, 4],
            "circle-color": "#000",
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], ZOOM_MIN, 0, ZOOM_MIN + 0.4, 0.35],
            "circle-blur": 0.6,
            "circle-pitch-alignment": "map",
          },
        },
        antes,
      );
      mapa.addLayer({
        id: "pines-3d",
        type: "symbol",
        source: "pines-3d",
        filter: ["!", ["has", "point_count"]],
        minzoom: ZOOM_MIN - 3, // teselas lejanas (vista inclinada) son de zoom menor; se ocultan por opacidad
        layout: {
          "icon-image": ["get", "__img"],
          "icon-anchor": "bottom",
          "icon-size": ["interpolate", ["linear"], ["zoom"], 9, ["*", 0.34, ["get", "__escala"]], 13, ["*", 0.58, ["get", "__escala"]], 17, ["*", 0.85, ["get", "__escala"]]],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-pitch-alignment": "viewport",
          "icon-rotation-alignment": "viewport",
          "symbol-sort-key": ["get", "__orden"],
          "symbol-z-order": "source",
        },
        paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], ZOOM_MIN, 0, ZOOM_MIN + 0.4, 1] },
      });
      mapa.addLayer({
        id: "pines-grupo",
        type: "circle",
        source: "pines-3d",
        minzoom: ZOOM_MIN - 3,
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "rgba(20, 22, 26, 0.82)",
          "circle-radius": ["interpolate", ["linear"], ["get", "point_count"], 2, 13, 50, 19, 500, 27],
          "circle-stroke-color": "rgba(255, 255, 255, 0.85)",
          "circle-stroke-width": 1.5,
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], ZOOM_MIN, 0, ZOOM_MIN + 0.4, 1],
          "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], ZOOM_MIN, 0, ZOOM_MIN + 0.4, 1],
          "circle-pitch-alignment": "viewport",
        },
      });
      mapa.addLayer({
        id: "pines-grupo-n",
        type: "symbol",
        source: "pines-3d",
        minzoom: ZOOM_MIN - 3,
        filter: ["has", "point_count"],
        layout: {
          "text-field": ["get", "point_count_abbreviated"],
          "text-font": ["Noto Sans Bold"],
          "text-size": 12,
          "text-allow-overlap": true,
          "text-ignore-placement": true,
          "text-pitch-alignment": "viewport",
        },
        paint: { "text-color": "#fff", "text-opacity": ["interpolate", ["linear"], ["zoom"], ZOOM_MIN, 0, ZOOM_MIN + 0.4, 1] },
      });
      // Tocar una burbuja acerca hasta que se abre.
      mapa.on("click", "pines-grupo", async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const z = await (mapa.getSource("pines-3d") as GeoJSONSource).getClusterExpansionZoom(f.properties!.cluster_id as number);
        mapa.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: z + 0.3, duration: 700 });
      });
      mapa.on("mouseenter", "pines-grupo", () => (mapa.getCanvas().style.cursor = "pointer"));
      mapa.on("mouseleave", "pines-grupo", () => (mapa.getCanvas().style.cursor = ""));
      this.listo = true;
      this.alternar(this.activo);
      this.dibujar();
    };
    if (mapa.loaded()) crear();
    else mapa.once("load", crear);
  }

  poner(grupo: string, fc: GeoJSON.FeatureCollection, estilo: EstiloPin) {
    // Puntos tal cual; polígonos (parques, canchas) con un pin en su centro.
    const puntos: GeoJSON.Feature<GeoJSON.Point>[] = [];
    for (const f of fc.features) {
      if (!f.geometry) continue;
      if (f.geometry.type === "Point") puntos.push(f as GeoJSON.Feature<GeoJSON.Point>);
      else if (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") {
        const c = centro(f.geometry);
        if (c) puntos.push({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: f.properties });
      }
    }
    if (puntos.length) this.grupos.set(grupo, { puntos, estilo });
    else this.grupos.delete(grupo);
    this.programar();
  }

  quitar(grupo: string) {
    if (this.grupos.delete(grupo)) this.programar();
  }

  alternar(activo: boolean) {
    this.activo = activo;
    if (!this.listo) return;
    for (const l of ["pines-3d", "pines-sombra", "pines-grupo", "pines-grupo-n"]) this.mapa.setLayoutProperty(l, "visibility", activo ? "visible" : "none");
  }

  private programar() {
    cancelAnimationFrame(this.pendiente);
    this.pendiente = requestAnimationFrame(() => this.dibujar());
  }

  private dibujar() {
    if (!this.listo) return;
    (this.mapa.getSource("pines-3d") as GeoJSONSource | undefined)?.setData(geojsonPines(this.grupos));
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
