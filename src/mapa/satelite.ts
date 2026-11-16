// Vista desde el satélite: Sentinel-2 de 2026 (ESA, vía Microsoft Planetary Computer),
// MODIS del día y GOES-East cada 10 minutos (NASA GIBS), y detalle de Esri (2024, rotulado).
import type { Map as Mapa } from "maplibre-gl";
import type * as maplibregl from "maplibre-gl";
import { CAJA_BOGOTA } from "../fuentes/overpass";

export type Base = "mapa" | "sentinel" | "modis" | "goes" | "esri";

export interface OpcionBase {
  id: Base;
  nombre: string;
  detalle: string;
}

export const BASES: OpcionBase[] = [
  { id: "mapa", nombre: "Mapa", detalle: "Vectorial OpenStreetMap" },
  { id: "esri", nombre: "Satélite HD", detalle: "Nítido hasta la calle · ~30 cm · Esri" },
  { id: "sentinel", nombre: "Satélite 2026", detalle: "Colores de este año · 10 m (de cerca pasa a HD)" },
  { id: "modis", nombre: "Hoy", detalle: "MODIS Terra · 250 m · vista regional" },
  { id: "goes", nombre: "Nubes en vivo", detalle: "GOES-East · 2 km · cada 10 min" },
];

/**
 * Zoom hasta el que cada fuente se ve bien. Más cerca se estiraría (pixelado): Sentinel se
 * mezcla con HD y MODIS/GOES se desvanecen hacia el mapa.
 */
export const TOPE_ZOOM: Partial<Record<Base, number>> = { sentinel: 14, modis: 10, goes: 8 };

/** Opacidad por zoom: 1 hasta un poco antes del tope y 0 en el tope (MODIS, GOES). */
export function opacidadConTope(tope: number | undefined): number | maplibregl.ExpressionSpecification {
  return tope === undefined ? 1 : ["interpolate", ["linear"], ["zoom"], tope - 1.2, 1, tope, 0];
}

const PC = "https://planetarycomputer.microsoft.com/api";
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
export const DESDE = "2026-08-01T00:00:00Z";
const NUBES_MAX = 25;
const CAPAS_SUELO = ["parques", "bosque", "agua"];

function poligonoBogota(): GeoJSON.Polygon {
  const [o, s, e, n] = CAJA_BOGOTA;
  return { type: "Polygon", coordinates: [[[o, s], [e, s], [e, n], [o, n], [o, s]]] };
}

/** Búsqueda de escenas de Sentinel-2: las más recientes primero, con pocas nubes. */
export function busquedaSentinel(): Record<string, unknown> {
  return {
    collections: ["sentinel-2-l2a"],
    "filter-lang": "cql2-json",
    filter: {
      op: "and",
      args: [
        { op: "s_intersects", args: [{ property: "geometry" }, poligonoBogota()] },
        { op: ">=", args: [{ property: "datetime" }, DESDE] },
        { op: "<=", args: [{ property: "eo:cloud_cover" }, NUBES_MAX] },
      ],
    },
    sortby: [{ field: "datetime", direction: "desc" }],
  };
}

export function plantillaSentinel(idMosaico: string): string {
  const p = new URLSearchParams({ collection: "sentinel-2-l2a", assets: "visual", asset_bidx: "visual|1,2,3", nodata: "0", format: "png" });
  return `${PC}/data/v1/mosaic/${idMosaico}/tiles/WebMercatorQuad/{z}/{x}/{y}@2x?${p}`;
}

/** Fecha de ayer en Bogotá (la imagen MODIS del día se completa a media tarde). */
export function fechaModis(ahora = new Date()): string {
  return new Date(ahora.getTime() - 5 * 3600e3 - 864e5).toISOString().slice(0, 10);
}

