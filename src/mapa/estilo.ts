// Estilo vectorial "Matrix" con relieve 3D. Teselas de OpenFreeMap (sin clave,
// esquema OpenMapTiles) y elevación Terrarium (AWS Open Data).
import { MOVIL } from "./ritmo";
import type { FilterSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

export type Tema = "mono" | "matrix";

interface Paleta {
  fondo: string;
  parque: string;
  agua: string;
  rio: string;
  viaMenor: string;
  viaMedia: string;
  viaMayor: string;
  riel: string;
  edificios: [string, string, string];
  sombraLuz: string;
  sombraAcento: string;
  texto: string;
  textoVia: string;
  horizonte: string;
  cielo: string;
  niebla: string;
}

const PALETAS: Record<Tema, Paleta> = {
  // Blanco y negro: suelo gris, vías blancas, agua casi negra.
  mono: {
    fondo: "#1d1e20",
    parque: "#2b2d2f",
    agua: "#0a0b0c",
    rio: "#0a0b0c",
    viaMenor: "#55585c",
    viaMedia: "#9a9da1",
    viaMayor: "#f4f4f2",
    riel: "#c9c9c9",
    edificios: ["#3a3c3f", "#8b8e92", "#f2f2f0"],
    sombraLuz: "#ffffff",
    sombraAcento: "#4a4c4f",
    texto: "#ffffff",
    textoVia: "#d6d6d4",
    horizonte: "#e8e8e6",
    cielo: "#101112",
    niebla: "#2a2b2d",
  },
  matrix: {
    fondo: "#020805",
    parque: "#06301a",
    agua: "#02222b",
    rio: "#06586b",
    viaMenor: "#0a4a26",
    viaMedia: "#0bbf55",
    viaMayor: "#00ff66",
    riel: "#00e5ff",
    edificios: ["#06331b", "#0c8f47", "#33ff88"],
    sombraLuz: "#00ff66",
    sombraAcento: "#063d1e",
    texto: "#00ff66",
    textoVia: "#7dffb0",
    horizonte: "#00ff66",
    cielo: "#00140a",
    niebla: "#001a0d",
  },
};

/** Las capas de datos (coropletas, calor) se insertan antes de esta capa: quedan sobre el suelo y bajo las vías. */
export const ANCLA_DATOS = "vias-menores";
export const CAPA_EDIFICIOS = "edificios-3d";
export const EXAGERACION = 1.7;
/** En celular los edificios 3D aparecen un poco más cerca: ahorra mucha GPU. */
const Z_EDIFICIOS = MOVIL ? 14.5 : 13.5;

const FUENTE = "ofm";
const letra = ["Noto Sans Regular"];

const via = (id: string, filtro: FilterSpecification, color: string, ancho: [number, number, number, number], opacidad = 1, minzoom = 0): LayerSpecification => ({
    id,
    type: "line",
    source: FUENTE,
    "source-layer": "transportation",
    minzoom,
    filter: filtro,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": color,
      "line-opacity": opacidad,
      "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], ancho[0], ancho[1], ancho[2], ancho[3]],
    },
  });

