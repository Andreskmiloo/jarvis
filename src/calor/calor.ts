// Mapa de calor animado sobre MapLibre: interpola entre cuadros y "respira".
import { puedeAnimar } from "../mapa/ritmo";
import type { Map as Mapa } from "maplibre-gl";
import type { CuadroRadar } from "../fuentes/envivo";
import { Cupulas, type Localidad } from "./cupulas";
import { expresionPeso, expresionRadio } from "./expresiones";
import type { Serie } from "./series";

export { expresionPeso, expresionRadio };

const FUENTE = "calor";
const CAPA = "calor";
/** Cámara lenta por defecto: cada hora tarda 2,4 s en fundirse con la siguiente. */
const MS_POR_CUADRO = 2400;
export const VELOCIDADES = [0.5, 1, 2, 4] as const;

export function geojsonSerie(s: Serie): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: s.puntos.map((p) => {
      const props: Record<string, number> = {};
      p.valores.forEach((v, i) => (props[`v${i}`] = +Math.min(1, v / s.tope).toFixed(3)));
      return { type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: props };
    }),
  };
}

export class Calor {
  serie: Serie | null = null;
  cuadro = 0;
  reproduciendo = false;
  /** Multiplicador de velocidad: 1 = cámara lenta, 4 = rápido. */
  velocidad = 1;
  private raf = 0;
  private ultimo = 0;
  private ultimoPintado = 0;
  private radar: CuadroRadar[] = [];
  private radarActual = -1;
  private reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** ms entre repintados: más espaciados en teléfonos, donde el relieve 3D cuesta más. */
  private intervalo = matchMedia("(max-width: 720px)").matches ? 220 : 120;
  alCuadro: (etiqueta: string, cuadro: number, total: number) => void = () => {};

  private cupulas: Cupulas;

  constructor(private mapa: Mapa, private antesDe?: string) {
    this.cupulas = new Cupulas(mapa, antesDe);
  }

  get total(): number {
    return this.radar.length || this.serie?.etiquetas.length || 0;
  }

