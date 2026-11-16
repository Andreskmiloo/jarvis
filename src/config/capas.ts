// Catálogo de capas públicas de Bogotá (servidor GIS de Catastro / IDECA).
// Cada capa es un endpoint ArcGIS REST que responde con CORS desde el navegador.

export const ARCGIS_BASE =
  "https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services";

export type Valor = string | number | null | undefined;
export type Atributos = Record<string, Valor>;

/** Capa que describe "qué zona es esta" (se consulta en el punto tocado). */
export interface CapaZona {
  id: string;
  nombre: string;
  ruta: string; // carpeta/servicio/MapServer/n
  /** Radios (m) a probar en orden: manzanas no cubren las calles. */
  radios?: number[];
  formatear: (a: Atributos) => { etiqueta: string; valor: string }[];
}

/** Capa de puntos/polígonos de interés que se pinta en el mapa y se busca cerca. */
export interface CapaPOI {
  id: string;
  nombre: string;
  grupo: "Movilidad" | "Deporte y parques" | "Cultura" | "Servicios";
  ruta: string;
  color: string;
  /** Zoom mínimo para pedirla (capas densas). */
  zoomMin: number;
  titulo: (a: Atributos) => string;
  detalle?: (a: Atributos) => string[];
}

const txt = (v: Valor) => (v === null || v === undefined || v === "" ? "—" : String(v));
const titulo = (v: Valor) =>
  txt(v)
    .toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (m) => m.toUpperCase());
const anio = (v: Valor) => (typeof v === "number" ? new Date(v).getUTCFullYear() : "");
const pesos = (v: Valor) =>
  typeof v === "number"
    ? v.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })
    : "—";

const na = (v: Valor) => (v === "N.A" ? "—" : txt(v));
const equipamiento = (a: Atributos) => [
  `Dirección: ${na(a.LECDIRECCI)}`,
  `Teléfono: ${na(a.LECTELEFON)}`,
  `Web: ${na(a.LECPAGWEB)}`,
  `Clase: ${na(a.LECCLASIF)}`,
];

export const CAPAS_ZONA: CapaZona[] = [
  {
    id: "localidad",
    nombre: "Localidad",
    ruta: "ordenamientoterritorial/localidad/MapServer/0",
    formatear: (a) => [{ etiqueta: "Localidad", valor: `${titulo(a.LOCNOMBRE)} (${txt(a.LOCCODIGO)})` }],
  },
  {
    id: "upz",
    nombre: "UPZ",
    ruta: "ordenamientoterritorial/unidadplaneamientozonal/MapServer/0",
    formatear: (a) => [{ etiqueta: "UPZ", valor: `${titulo(a.NOMBRE)} (${txt(a.CODIGO_UPZ)})` }],
  },
  {
    id: "barrio",
    nombre: "Barrio catastral",
    ruta: "catastro/sectorcatastral/MapServer/0",
    formatear: (a) => [{ etiqueta: "Barrio", valor: titulo(a.SCANOMBRE) }],
  },
  {
    id: "estrato",
    nombre: "Estrato",
    ruta: "ordenamientoterritorial/estratificacion/MapServer/1",
    radios: [0, 25, 60, 150],
    formatear: (a) => [{ etiqueta: "Estrato", valor: txt(a.ESTRATO) }],
  },
  {
    id: "valor",
    nombre: "Valor del suelo",
    ruta: "catastro/valorreferencia/MapServer/0",
    radios: [0, 25, 60, 150],
    formatear: (a) => [
      { etiqueta: "Valor de referencia m² terreno", valor: `${pesos(a.V_REF)} (${anio(a.ANO)})` },
    ],
  },
  {
    id: "uso",
    nombre: "Uso predominante",
    ruta: "catastro/usopredominante/MapServer/0",
    radios: [0, 25, 60, 150],
    formatear: (a) => [{ etiqueta: "Uso predominante", valor: `${titulo(a.GRUPOUSOECON)} (${anio(a.ANO)})` }],
  },
];