export function estiloMapa(tema: Tema): StyleSpecification {
  const V = PALETAS[tema];
  return {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: {
      [FUENTE]: { type: "vector", url: "https://tiles.openfreemap.org/planet", attribution: "© OpenStreetMap · OpenFreeMap" },
      relieve: {
        type: "raster-dem",
        tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 13,
        attribution: "Relieve: Mapzen/AWS Terrain Tiles · Datos: Catastro Bogotá/IDECA, Sec. Movilidad, Open-Meteo",
      },
      // Imagen satelital para ver la Tierra desde lejos (como Google Earth). Se apaga al acercarse.
      tierra: {
        type: "raster",
        tiles: ["https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"],
        tileSize: 256,
        maxzoom: 13,
        attribution: "Sentinel-2 cloudless 2024 © EOX IT Services (datos Copernicus)",
      },
    },
    // La Tierra como esfera; MapLibre pasa sola a plano al acercarse mucho.
    projection: { type: "globe" },
    sky: {
      "sky-color": V.cielo,
      "horizon-color": V.horizonte,
      "fog-color": V.niebla,
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.8,
      "fog-ground-blend": 0.85,
      // Atmósfera azul alrededor del globo, desaparece al llegar a la ciudad.
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 0.9, 8, 0],
    },
    layers: [
      { id: "fondo", type: "background", paint: { "background-color": V.fondo } },
      { id: "parques", type: "fill", source: FUENTE, "source-layer": "landuse", filter: ["in", ["get", "class"], ["literal", ["park", "cemetery", "pitch", "stadium"]]], paint: { "fill-color": V.parque, "fill-opacity": 0.8 } },
      {
        id: "tierra",
        type: "raster",
        source: "tierra",
        maxzoom: 10.5,
        paint: {
          "raster-opacity": ["interpolate", ["linear"], ["zoom"], 8.5, 1, 10.5, 0],
          "raster-saturation": tema === "mono" ? -1 : -0.4,
          "raster-contrast": 0.1,
          "raster-fade-duration": 200,
        },
      },
      { id: "bosque", type: "fill", source: FUENTE, "source-layer": "landcover", filter: ["in", ["get", "class"], ["literal", ["wood", "grass"]]], paint: { "fill-color": V.parque, "fill-opacity": 0.45 } },
      {
        id: "relieve-sombra",
        type: "hillshade",
        source: "relieve", // una sola fuente de relieve para terreno y sombras: la mitad de descargas
        paint: {
          "hillshade-exaggeration": 0.75,
          "hillshade-shadow-color": "#000000",
          "hillshade-highlight-color": V.sombraLuz,
          "hillshade-accent-color": V.sombraAcento,
          "hillshade-illumination-direction": 315,
        },
      },
      { id: "agua", type: "fill", source: FUENTE, "source-layer": "water", paint: { "fill-color": V.agua, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 10, 1] } },
      { id: "rios", type: "line", source: FUENTE, "source-layer": "waterway", paint: { "line-color": V.rio, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 3] } },
      via(ANCLA_DATOS, ["in", ["get", "class"], ["literal", ["minor", "service", "track", "path"]]], V.viaMenor, [12, 0.4, 18, 6], 0.9, 12),
      via("vias-medias", ["in", ["get", "class"], ["literal", ["secondary", "tertiary"]]], V.viaMedia, [9, 0.4, 18, 12], 0.55),
      via("vias-brillo", ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]], V.viaMayor, [8, 2.5, 18, 34], 0.12),
      via("vias-principales", ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]], V.viaMayor, [8, 0.8, 18, 13], 0.85),
      via("rieles", ["==", ["get", "class"], "rail"], V.riel, [10, 0.5, 18, 3], 0.6),
      {
        id: CAPA_EDIFICIOS,
        type: "fill-extrusion",
        source: FUENTE,
        "source-layer": "building",
        minzoom: Z_EDIFICIOS,
        paint: {
          "fill-extrusion-color": ["interpolate", ["linear"], ["coalesce", ["get", "render_height"], 6], 0, V.edificios[0], 40, V.edificios[1], 150, V.edificios[2]],
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], Z_EDIFICIOS, 0, Z_EDIFICIOS + 1, ["coalesce", ["get", "render_height"], 6]],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.78,
        },
      },
      {
        id: "nombres-vias",
        type: "symbol",
        source: FUENTE,
        "source-layer": "transportation_name",
        minzoom: 14,
        layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-font": letra, "text-size": 11, "text-letter-spacing": 0.05 },
        paint: { "text-color": V.textoVia, "text-halo-color": V.fondo, "text-halo-width": 1.4 },
      },
      {
        id: "nombres-lugares",
        type: "symbol",
        source: FUENTE,
        "source-layer": "place",
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "suburb", "quarter", "neighbourhood", "village"]]],
        layout: {
          "text-field": ["coalesce", ["get", "name:es"], ["get", "name"]],
          "text-font": letra,
          "text-transform": "uppercase",
          "text-letter-spacing": 0.12,
          "text-size": ["interpolate", ["linear"], ["zoom"], 9, 10, 15, 13],
          "text-max-width": 8,
        },
        paint: { "text-color": V.texto, "text-halo-color": V.fondo, "text-halo-width": 1.6, "text-opacity": 0.9 },
      },
    ],
  };
}

/** Vista inicial: Bogotá desde el occidente, mirando hacia los cerros. */
export const VISTA_3D = { center: [-74.085, 4.648] as [number, number], zoom: 11.6, pitch: 62, bearing: 78 };
export const VISTA_2D = { pitch: 0, bearing: 0 };
/** La Tierra completa, con Colombia al frente. */
export const VISTA_TIERRA = { center: [-68, 6] as [number, number], zoom: 1.7, pitch: 0, bearing: 0 };