export function plantillaModis(fecha = fechaModis()): string {
  return `${GIBS}/MODIS_Terra_CorrectedReflectance_TrueColor/default/${fecha}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
}

export function plantillaGoes(cuando = new Date()): string {
  // GIBS publica GOES cada 10 min con ~30 min de retraso; se pide el último cuadro seguro.
  const t = new Date(Math.floor((cuando.getTime() - 40 * 60e3) / 600e3) * 600e3);
  return `${GIBS}/GOES-East_ABI_GeoColor/default/${t.toISOString().slice(0, 16)}:00Z/GoogleMapsCompatible_Level7/{z}/{y}/{x}.png`;
}

export const PLANTILLA_ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

interface InfoSentinel {
  plantilla: string;
  fecha: string;
  escenas: number;
}

let cacheSentinel: Promise<InfoSentinel> | null = null;
export function prepararSentinel(): Promise<InfoSentinel> {
  if (!cacheSentinel) {
    const cuerpo = busquedaSentinel();
    cacheSentinel = Promise.all([
      fetch(`${PC}/data/v1/mosaic/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) }).then((r) => {
        if (!r.ok) throw new Error(`Planetary Computer HTTP ${r.status}`);
        return r.json() as Promise<{ id?: string; searchid?: string }>;
      }),
      fetch(`${PC}/stac/v1/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cuerpo, limit: 50, fields: { include: ["properties.datetime"] } }),
      }).then((r) => (r.ok ? (r.json() as Promise<{ features: { properties: { datetime: string } }[] }>) : { features: [] })),
    ]).then(([reg, stac]) => {
      const id = reg.id ?? reg.searchid;
      if (!id) throw new Error("Planetary Computer no devolvió mosaico");
      return { plantilla: plantillaSentinel(id), fecha: stac.features[0]?.properties.datetime.slice(0, 10) ?? "", escenas: stac.features.length };
    });
    cacheSentinel.catch(() => (cacheSentinel = null));
  }
  return cacheSentinel;
}

export class VistaSatelite {
  actual: Base = "mapa";
  private goesTimer = 0;
  alCambiar: (b: Base, nota: string) => void = () => {};

  constructor(private mapa: Mapa) {}

  async poner(b: Base) {
    const m = this.mapa;
    clearInterval(this.goesTimer);
    for (const id of ["satelite-hd", "satelite"]) {
      if (m.getLayer(id)) m.removeLayer(id);
      if (m.getSource(id)) m.removeSource(id);
    }
    this.actual = b;
    this.suelo(b === "mapa");
    if (b === "mapa") return this.alCambiar(b, "");

    let plantilla = "";
    let nota = "";
    let maxzoom = 18;
    try {
      if (b === "sentinel") {
        const s = await prepararSentinel();
        plantilla = s.plantilla;
        maxzoom = TOPE_ZOOM.sentinel!; // 10 m reales: más allá solo se estiraría
        nota = `${s.fecha ? `Sentinel-2 · escena más reciente ${s.fecha} (${s.escenas} escenas desde ago 2026 con ≤${NUBES_MAX}% nubes)` : "Sentinel-2 · 2026"} · al acercarte pasa a Satélite HD`;
      } else if (b === "modis") {
        plantilla = plantillaModis();
        maxzoom = 9;
        nota = `MODIS Terra · ${fechaModis()} · NASA GIBS · resolución 250 m: para ver calles usa Satélite HD`;
      } else if (b === "goes") {
        plantilla = plantillaGoes();
        maxzoom = 7;
        nota = "GOES-East GeoColor · último cuadro · cada 10 min · resolución 2 km: para ver calles usa Satélite HD";
        this.goesTimer = window.setInterval(() => this.actual === "goes" && this.poner("goes"), 600_000);
      } else {
        plantilla = PLANTILLA_ESRI;
        maxzoom = 19;
        nota = "Satélite HD · Esri World Imagery (WorldView-3, ene 2024): la imagen nítida más reciente sin clave";
      }
    } catch (e) {
      this.actual = "mapa";
      this.suelo(true);
      return this.alCambiar("mapa", `No pude conectar con el satélite: ${e instanceof Error ? e.message : e}`);
    }
    if (this.actual !== b) return;
    m.addSource("satelite", { type: "raster", tiles: [plantilla], tileSize: 256, maxzoom, attribution: atribucion(b) });
    m.addLayer({ id: "satelite", type: "raster", source: "satelite", paint: { "raster-opacity": 0, "raster-opacity-transition": { duration: 700 }, "raster-fade-duration": 250 } }, "relieve-sombra");
    m.setPaintProperty("satelite", "raster-opacity", b === "sentinel" ? 1 : opacidadConTope(TOPE_ZOOM[b]));
    if (b === "sentinel") {
      // Híbrido: colores de 2026 de lejos y detalle HD de cerca, sin pixelado.
      m.addSource("satelite-hd", { type: "raster", tiles: [PLANTILLA_ESRI], tileSize: 256, maxzoom: 19, attribution: atribucion("esri") });
      m.addLayer({ id: "satelite-hd", type: "raster", source: "satelite-hd", minzoom: 12.5, paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 14.5, 1], "raster-fade-duration": 250 } }, "relieve-sombra");
    }
    this.alCambiar(b, nota);
  }

  /** Sobre el satélite se apagan los rellenos del mapa y las vías quedan como trazo fino. */
  private suelo(visible: boolean) {
    const m = this.mapa;
    for (const id of CAPAS_SUELO) if (m.getLayer(id)) m.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    if (m.getLayer("relieve-sombra")) m.setPaintProperty("relieve-sombra", "hillshade-exaggeration", visible ? 0.75 : 0.25);
    for (const [id, op] of [["vias-menores", 0.9], ["vias-medias", 0.55], ["vias-principales", 0.85], ["vias-brillo", 0.12]] as const)
      if (m.getLayer(id)) m.setPaintProperty(id, "line-opacity", visible ? op : op * 0.45);
  }
}

function atribucion(b: Base): string {
  return {
    mapa: "",
    sentinel: "Sentinel-2 © ESA/Copernicus · Microsoft Planetary Computer",
    modis: "MODIS · NASA GIBS",
    goes: "GOES-East · NOAA/NASA GIBS",
    esri: "Imagery © Esri, Maxar/Vantor",
  }[b];
}
