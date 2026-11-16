// Capa 3D de aviones: cada avión es una flecha extruida que vuela a su altitud real,
// con una línea vertical hasta el suelo, y se mueve suave entre lecturas.
import { puedeAnimar } from "./ritmo";
import type { GeoJSONSource, Map as Mapa } from "maplibre-gl";
import { avanzar, type Avion } from "../fuentes/aviones";
import { metrosPorPixel, poligono } from "./pines";

/** Altura del suelo de la sabana: las altitudes ADS-B son sobre el nivel del mar. */
const SUELO_M = 2550;
/** Escala vertical: a altura real los aviones quedarían fuera de cuadro; se muestran a la mitad (la etiqueta dice la altitud real). */
const ESCALA_ALTURA = 0.45;

export function flecha(lng: number, lat: number, rumbo: number, largoM: number): number[][] {
  const forma = [[0, 1], [0.55, -0.7], [0, -0.35], [-0.55, -0.7], [0, 1]];
  const r = (rumbo * Math.PI) / 180;
  const k = 1 / 111_320;
  const kx = k / Math.cos((lat * Math.PI) / 180);
  return forma.map(([x, y]) => {
    const e = (x * Math.cos(r) + y * Math.sin(r)) * largoM;
    const n = (-x * Math.sin(r) + y * Math.cos(r)) * largoM;
    return [lng + e * kx, lat + n * k];
  });
}

export function geojsonAviones(lista: Avion[], seg: number, zoom: number): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (const a of lista) {
    const p = avanzar(a, seg);
    const m = metrosPorPixel(p.lat, zoom);
    const alto = a.enTierra ? 0 : Math.max(60, (p.altitud - SUELO_M) * ESCALA_ALTURA);
    const props = { nombre: `✈ ${a.vuelo}`, sub: `${Math.round(a.altitud)} m · ${Math.round(a.velocidad * 3.6)} km/h${a.enTierra ? " · en tierra" : ""} · ${a.pais}`, avion: a.icao };
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [flecha(p.lng, p.lat, a.rumbo, 18 * m)] },
      properties: { ...props, base: alto, alto: alto + 6 * m, tierra: a.enTierra, linea: false },
    });
    if (!a.enTierra)
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [poligono(p.lng, p.lat, 0.8 * m, 4)] },
        properties: { ...props, base: 0, alto: alto, linea: true, tierra: false },
      });
  }
  return { type: "FeatureCollection", features };
}

export class CapaAviones {
  lista: Avion[] = [];
  private hora = 0;
  private raf = 0;
  private ultimo = 0;

  constructor(private mapa: Mapa) {
    const crear = () => {
      mapa.addSource("aviones", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      mapa.addLayer({
        id: "aviones",
        type: "fill-extrusion",
        source: "aviones",
        paint: {
          "fill-extrusion-color": ["case", ["==", ["get", "linea"], true], "#bfc3c7", ["==", ["get", "tierra"], true], "#9aa0a6", "#ffffff"],
          "fill-extrusion-base": ["get", "base"],
          "fill-extrusion-height": ["get", "alto"],
          "fill-extrusion-opacity": 0.95,
        },
      });
    };
    // Se construye dentro del evento "load" del mapa (ver vivo.ts), así que el estilo ya existe.
    crear();
  }

  poner(lista: Avion[], hora: number) {
    this.lista = lista;
    this.hora = hora;
    this.animar();
  }

  private animar() {
    cancelAnimationFrame(this.raf);
    const paso = (t: number) => {
      this.raf = requestAnimationFrame(paso);
      if (t - this.ultimo < 500 || !puedeAnimar() || !this.algunoEnVista()) return; // 2 cuadros/s bastan
      this.ultimo = t;
      const seg = Date.now() / 1000 - this.hora;
      (this.mapa.getSource("aviones") as GeoJSONSource | undefined)?.setData(geojsonAviones(this.lista, seg, this.mapa.getZoom()));
    };
    this.raf = requestAnimationFrame(paso);
  }

  private vista = { t: 0, v: false };
  private algunoEnVista(): boolean {
    const ahora = performance.now();
    if (ahora - this.vista.t > 2000) {
      const b = this.mapa.getBounds();
      this.vista = { t: ahora, v: this.lista.some((a) => b.contains([a.lng, a.lat])) };
    }
    return this.vista.v;
  }

  visible(v: boolean) {
    if (this.mapa.getLayer("aviones")) this.mapa.setLayoutProperty("aviones", "visibility", v ? "visible" : "none");
  }
}