export const CAPAS_POI: CapaPOI[] = [
  {
    id: "tm-estaciones",
    nombre: "Estaciones TransMilenio",
    grupo: "Movilidad",
    ruta: "movilidad/transportepublico/MapServer/1",
    color: "#c0392b",
    zoomMin: 10,
    titulo: (a) => titulo(a.ETRNOMBRE),
  },
  {
    id: "sitp",
    nombre: "Paraderos SITP",
    grupo: "Movilidad",
    ruta: "movilidad/transportepublico/MapServer/5",
    color: "#2e86c1",
    zoomMin: 15,
    titulo: (a) => txt(a.PSINOMBRE),
    detalle: (a) => [`Dirección: ${txt(a.PSIDIRECCI)}`, `Cenefa: ${txt(a.PSICENEFA)}`],
  },
  {
    id: "metro",
    nombre: "Estaciones Metro L1",
    grupo: "Movilidad",
    ruta: "movilidad/metrobogota/MapServer/0",
    color: "#7d3c98",
    zoomMin: 10,
    titulo: (a) => txt(a.NOMBRE),
    detalle: (a) => [`Estado: ${txt(a.ESTADO)}`],
  },
  {
    id: "cicloparqueaderos",
    nombre: "Cicloparqueaderos",
    grupo: "Movilidad",
    ruta: "movilidad/transportepublico/MapServer/0",
    color: "#16a085",
    zoomMin: 13,
    titulo: (a) => txt(a.CEXNOMBRE),
    detalle: (a) => [`Capacidad: ${txt(a.CEXCAPACID)}`, `Horario: ${txt(a.CEXHORARIO)}`],
  },
  {
    id: "parques",
    nombre: "Parques y escenarios IDRD",
    grupo: "Deporte y parques",
    ruta: "recreaciondeporte/parquesyescenarios/MapServer/1",
    color: "#27ae60",
    zoomMin: 13,
    titulo: (a) => titulo(a.NOMBREPAR),
    detalle: (a) => [`Tipo: ${txt(a.TIPOPARQUE)}`, `Administra: ${txt(a.ADMINISTRA)}`, `Estado: ${txt(a.ESTADOCER)}`],
  },
  {
    id: "canchas-sinteticas",
    nombre: "Canchas sintéticas públicas",
    grupo: "Deporte y parques",
    ruta: "recreaciondeporte/canchasintetica/MapServer/0",
    color: "#229954",
    zoomMin: 10,
    titulo: (a) => titulo(a.PARQUE),
    detalle: (a) => [`Dirección: ${txt(a["DIRECCIÓN"])}`, `Tipo de parque: ${txt(a.TIPO_PARQU)}`],
  },
  {
    id: "museos",
    nombre: "Museos",
    grupo: "Cultura",
    ruta: "recreaciondeporte/equipamiento/MapServer/6",
    color: "#d35400",
    zoomMin: 10,
    titulo: (a) => txt(a.LECNOMBRE),
    detalle: equipamiento,
  },
  {
    id: "teatros",
    nombre: "Teatros y auditorios",
    grupo: "Cultura",
    ruta: "recreaciondeporte/equipamiento/MapServer/5",
    color: "#e67e22",
    zoomMin: 10,
    titulo: (a) => txt(a.LECNOMBRE),
    detalle: equipamiento,
  },
  {
    id: "cines",
    nombre: "Salas de cine y cinematecas",
    grupo: "Cultura",
    ruta: "recreaciondeporte/equipamiento/MapServer/2",
    color: "#ca6f1e",
    zoomMin: 10,
    titulo: (a) => txt(a.LECNOMBRE),
    detalle: equipamiento,
  },
  {
    id: "banos",
    nombre: "Baños públicos",
    grupo: "Servicios",
    ruta: "recreaciondeporte/banospublicos/MapServer/0",
    color: "#566573",
    zoomMin: 12,
    titulo: (a) => txt(a.LECDIRECCI ?? "Baño público"),
    detalle: (a) => [`Estado: ${txt(a.LECESTADO)}`, `Horario: ${txt(a.LECHORAPRE)}`, `Accesible: ${txt(a.LECACCESIB)}`],
  },
];

/** Primer atributo con texto, para capas cuyos campos no conocemos de antemano. */
export function tituloGenerico(a: Atributos): string {
  for (const k of Object.keys(a)) {
    if (/nom|name/i.test(k) && a[k]) return String(a[k]);
  }
  return "Sin nombre";
}

/** Capas que el servidor pinta como imagen (coropletas por manzana, límites). */
export interface CapaRaster {
  id: string;
  nombre: string;
  servicio: string; // carpeta/servicio/MapServer
  capas?: string; // p.ej. "show:1"
  opacidad: number;
}

export const CAPAS_RASTER: CapaRaster[] = [
  { id: "r-localidades", nombre: "Límites de localidades", servicio: "ordenamientoterritorial/localidad/MapServer", opacidad: 0.9 },
  { id: "r-upz", nombre: "Límites de UPZ", servicio: "ordenamientoterritorial/unidadplaneamientozonal/MapServer", opacidad: 0.8 },
  { id: "r-estrato", nombre: "Estrato por manzana", servicio: "ordenamientoterritorial/estratificacion/MapServer", capas: "show:1", opacidad: 0.6 },
  { id: "r-valor", nombre: "Valor del suelo m² por manzana", servicio: "catastro/valorreferencia/MapServer", opacidad: 0.6 },
  { id: "r-uso", nombre: "Uso predominante por manzana", servicio: "catastro/usopredominante/MapServer", opacidad: 0.6 },
  { id: "r-densidad", nombre: "Densidad de población por UPZ", servicio: "social/densidadpersonasUPZ/MapServer", opacidad: 0.55 },
  { id: "r-arboles", nombre: "Densidad de árboles", servicio: "ambiente/densidadarboles/MapServer", opacidad: 0.55 },
  { id: "r-comparendos", nombre: "Densidad de comparendos", servicio: "movilidad/densidadcomparendos/MapServer", opacidad: 0.55 },
  { id: "r-ciclovia", nombre: "Ciclovía y recreovía", servicio: "recreaciondeporte/recreacion/MapServer", opacidad: 0.9 },
  { id: "r-troncales", nombre: "Troncales TransMilenio", servicio: "movilidad/transportepublico/MapServer", capas: "show:3", opacidad: 0.9 },
  { id: "r-metro", nombre: "Trazado Metro", servicio: "movilidad/metrobogota/MapServer", capas: "show:1,5", opacidad: 0.9 },
];

/** Plantilla de teselas para MapLibre usando el endpoint export de ArcGIS. */
export function plantillaRaster(c: CapaRaster): string {
  const p = new URLSearchParams({
    bboxSR: "3857",
    imageSR: "3857",
    size: "256,256",
    format: "png32",
    transparent: "true",
    f: "image",
  });
  if (c.capas) p.set("layers", c.capas);
  // {bbox-epsg-3857} no debe codificarse.
  return `${ARCGIS_BASE}/${c.servicio}/export?bbox={bbox-epsg-3857}&${p}`;
}