  /** Con `locs` se dibuja una cúpula por localidad; sin ellas, una manta de calor continua. */
  mostrar(s: Serie, locs?: Localidad[]) {
    this.ocultar();
    this.serie = s;
    this.cuadro = s.inicio;
    if (locs?.length) {
      this.cupulas.mostrar(s, locs, s.id === "siniestros" ? "suma" : "promedio");
      this.avisar();
      return this.arrancar();
    }
    const m = this.mapa;
    m.addSource(FUENTE, { type: "geojson", data: geojsonSerie(s) });
    m.addLayer(
      {
        id: CAPA,
        type: "heatmap",
        source: FUENTE,
        paint: {
          "heatmap-weight": expresionPeso(this.cuadro, s.etiquetas.length),
          "heatmap-radius": expresionRadio(s.radioM),
          "heatmap-intensity": 1.5,
          "heatmap-opacity": 0,
          "heatmap-opacity-transition": { duration: 400 },
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(255,228,92,0)",
            0.12, "rgba(255,228,92,0.45)",
            0.4, "rgba(255,162,0,0.7)",
            0.7, "rgba(255,90,0,0.85)",
            1, "rgba(255,0,60,0.95)",
          ],
        },
      },
      this.antesDe && m.getLayer(this.antesDe) ? this.antesDe : undefined,
    );
    m.setPaintProperty(CAPA, "heatmap-opacity", 0.85);
    this.avisar();
    this.arrancar();
  }

  mostrarRadar(cuadros: CuadroRadar[]) {
    this.ocultar();
    this.radar = cuadros;
    cuadros.forEach((c, i) => {
      const id = `radar-${i}`;
      this.mapa.addSource(id, { type: "raster", tiles: [c.plantilla], tileSize: 256, maxzoom: 7, attribution: "Radar: RainViewer" });
      this.mapa.addLayer(
        { id, type: "raster", source: id, paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 700 }, "raster-fade-duration": 0 } },
        this.antesDe && this.mapa.getLayer(this.antesDe) ? this.antesDe : undefined,
      );
    });
    this.cuadro = Math.max(0, cuadros.length - 1);
    this.pintarRadar();
    this.arrancar();
  }

  ocultar() {
    cancelAnimationFrame(this.raf);
    this.reproduciendo = false;
    const m = this.mapa;
    if (m.getLayer(CAPA)) m.removeLayer(CAPA);
    if (m.getSource(FUENTE)) m.removeSource(FUENTE);
    this.radar.forEach((_, i) => {
      if (m.getLayer(`radar-${i}`)) m.removeLayer(`radar-${i}`);
      if (m.getSource(`radar-${i}`)) m.removeSource(`radar-${i}`);
    });
    this.radar = [];
    this.radarActual = -1;
    this.serie = null;
    this.cupulas.ocultar();
  }

  irA(cuadro: number) {
    this.cuadro = cuadro;
    this.pintar(performance.now(), true);
  }

  alternar() {
    if (this.reproduciendo) {
      this.reproduciendo = false;
      cancelAnimationFrame(this.raf);
    } else this.arrancar();
  }

  private arrancar() {
    if (!this.total) return;
    this.reproduciendo = true;
    this.ultimo = performance.now();
    cancelAnimationFrame(this.raf);
    const paso = (t: number) => {
      if (!this.reproduciendo) return;
      const dt = t - this.ultimo;
      this.ultimo = t;
      // Con movimiento reducido se avanza a saltos, sin respiración.
      this.cuadro = (this.cuadro + (dt * this.velocidad) / (this.radar.length ? 1300 : MS_POR_CUADRO)) % this.total;
      if (puedeAnimar()) this.pintar(t, false); // quieto mientras arrastras el mapa
      this.raf = requestAnimationFrame(paso);
    };
    this.raf = requestAnimationFrame(paso);
  }

  private pintar(t: number, forzar: boolean) {
    if (this.radar.length) return this.pintarRadar();
    if (!this.serie) return;
    if (this.cupulas.activo) {
      if (!forzar && t - this.ultimoPintado < this.intervalo) return;
      this.ultimoPintado = t;
      this.cupulas.pintar(this.reducido ? Math.floor(this.cuadro) : this.cuadro, t, !this.reducido);
      return this.avisar();
    }
    if (!this.mapa.getLayer(CAPA)) return;
    if (!forzar && t - this.ultimoPintado < this.intervalo) return; // pocos cuadros bastan y cuidan la batería
    this.ultimoPintado = t;
    const c = this.reducido ? Math.floor(this.cuadro) : this.cuadro;
    this.mapa.setPaintProperty(CAPA, "heatmap-weight", expresionPeso(c, this.serie.etiquetas.length));
    if (!this.reducido) this.mapa.setPaintProperty(CAPA, "heatmap-intensity", 1.5 + 0.3 * Math.sin(t / 420));
    this.avisar();
  }

  private pintarRadar() {
    const i = Math.floor(this.cuadro) % this.radar.length;
    if (i === this.radarActual) return;
    if (this.radarActual >= 0 && this.mapa.getLayer(`radar-${this.radarActual}`)) this.mapa.setPaintProperty(`radar-${this.radarActual}`, "raster-opacity", 0);
    this.mapa.setPaintProperty(`radar-${i}`, "raster-opacity", 0.75);
    this.radarActual = i;
    const d = new Date(this.radar[i].tiempo * 1000);
    this.alCuadro(d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }), i, this.radar.length);
  }

  private avisar() {
    if (!this.serie) return;
    const i = Math.floor(this.cuadro) % this.serie.etiquetas.length;
    this.alCuadro(this.serie.etiquetas[i], i, this.serie.etiquetas.length);
  }
}
