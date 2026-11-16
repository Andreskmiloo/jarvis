import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { type GeoJSONSource, type MapMouseEvent } from "maplibre-gl";
import { CAPAS_POI, CAPAS_RASTER, plantillaRaster, type Atributos, type CapaPOI } from "./config/capas";
import { geojsonCaja } from "./fuentes/arcgis";
import { buscarDireccion } from "./fuentes/nominatim";
import { categoriaAire, describirClima } from "./fuentes/openmeteo";
import { buscar, CAJA_BOGOTA, type Caja, type LugarOSM } from "./fuentes/overpass";
import { aLugaresOSM, cargarGuardados, dentroDeCaja, geojsonGuardados } from "./fuentes/guardados";
import { buscarPhoton } from "./fuentes/photon";
import { cargarPerfil, type Gusto } from "./intereses/perfil";
import { ANCLA_DATOS, CAPA_EDIFICIOS, estiloMapa, EXAGERACION, type Tema, VISTA_2D, VISTA_3D, VISTA_TIERRA } from "./mapa/estilo";
import { conectarRitmo, nitidezAdaptativa } from "./mapa/ritmo";
import { iniciarPlaneta } from "./espacio/ui";
import { iniciarJarvis } from "./jarvis/ui";
import { animar } from "./ui/anim";
import { iniciarVivo } from "./vivo";
import { iniciarCamaras } from "./camaras/ui";
import { borrarCasa, guardarCasa, leerCasa, textoDistancia, type Casa } from "./lugares/casa";
import { BASES, VistaSatelite, type Base } from "./mapa/satelite";
import { elegirIcono, iniciarPines } from "./mapa/pines";
import { iniciarCapas3D } from "./capas3d/ui";
import { CLAVE_WINDY, enlacesEnVivo, webcamsCerca } from "./fuentes/webcams";
import { Lugares, type MiLugar } from "./lugares/store";
import { aviso, descargar, esc, metros } from "./ui/html";
import { distancia, resumir, type Resumen } from "./zona/resumen";
import { cerrarSesion, iniciarAcceso } from "./acceso";

// ---------- Estado ----------
const iniciales = import.meta.glob<unknown>("/data/mis-lugares*.json", { eager: true, import: "default" });
const lugares = new Lugares(undefined, (iniciales["/data/mis-lugares.json"] as MiLugar[]) ?? []);
const perfil = cargarPerfil();
const activasPOI = new Set<string>();
const activasRaster = new Set<string>();
let gustoActivo: Gusto | null = null;
let resultados: LugarOSM[] = [];
/** De dónde salieron los resultados del gusto activo (se muestra en la lista). */
let fuenteResultados = "";
let soloGratis = false;
let filtroLugares: "todos" | "visitados" | "pendientes" = "todos";
let modoAgregar = false;
let modoCasa = false;
let casa: Casa | null = leerCasa();
let ultimoPunto: { lat: number; lng: number } | null = null;
let controlZona: AbortController | null = null;

// ---------- Mapa ----------
maplibregl.setWorkerUrl(workerUrl);
// Tema visual: blanco y negro (por defecto) o Matrix. Se recuerda en este navegador.
function temaGuardado(): Tema {
  try {
    return localStorage.getItem("ojo-de-dios:tema") === "matrix" ? "matrix" : "mono";
  } catch {
    return "mono";
  }
}
const tema = temaGuardado();
document.documentElement.dataset.tema = tema;
document.getElementById("boton-tema")!.addEventListener("click", () => {
  try {
    localStorage.setItem("ojo-de-dios:tema", tema === "mono" ? "matrix" : "mono");
  } catch {
    /* sin almacenamiento: el tema no se puede recordar */
  }
  location.reload();
});

const movil = matchMedia("(max-width: 720px)").matches;
const mapa = new maplibregl.Map({
  container: "mapa",
  style: estiloMapa(tema),
  // Arranca viendo la Tierra entera; al entrar vuela hasta Bogotá.
  ...VISTA_TIERRA,
  zoom: movil ? VISTA_TIERRA.zoom - 0.5 : VISTA_TIERRA.zoom,
  maxPitch: 78,
  // En pantallas densas se limita la resolución: se ve igual y va más fluido.
  // Empieza nítido; mientras se mueve baja la resolución (ver nitidezAdaptativa).
  pixelRatio: Math.min(devicePixelRatio, 2),
  attributionControl: { compact: true },
});
conectarRitmo(mapa);
nitidezAdaptativa(mapa);
const VISTA_BOGOTA = { ...VISTA_3D, zoom: movil ? VISTA_3D.zoom - 0.9 : VISTA_3D.zoom };

// La Tierra gira despacio detrás de la pantalla de acceso.
let girando = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let ultimoGiro = 0;
function girar(t: number) {
  if (!girando) return;
  if (t - ultimoGiro > 33 && !document.hidden) {
    const c = mapa.getCenter();
    mapa.jumpTo({ center: [c.lng - (ultimoGiro ? (t - ultimoGiro) * 0.004 : 0), c.lat] });
  }
  if (t - ultimoGiro > 33) ultimoGiro = t;
  requestAnimationFrame(girar);
}
requestAnimationFrame(girar);

/** Vuelo tipo Google Earth: del espacio a Bogotá en 3D. */
function volarABogota(duracion = 5200) {
  girando = false;
  enTierra = false;
  botonTierra.setAttribute("aria-pressed", "false");
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return mapa.jumpTo({ ...VISTA_BOGOTA, padding: PADDING });
  mapa.flyTo({ ...VISTA_BOGOTA, padding: PADDING, duration: duracion, curve: 1.6, essential: true, easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2) });
}
let enTierra = true;
const botonTierra = document.getElementById("boton-tierra")!;
botonTierra.addEventListener("click", () => {
  if (enTierra) return volarABogota(4200);
  enTierra = true;
  botonTierra.setAttribute("aria-pressed", "true");
  if (capas3d.activo()) capas3d.salir();
  mapa.flyTo({ ...VISTA_TIERRA, padding: SIN_PADDING, zoom: movil ? VISTA_TIERRA.zoom - 0.5 : VISTA_TIERRA.zoom, duration: 4200, curve: 1.6, essential: true });
});

// Pantalla de carga y acceso: el mapa sigue cargando detrás; al entrar, vuelo a Bogotá.
void iniciarAcceso(new Promise((ok) => mapa.once("load", ok))).then(() => volarABogota());
document.getElementById("boton-salir")?.addEventListener("click", () => {
  if (confirm("¿Cerrar sesión en este dispositivo?")) cerrarSesion();
});
// El panel tapa parte del mapa: el "centro" útil se corre para que nada quede debajo.
const PADDING = movil ? { top: 0, left: 0, right: 0, bottom: innerHeight * 0.42 } : { top: 0, left: 410, right: 0, bottom: 0 };
const SIN_PADDING = { top: 0, left: 0, right: 0, bottom: 0 };
// La Tierra queda centrada detrás del acceso; el corrimiento por el panel llega con el vuelo.

let en3d = true;
/** Desde el espacio el relieve no se nota y cuesta muchísimo: solo se enciende a escala de ciudad. */
const ZOOM_RELIEVE = 7.5;
let terrenoPuesto = false;
function ajustarTerreno() {
  const quiere = en3d && mapa.getZoom() >= ZOOM_RELIEVE;
  if (quiere === terrenoPuesto) return;
  terrenoPuesto = quiere;
  try {
    mapa.setTerrain(quiere ? { source: "relieve", exaggeration: EXAGERACION } : null);
  } catch {
    /* equipo sin soporte de relieve: el mapa sigue en plano */
  }
}
mapa.on("zoom", ajustarTerreno);
function relieve(activo: boolean) {
  ajustarTerreno();
  if (mapa.getLayer(CAPA_EDIFICIOS)) mapa.setLayoutProperty(CAPA_EDIFICIOS, "visibility", activo ? "visible" : "none");
}
const boton3d = document.getElementById("boton-3d")!;
boton3d.addEventListener("click", () => {
  en3d = !en3d;
  boton3d.textContent = en3d ? "2D" : "3D";
  boton3d.setAttribute("aria-pressed", String(en3d));
  relieve(en3d);
  mapa.easeTo({ ...(en3d ? { pitch: VISTA_3D.pitch, bearing: VISTA_3D.bearing } : VISTA_2D), duration: 900 });
});
document.getElementById("boton-orbita")!.addEventListener("click", () => {
  mapa.easeTo({ bearing: mapa.getBearing() + 90, duration: 2400, easing: (t) => t * (2 - t) });
});

mapa.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
mapa.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), "top-right");

const pinesMapa = iniciarPines(mapa);
if (import.meta.env.DEV) (window as unknown as { __mapa: unknown }).__mapa = mapa; // depuración local
const elMarcador = Object.assign(document.createElement("div"), { className: "mira" });
const marcador = new maplibregl.Marker({ element: elMarcador });
const capasInteractivas: string[] = [];

mapa.on("load", () => {
  relieve(true);
  // Mis lugares e intereses siempre presentes.
  mapa.addSource("mis-lugares", { type: "geojson", data: geoLugares() });
  mapa.addLayer({
    id: "mis-lugares",
    type: "circle",
    source: "mis-lugares",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 0, 7, 7, 9, 7, 10.5, 2.5],
      "circle-color": ["case", ["get", "visitado"], "#1e8449", "#f39c12"],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  });
  mapa.addSource("intereses", { type: "geojson", data: geoIntereses() });
  mapa.addLayer(
    {
      id: "intereses",
      type: "circle",
      source: "intereses",
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 0, 7, 6, 9, 6, 10.5, 2.5],
        "circle-color": ["match", ["get", "estado"], "visitado", "#1e8449", "pendiente", "#f39c12", "#8e44ad"],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#fff",
      },
    },
    "mis-lugares",
  );
  capasInteractivas.push("mis-lugares", "intereses", "pines-3d");
  pinesLugares();
  for (const id of ["mis-lugares", "intereses"]) {
    mapa.on("mouseenter", id, () => (mapa.getCanvas().style.cursor = "pointer"));
    mapa.on("mouseleave", id, () => (mapa.getCanvas().style.cursor = ""));
  }
  // Centros comerciales encendidos desde el inicio (salen del archivo guardado, sin servidor).
  alternarPOI("centros-comerciales", true);
  pintarCapas();
  pintarIntereses();
  pintarLugares();
});

mapa.on("click", (e: MapMouseEvent) => {
  const f = mapa.queryRenderedFeatures(e.point, { layers: capasInteractivas.filter((l) => mapa.getLayer(l)) })[0];
  if (f?.properties?.camara && !modoAgregar && !modoCasa) return camarasUI.abrir(String(f.properties.camara));
  if (f?.properties?.video && !modoAgregar && !modoCasa) return camarasUI.abrirExterna(String(f.properties.titulo ?? "Webcam en vivo"), String(f.properties.video));
  if (f && !modoAgregar && !modoCasa) return popupDe(f, e.lngLat);
  const { lat, lng } = e.lngLat;
  if (camarasUI.tocar(lat, lng)) return;
  if (modoCasa) {
    modoCasa = false;
    mapa.getCanvas().style.cursor = "";
    fijarCasa(lat, lng);
    return;
  }
  if (modoAgregar) {
    modoAgregar = false;
    mapa.getCanvas().style.cursor = "";
    guardarPunto(lat, lng);
    return;
  }
  leerZona(lat, lng);
});

let refresco: number | undefined;
mapa.on("moveend", () => {
  clearTimeout(refresco);
  refresco = window.setTimeout(refrescarPOI, 250);
});

// ---------- Panel ----------
const panel = document.getElementById("panel")!;
const tabs = {
  zona: document.getElementById("tab-zona")!,
  vivo: document.getElementById("tab-vivo")!,
  intereses: document.getElementById("tab-intereses")!,
  lugares: document.getElementById("tab-lugares")!,
  capas: document.getElementById("tab-capas")!,
};
type Tab = keyof typeof tabs;

function moverIndicador() {
  const b = document.querySelector<HTMLButtonElement>('.pestanas button[aria-selected="true"]');
  const ind = document.querySelector<HTMLElement>(".pestanas .indicador");
  if (!b || !ind) return;
  ind.style.width = `${b.offsetWidth}px`;
  ind.style.transform = `translateX(${b.offsetLeft}px)`;
}
addEventListener("resize", moverIndicador);
requestAnimationFrame(moverIndicador);

function abrirTab(t: Tab) {
  const cambia = tabs[t].hidden;
  for (const [k, el] of Object.entries(tabs)) el.hidden = k !== t;
  if (cambia) animar(tabs[t]);
  document.querySelectorAll<HTMLButtonElement>(".pestanas button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
  moverIndicador();
  if (panel.classList.contains("contraido")) panel.classList.remove("contraido");
}
document.querySelectorAll<HTMLButtonElement>(".pestanas button").forEach((b) => b.addEventListener("click", () => abrirTab(b.dataset.tab as Tab)));
document.getElementById("asa")!.addEventListener("click", () => {
  if (panel.classList.contains("expandido")) panel.classList.replace("expandido", "contraido");
  else if (panel.classList.contains("contraido")) panel.classList.remove("contraido");
  else panel.classList.add("expandido");
});

document.getElementById("buscador")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = (document.getElementById("busqueda") as HTMLInputElement).value.trim();
  if (!q) return;
  try {
    const [r] = await buscarDireccion(q);
    if (!r) return aviso("No encontré esa dirección");
    caerEn(r.lat, r.lng, /localidad|barrio|suburb/i.test(r.tipo ?? "") ? 14.2 : 16.2);
  } catch {
    aviso("La búsqueda falló, intenta de nuevo");
  }
});

const registrar = (id: string) => {
  capasInteractivas.push(id);
  mapa.on("mouseenter", id, () => (mapa.getCanvas().style.cursor = "pointer"));
  mapa.on("mouseleave", id, () => (mapa.getCanvas().style.cursor = ""));
};
const camarasUI = iniciarCamaras(mapa, document.getElementById("vivo-camaras")!, registrar);
function abrirWaze(lat: number, lng: number) {
  camarasUI.abrirExterna("Tráfico en vivo · Waze", `https://embed.waze.com/iframe?zoom=15&lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&ct=livemap&pin=1`);
}
const planeta = iniciarPlaneta(mapa, document.getElementById("vivo-planeta")!, registrar, (lat, lng, zoom) => caerEn(lat, lng, zoom));
const vivo = iniciarVivo(mapa, document.getElementById("vivo-datos")!, (id) => {
  capasInteractivas.push(id);
  mapa.on("mouseenter", id, () => (mapa.getCanvas().style.cursor = "pointer"));
  mapa.on("mouseleave", id, () => (mapa.getCanvas().style.cursor = ""));
}, abrirWaze);

// ---------- Menús flotantes ----------
function alternarMenu(menu: HTMLElement, boton: HTMLElement) {
  const abrir = menu.hidden;
  document.querySelectorAll<HTMLElement>(".menu").forEach((m) => (m.hidden = true));
  if (!abrir) return;
  const r = boton.getBoundingClientRect();
  menu.style.top = `${r.top}px`;
  menu.style.right = `${innerWidth - r.left + 8}px`;
  menu.hidden = false;
  animar(menu);
}
document.addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest(".menu, .boton-mapa")) document.querySelectorAll<HTMLElement>(".menu").forEach((m) => (m.hidden = true));
});

// ---------- Mi casa ----------
const elCasa = Object.assign(document.createElement("div"), { className: "casa", title: "Mi casa", textContent: "⌂" });
const marcadorCasa = new maplibregl.Marker({ element: elCasa });
const menuCasa = document.getElementById("menu-casa")!;
const botonCasa = document.getElementById("boton-casa")!;

function pintarCasa() {
  if (casa) marcadorCasa.setLngLat([casa.lng, casa.lat]).addTo(mapa);
  else marcadorCasa.remove();
  botonCasa.classList.toggle("activo", !!casa);
  menuCasa.innerHTML = `<b>Mi casa</b>
    ${casa ? `<button data-casa="ir">Ir a mi casa</button>` : `<p class="nota">Sin marcar. Se guarda solo en este navegador.</p>`}
    <button data-casa="gps">${casa ? "Mover a mi ubicación" : "Usar mi ubicación"}</button>
    <button data-casa="tocar">${casa ? "Mover tocando el mapa" : "Marcar tocando el mapa"}</button>
    ${casa ? `<button data-casa="borrar">Borrar</button>` : ""}`;
  menuCasa.querySelectorAll<HTMLButtonElement>("[data-casa]").forEach((b) =>
    b.addEventListener("click", () => {
      menuCasa.hidden = true;
      const accion = b.dataset.casa;
      if (accion === "ir" && casa) caerEn(casa.lat, casa.lng, 16.5);
      else if (accion === "tocar") {
        modoCasa = true;
        mapa.getCanvas().style.cursor = "crosshair";
        panel.classList.add("contraido");
        aviso("Toca el mapa donde está tu casa", 4000);
      } else if (accion === "gps") {
        if (!navigator.geolocation) return aviso("Este navegador no da ubicación");
        aviso("Buscando tu ubicación…");
        navigator.geolocation.getCurrentPosition(
          (p) => fijarCasa(p.coords.latitude, p.coords.longitude),
          () => aviso("No pude obtener tu ubicación; márcala tocando el mapa", 4000),
          { enableHighAccuracy: true, timeout: 15000 },
        );
      } else if (accion === "borrar") {
        borrarCasa();
        casa = null;
        pintarCasa();
        pintarLugares();
        aviso("Casa borrada");
      }
    }),
  );
}

function fijarCasa(lat: number, lng: number) {
  casa = guardarCasa(lat, lng);
  pintarCasa();
  pintarLugares();
  aviso("⌂ Casa guardada en este navegador");
  caerEn(lat, lng, 16.5);
}
botonCasa.addEventListener("click", () => alternarMenu(menuCasa, botonCasa));

// ---------- Satélite ----------
const satelite = new VistaSatelite(mapa);
const menuSat = document.getElementById("menu-sat")!;
const botonSat = document.getElementById("boton-sat")!;
const notaBase = document.getElementById("nota-base")!;

function pintarMenuSat() {
  menuSat.innerHTML = `<b>Vista</b>${BASES.map(
    (b) => `<button data-base="${b.id}" aria-pressed="${satelite.actual === b.id}">${esc(b.nombre)}<small>${esc(b.detalle)}</small></button>`,
  ).join("")}`;
  menuSat.querySelectorAll<HTMLButtonElement>("[data-base]").forEach((b) =>
    b.addEventListener("click", () => {
      menuSat.hidden = true;
      notaBase.hidden = false;
      notaBase.textContent = "Conectando con el satélite…";
      satelite.poner(b.dataset.base as Base);
    }),
  );
}
satelite.alCambiar = (b, nota) => {
  botonSat.classList.toggle("activo", b !== "mapa");
  notaBase.hidden = !nota;
  notaBase.textContent = nota;
  // Las vistas de NASA cubren regiones enteras: se aleja la cámara y se baja la inclinación
  // para que la niebla del horizonte no tape el suelo.
  if (b === "goes" || b === "modis") mapa.easeTo({ zoom: Math.min(mapa.getZoom(), b === "goes" ? 6.5 : 9), pitch: b === "goes" ? 15 : 35, duration: 1600 });
  pintarMenuSat();
};
botonSat.addEventListener("click", () => alternarMenu(menuSat, botonSat));
const capas3d = iniciarCapas3D({
  mapa,
  satelite,
  alSuelo: (id, activo) => {
    alternarRaster(id, activo);
    if (!tabs.capas.hidden) pintarCapas();
  },
  enSuelo: (id) => activasRaster.has(id),
});
pintarMenuSat();
mapa.once("load", pintarCasa);

// ---------- Caída ----------
/** Llega a un lugar "cayendo" desde arriba: sube, se inclina y aterriza con una onda. */
function caerEn(lat: number, lng: number, zoom = 16.2) {
  const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducido) {
    mapa.jumpTo({ center: [lng, lat], zoom, pitch: en3d ? 60 : 0 });
    return leerZona(lat, lng);
  }
  const lejos = distancia(mapa.getCenter().lat, mapa.getCenter().lng, lat, lng) > 400;
  mapa.flyTo({
    center: [lng, lat],
    zoom,
    pitch: en3d ? 66 : 0,
    bearing: en3d ? mapa.getBearing() + 35 : 0,
    curve: lejos ? 1.9 : 1.2,
    duration: lejos ? 3600 : 2200,
    // Cae acelerando y los últimos metros van en cámara lenta.
    easing: (t) => (t < 0.55 ? 0.88 * (t / 0.55) ** 2.4 : 0.88 + 0.12 * (1 - (1 - (t - 0.55) / 0.45) ** 3)),
    essential: true,
  });
  leerZona(lat, lng);
  mapa.once("moveend", () => {
    const onda = Object.assign(document.createElement("div"), { className: "impacto" });
    const m = new maplibregl.Marker({ element: onda }).setLngLat([lng, lat]).addTo(mapa);
    setTimeout(() => m.remove(), 1300);
  });
}

// ---------- Zona ----------
async function leerZona(lat: number, lng: number) {
  ultimoPunto = { lat, lng };
  marcador.setLngLat([lng, lat]).addTo(mapa);
  elMarcador.classList.remove("mira--pulso");
  void elMarcador.offsetWidth;
  elMarcador.classList.add("mira--pulso");
  abrirTab("zona");
  controlZona?.abort();
  controlZona = new AbortController();
  tabs.zona.innerHTML = `<p class="cargando">Leyendo la zona (${lat.toFixed(5)}, ${lng.toFixed(5)})</p>`;
  try {
    const r = await resumir(lat, lng, 500, controlZona.signal);
    if (controlZona.signal.aborted) return;
    tabs.zona.innerHTML = htmlZona(r);
    animar(tabs.zona);
    if (CLAVE_WINDY) pintarWebcams(lat, lng, controlZona.signal);
    void ahoraAqui(r, controlZona.signal);
    tabs.zona.querySelector("[data-guardar]")?.addEventListener("click", () => guardarPunto(lat, lng));
    tabs.zona.querySelector("[data-waze-zona]")?.addEventListener("click", () => abrirWaze(lat, lng));
    tabs.zona.querySelectorAll<HTMLButtonElement>("[data-webcam]").forEach((b) => b.addEventListener("click", () => camarasUI.abrirExterna(b.dataset.titulo ?? "Webcam", b.dataset.webcam!)));
  } catch (e) {
    if (!controlZona.signal.aborted) tabs.zona.innerHTML = `<p class="errores">No pude leer la zona: ${esc(e)}</p>`;
  }
}

/** "Ahora aquí": lo que pasa encima y alrededor del punto (satélites, incendios, eventos) y sus noticias. */
async function ahoraAqui(r: Resumen, signal: AbortSignal) {
  const caja = document.createElement("section");
  caja.className = "ahora-aqui";
  caja.innerHTML = `<h3>Ahora aquí</h3><p class="cargando">Mirando el cielo y las noticias</p>`;
  tabs.zona.appendChild(caja);
  const lineas = await planeta.resumen(r.lat, r.lng);
  if (signal.aborted) return;
  const tema = r.zona.find((d) => d.etiqueta === "Barrio")?.valor ?? r.zona.find((d) => d.etiqueta === "Localidad")?.valor;
  let h = `<h3>Ahora aquí</h3>${lineas.length ? `<ul class="lista">${lineas.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : `<p class="nota">Cielo y alrededores tranquilos.</p>`}`;
  caja.innerHTML = h + (tema ? `<p class="cargando">Noticias de ${esc(tema)}</p>` : "");
  if (!tema) return;
  try {
    const ns = await planeta.noticiasDe(tema);
    if (signal.aborted) return;
    h += `<h3>Noticias de ${esc(tema)} (48 h)</h3>${
      ns.length
        ? `<ul class="lista">${ns.map((n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.titulo)}</a><div class="sub">${esc(n.medio)}</div></li>`).join("")}</ul>`
        : `<p class="nota">Sin noticias recientes con ese nombre.</p>`
    }`;
  } catch (e) {
    h += `<p class="nota">Noticias: ${esc(e instanceof Error ? e.message : e)}</p>`;
  }
  if (!signal.aborted) caja.innerHTML = h;
}

function htmlZona(r: Resumen): string {
  const partes: string[] = [];
  partes.push(`<h2 data-descifrar>${esc(r.zona.find((d) => d.etiqueta === "Barrio")?.valor ?? "Zona")}</h2><p class="nota">${r.lat.toFixed(5)}, ${r.lng.toFixed(5)} · leído a las ${new Date().toLocaleTimeString("es-CO")}${casa ? ` · <b>${esc(textoDistancia(distancia(r.lat, r.lng, casa.lat, casa.lng)))}</b>` : ""}</p>`);
  partes.push(
    r.zona.length
      ? `<dl class="datos">${r.zona.map((d) => `<dt>${esc(d.etiqueta)}</dt><dd>${esc(d.valor)}</dd>`).join("")}</dl>`
      : `<p class="vacio">Fuera de las capas de Bogotá.</p>`,
  );

  const t: string[] = [];
  if (r.clima) {
    t.push(`<div class="tarjeta"><b data-contar="${Math.round(r.clima.temperatura)}" data-sufijo="°">${Math.round(r.clima.temperatura)}°</b><span>${esc(describirClima(r.clima.codigo))} · sens. ${Math.round(r.clima.sensacion)}°</span></div>`);
    t.push(`<div class="tarjeta"><b>${r.clima.probLluviaProx3h}%</b><span>lluvia próx. 3 h</span></div>`);
    t.push(`<div class="tarjeta"><b>${r.clima.humedad}%</b><span>humedad · viento ${Math.round(r.clima.viento)} km/h</span></div>`);
  }
  if (r.aire) {
    const c = categoriaAire(r.aire.indiceUS);
    t.push(`<div class="tarjeta" style="box-shadow: inset 4px 0 0 ${c.color}"><b data-contar="${r.aire.indiceUS}">${r.aire.indiceUS}</b><span>aire: ${esc(c.texto)} · PM2.5 ${r.aire.pm25}</span></div>`);
    t.push(`<div class="tarjeta"><b>${Math.round(r.aire.uv)}</b><span>índice UV</span></div>`);
  }
  if (t.length) partes.push(`<h3>Ahora mismo</h3><div class="tarjetas">${t.join("")}</div>`);

  if (r.cerca.length) {
    partes.push(`<h3>A menos de 500 m</h3><ul class="lista">`);
    for (const c of r.cerca) {
      const ej = c.ejemplos.map((x) => `${esc(x.nombre)} (${metros(x.metros)})`).join(" · ");
      partes.push(`<li><div class="fila"><span>${esc(c.capa.nombre)}</span><b>${c.total}${c.total >= 200 ? "+" : ""}</b></div>${ej ? `<div class="sub">${ej}</div>` : ""}</li>`);
    }
    partes.push(`</ul>`);
  }

  const cv = vivo.cercaDe(r.lat, r.lng, 500);
  partes.push(`<h3>En vivo a menos de 500 m</h3><ul class="lista">
    <li><div class="fila"><span>Semáforos en falla</span><b class="${cv.fallas ? "rojo" : ""}">${cv.fallas}</b></div></li>
    <li><div class="fila"><span>Cámaras (sin video público)</span><b>${cv.camaras.length}</b></div>${
      cv.camaras.length ? `<div class="sub">${cv.camaras.slice(0, 3).map((c) => `${esc(c.direccion)} · ${esc(c.estado.toLowerCase())}`).join(" · ")}</div>` : ""
    }</li></ul>`);

  const mios = lugares
    .todos()
    .map((l) => ({ l, d: Math.round(distancia(r.lat, r.lng, l.lat, l.lng)) }))
    .filter((x) => x.d <= 1500)
    .sort((a, b) => a.d - b.d);
  if (mios.length) {
    partes.push(`<h3>Mis lugares cerca</h3><ul class="lista">${mios
      .slice(0, 6)
      .map((x) => `<li><div class="fila"><span>${esc(x.l.nombre)}</span><span class="sub">${metros(x.d)} · ${x.l.visitado ? "ya fui" : "pendiente"}</span></div></li>`)
      .join("")}</ul>`);
  }

  const ll = `${r.lat},${r.lng}`;
  const enVivoCerca = vivo.cercaDe(r.lat, r.lng, 3000).camaras.filter((c) => c.video);
  partes.push(`<h3>Tráfico ahora</h3><div class="acciones"><button class="boton" data-waze-zona>Ver Waze en vivo aquí</button></div>`);
  if (enVivoCerca.length)
    partes.push(`<h3>Webcams en vivo a menos de 3 km</h3><div class="acciones">${enVivoCerca
      .map((c) => `<button class="boton peq" data-webcam="${esc(c.video!)}" data-titulo="${esc(c.direccion)}">▶ ${esc(c.direccion)} · ${metros(Math.round(distancia(r.lat, r.lng, c.lat, c.lng)))}</button>`)
      .join("")}</div>`);
  partes.push(`<h3>Cámaras en vivo</h3><div id="webcams">${
    CLAVE_WINDY ? `<p class="cargando">Buscando webcams públicas</p>` : ""
  }</div><div class="acciones">${enlacesEnVivo(r.lat, r.lng)
    .map((e) => `<a class="boton sec peq" target="_blank" rel="noopener" href="${e.url}">${esc(e.nombre)}</a>`)
    .join("")}</div><p class="nota">Las ${cv.camaras.length ? `${cv.camaras.length} cámaras del Distrito cercanas` : "cámaras del Distrito"} (tráfico, fotodetección, C4) no transmiten al público; estas son webcams públicas.</p>`);
  partes.push(`<h3>Ver la calle</h3><div class="acciones">
    <a class="boton sec peq" target="_blank" rel="noopener" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}">Street View</a>
    <a class="boton sec peq" target="_blank" rel="noopener" href="https://www.mapillary.com/app/?lat=${r.lat}&lng=${r.lng}&z=17">Mapillary</a>
    <a class="boton sec peq" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${ll}">Google Maps</a>
  </div>
  <p class="nota">Bogotá no publica video en vivo de sus cámaras; estas son imágenes públicas a nivel de calle.</p>`);
  partes.push(`<div class="acciones"><button class="boton" data-guardar>★ Guardar como mi lugar</button></div>`);
  if (r.errores.length) partes.push(`<p class="errores">Sin respuesta: ${r.errores.map(esc).join(" · ")}</p>`);
  return partes.join("");
}

async function pintarWebcams(lat: number, lng: number, signal: AbortSignal) {
  const cont = document.getElementById("webcams");
  if (!cont) return;
  try {
    const lista = (await webcamsCerca(lat, lng, signal)).map((w) => ({ w, d: Math.round(distancia(lat, lng, w.lat, w.lng)) })).sort((a, b) => a.d - b.d);
    if (signal.aborted) return;
    if (!lista.length) {
      cont.innerHTML = `<p class="nota">No hay webcams públicas activas a menos de 30 km.</p>`;
      return;
    }
    cont.innerHTML = lista
      .slice(0, 4)
      .map(
        ({ w, d }) => `<div class="webcam"><div class="fila"><b>${esc(w.titulo)}</b><span class="sub">${metros(d)}</span></div>${
          w.reproductor
            ? `<iframe src="${esc(w.reproductor)}" title="${esc(w.titulo)}" loading="lazy" allow="autoplay; fullscreen" referrerpolicy="no-referrer"></iframe>`
            : w.imagen
              ? `<img src="${esc(w.imagen)}" alt="${esc(w.titulo)}" loading="lazy" />`
              : ""
        }</div>`,
      )
      .join("");
  } catch (e) {
    if (!signal.aborted) cont.innerHTML = `<p class="errores">Webcams: ${esc(e instanceof Error ? e.message : e)}</p>`;
  }
}

// ---------- Capas ----------
function pintarCapas() {
  const grupos = new Map<string, CapaPOI[]>();
  for (const c of CAPAS_POI) grupos.set(c.grupo, [...(grupos.get(c.grupo) ?? []), c]);
  const z = mapa.getZoom();
  let h = `${capas3d.html()}<h2>Puntos y capas</h2><label class="capa"><input type="checkbox" id="pines-3d" ${pinesMapa.activo ? "checked" : ""}/>Pines 3D en cada punto<small>desde zoom 9</small></label>
  <p class="nota">Datos oficiales en vivo de Catastro Bogotá / IDECA. Centros comerciales: guardados con la página (oficial + OpenStreetMap).</p>`;
  for (const [g, cs] of grupos) {
    h += `<h3>${esc(g)}</h3>`;
    for (const c of cs) {
      h += `<label class="capa"><input type="checkbox" data-poi="${c.id}" ${activasPOI.has(c.id) ? "checked" : ""}/><i style="background:${c.color}"></i>${esc(c.nombre)}${
        activasPOI.has(c.id) && z < c.zoomMin ? `<small>acerca el zoom</small>` : ""
      }</label>`;
    }
  }
  h += `<h3>Mapas de calor y límites</h3>`;
  for (const c of CAPAS_RASTER) {
    h += `<label class="capa"><input type="checkbox" data-raster="${c.id}" ${activasRaster.has(c.id) ? "checked" : ""}/>${esc(c.nombre)}</label>`;
  }
  tabs.capas.innerHTML = h;
  capas3d.conectar(tabs.capas, pintarCapas);
  tabs.capas.querySelector<HTMLInputElement>("#pines-3d")?.addEventListener("change", (e) => pinesMapa.alternar((e.target as HTMLInputElement).checked));
  tabs.capas.querySelectorAll<HTMLInputElement>("[data-poi]").forEach((i) => i.addEventListener("change", () => alternarPOI(i.dataset.poi!, i.checked)));
  tabs.capas.querySelectorAll<HTMLInputElement>("[data-raster]").forEach((i) => i.addEventListener("change", () => alternarRaster(i.dataset.raster!, i.checked)));
}

function alternarRaster(id: string, on: boolean) {
  const c = CAPAS_RASTER.find((x) => x.id === id)!;
  if (on) {
    activasRaster.add(id);
    if (!mapa.getSource(id)) mapa.addSource(id, { type: "raster", tiles: [plantillaRaster(c)], tileSize: 256 });
    if (!mapa.getLayer(id)) mapa.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": c.opacidad } }, ANCLA_DATOS);
  } else {
    activasRaster.delete(id);
    if (mapa.getLayer(id)) mapa.removeLayer(id);
  }
}

function alternarPOI(id: string, on: boolean) {
  const c = CAPAS_POI.find((x) => x.id === id)!;
  if (on) {
    activasPOI.add(id);
    if (!mapa.getSource(id)) {
      mapa.addSource(id, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      const antes = "intereses";
      mapa.addLayer({ id: `${id}-area`, type: "fill", source: id, filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": c.color, "fill-opacity": 0.35, "fill-outline-color": c.color } }, antes);
      mapa.addLayer({ id: `${id}-linea`, type: "line", source: id, filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": c.color, "line-width": 3 } }, antes);
      mapa.addLayer({ id: `${id}-punto`, type: "circle", source: id, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 0, 7, 5, 9, 5, 10.5, 2.5], "circle-color": c.color, "circle-stroke-width": 1, "circle-stroke-color": "#fff" } }, antes);
      for (const l of [`${id}-area`, `${id}-punto`]) {
        capasInteractivas.push(l);
        mapa.on("mouseenter", l, () => (mapa.getCanvas().style.cursor = "pointer"));
        mapa.on("mouseleave", l, () => (mapa.getCanvas().style.cursor = ""));
      }
    }
    for (const s of ["area", "linea", "punto"]) mapa.setLayoutProperty(`${id}-${s}`, "visibility", "visible");
    cargarPOI(c);
  } else {
    activasPOI.delete(id);
    archivosPuestos.delete(id);
    pinesMapa.quitar(id);
    for (const s of ["area", "linea", "punto"]) if (mapa.getLayer(`${id}-${s}`)) mapa.setLayoutProperty(`${id}-${s}`, "visibility", "none");
  }
  pintarCapas();
}

const controlesPOI = new Map<string, AbortController>();
const archivosPuestos = new Set<string>();
async function cargarPOI(c: CapaPOI) {
  if (c.archivo) {
    // Archivo guardado: se pone una sola vez para toda la ciudad.
    if (archivosPuestos.has(c.id)) return;
    archivosPuestos.add(c.id);
    const a = await cargarGuardados(c.archivo);
    if (!a) {
      archivosPuestos.delete(c.id);
      return aviso(`${c.nombre}: no encontré el archivo guardado`);
    }
    const fc = geojsonGuardados(a);
    fc.features.forEach((f) => (f.properties = { ...f.properties, __capa: c.id }));
    (mapa.getSource(c.id) as GeoJSONSource | undefined)?.setData(fc);
    if (activasPOI.has(c.id)) pinesMapa.poner(c.id, fc, { color: c.color });
    return;
  }
  if (mapa.getZoom() < c.zoomMin) return;
  controlesPOI.get(c.id)?.abort();
  const ctl = new AbortController();
  controlesPOI.set(c.id, ctl);
  const b = mapa.getBounds();
  try {
    const fc = await geojsonCaja(c.ruta, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], ctl.signal);
    fc.features.forEach((f) => (f.properties = { ...f.properties, __capa: c.id }));
    (mapa.getSource(c.id) as GeoJSONSource | undefined)?.setData(fc);
    pinesMapa.poner(c.id, fc, { color: c.color });
  } catch (e) {
    if (!ctl.signal.aborted) aviso(`${c.nombre}: sin respuesta del servidor`);
  }
}

function refrescarPOI() {
  for (const id of activasPOI) cargarPOI(CAPAS_POI.find((c) => c.id === id)!);
  if (!tabs.capas.hidden) pintarCapas();
}

function popupDe(f: maplibregl.MapGeoJSONFeature, donde: maplibregl.LngLat) {
  const p = (f.properties ?? {}) as Atributos & { __capa?: string; nombre?: string; sub?: string; id?: string };
  let h = "";
  if (!p.__capa) {
    h = `<b>${esc(p.nombre)}</b><br><span class="nota">${esc(p.sub ?? "")}</span>`;
  } else {
    const c = CAPAS_POI.find((x) => x.id === p.__capa);
    if (!c) return;
    h = `<b>${esc(c.titulo(p))}</b><br><span class="nota">${esc(c.nombre)}</span>${(c.detalle?.(p) ?? []).map((d) => `<br>${esc(d)}`).join("")}`;
  }
  h += `<div class="acciones"><button class="boton peq" data-leer>Leer zona aquí</button></div>`;
  const pop = new maplibregl.Popup({ maxWidth: "280px" }).setLngLat(donde).setHTML(h).addTo(mapa);
  pop.getElement().querySelector("[data-leer]")?.addEventListener("click", () => {
    pop.remove();
    leerZona(donde.lat, donde.lng);
  });
}

// ---------- Intereses ----------
function estadoDe(l: LugarOSM): "visitado" | "pendiente" | "nuevo" {
  const m = lugares.porOsm(l.id);
  return m ? (m.visitado ? "visitado" : "pendiente") : "nuevo";
}

function geoIntereses(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: visibles().map((l) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [l.lng, l.lat] },
      properties: { nombre: l.nombre, estado: estadoDe(l), sub: [l.horario, l.cobra && `cobra: ${l.cobra}`].filter(Boolean).join(" · ") },
    })),
  };
}

function visibles(): LugarOSM[] {
  return soloGratis ? resultados.filter((l) => l.cobra !== "sí") : resultados;
}

function referencia(): { lat: number; lng: number } {
  if (ultimoPunto) return ultimoPunto;
  const c = mapa.getCenter();
  return { lat: c.lat, lng: c.lng };
}

function pintarIntereses() {
  let h = `<p class="nota">${perfil.actualizado ? `Perfil de gustos actualizado ${esc(perfil.actualizado)}.` : "Usando intereses de arranque; tu perfil real llegará de la sesión de gustos."} Toca un interés para buscarlo en la vista actual (o en toda Bogotá si estás lejos).</p>`;
  for (const a of perfil.areas) {
    h += `<h3>${esc(a.area)}</h3><div class="chips">`;
    for (const g of a.gustos) {
      const estrellas = g.nivel ? " " + "★".repeat(Math.min(5, g.nivel)) : "";
      h += `<button class="chip" data-gusto="${esc(g.id)}" aria-pressed="${gustoActivo?.id === g.id}">${esc(g.nombre)}${estrellas}</button>`;
    }
    h += `</div>`;
  }
  if (gustoActivo) {
    const g = gustoActivo;
    h += `<h2>${esc(g.nombre)}</h2>`;
    if (g.preferencias && Object.keys(g.preferencias).length) {
      h += `<dl class="datos">${Object.entries(g.preferencias)
        .map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(Array.isArray(v) ? v.join(", ") : v)}</dd>`)
        .join("")}</dl>`;
    }
    if (g.id === "helado" || g.preferencias?.sabor || g.preferencias?.sabor_favorito) {
      h += `<p class="nota">Los sabores no están en datos abiertos: pídele a Claude que verifique qué heladerías tienen tu sabor y lo guardo en la nota del lugar.</p>`;
    }
    h += `<label class="capa"><input type="checkbox" id="solo-gratis" ${soloGratis ? "checked" : ""}/> Ocultar los que cobran</label>`;
    const ref = referencia();
    const lista = visibles()
      .map((l) => ({ l, d: Math.round(distancia(ref.lat, ref.lng, l.lat, l.lng)) }))
      .sort((a, b) => a.d - b.d);
    h += `<p class="nota">${lista.length} resultados · ${esc(fuenteResultados || "OpenStreetMap")}${g.capas?.length ? " + capas oficiales activadas en el mapa" : ""}.</p>
    <div class="acciones"><button class="boton sec peq" data-en-vivo>↻ Buscar en vivo (más reciente)</button></div><ul class="lista">`;
    for (const { l, d } of lista.slice(0, 80)) {
      const est = estadoDe(l);
      const badges = [
        l.cobra === "no" ? `<span class="etiqueta ok">gratis</span>` : l.cobra === "sí" ? `<span class="etiqueta no">cobra</span>` : "",
        l.acceso === "yes" || l.acceso === "public" ? `<span class="etiqueta ok">público</span>` : l.acceso === "private" ? `<span class="etiqueta no">privado</span>` : "",
        est !== "nuevo" ? `<span class="etiqueta">${est === "visitado" ? "ya fui" : "quiero ir"}</span>` : "",
      ].join(" ");
      h += `<li><div class="fila"><button class="enlace" data-ir="${esc(l.id)}">${esc(l.nombre)}</button><span class="sub">${metros(d)}</span></div>
        <div class="sub">${[l.horario && `🕑 ${esc(l.horario)}`, l.direccion && esc(l.direccion), l.telefono && esc(l.telefono)].filter(Boolean).join(" · ")}</div>
        <div>${badges}</div>
        <div class="acciones"><button class="boton peq" data-fui="${esc(l.id)}">Ya fui</button><button class="boton sec peq" data-quiero="${esc(l.id)}">Quiero ir</button>${
          l.web ? `<a class="boton sec peq" target="_blank" rel="noopener" href="${esc(l.web.startsWith("http") ? l.web : "https://" + l.web)}">Web</a>` : ""
        }</div></li>`;
    }
    h += `</ul>`;
    if (g.lugares_conocidos?.length) {
      h += `<h3>Que ya conoces (de tu perfil)</h3><ul class="lista">${g.lugares_conocidos
        .map((c) => `<li>${esc(c.nombre)} <span class="sub">${c.visitado ? "ya fui" : ""} ${esc(c.nota ?? "")}</span></li>`)
        .join("")}</ul>`;
    }
  }
  tabs.intereses.innerHTML = h;
  tabs.intereses.querySelectorAll<HTMLButtonElement>("[data-gusto]").forEach((b) => b.addEventListener("click", () => elegirGusto(b.dataset.gusto!)));
  tabs.intereses.querySelector("[data-en-vivo]")?.addEventListener("click", () => gustoActivo && buscarEnVivo(gustoActivo));
  tabs.intereses.querySelector<HTMLInputElement>("#solo-gratis")?.addEventListener("change", (e) => {
    soloGratis = (e.target as HTMLInputElement).checked;
    actualizarIntereses();
  });
  const porId = (id: string) => resultados.find((r) => r.id === id)!;
  tabs.intereses.querySelectorAll<HTMLButtonElement>("[data-ir]").forEach((b) =>
    b.addEventListener("click", () => {
      const l = porId(b.dataset.ir!);
      mapa.flyTo({ center: [l.lng, l.lat], zoom: 17 });
    }),
  );
  for (const [attr, visitado] of [["fui", true], ["quiero", false]] as const) {
    tabs.intereses.querySelectorAll<HTMLButtonElement>(`[data-${attr}]`).forEach((b) =>
      b.addEventListener("click", () => {
        const l = porId(b.dataset[attr]!);
        const m = lugares.porOsm(l.id);
        if (m) lugares.marcarVisitado(m.id, visitado);
        else
          lugares.agregar({
            nombre: l.nombre,
            lat: l.lat,
            lng: l.lng,
            categoria: gustoActivo?.nombre ?? "interés",
            gusto: gustoActivo?.id,
            osm: l.id,
            visitado,
            fecha: visitado ? new Date().toISOString().slice(0, 10) : undefined,
          });
        aviso(visitado ? `✓ ${l.nombre}: ya fuiste` : `★ ${l.nombre}: en tu lista`);
      }),
    );
  }
}

function actualizarIntereses() {
  (mapa.getSource("intereses") as GeoJSONSource | undefined)?.setData(geoIntereses());
  pinesMapa.poner("intereses", geoIntereses(), {
    color: (p) => (p.estado === "visitado" ? "#1e8449" : p.estado === "pendiente" ? "#f39c12" : "#b06cff"),
    icono: (p) => (p.estado === "visitado" ? "✅" : elegirIcono(gustoActivo?.icono, gustoActivo?.id)),
  });
  pintarIntereses();
}

let controlIntereses: AbortController | null = null;

/** Caja de búsqueda: la vista si estás cerca, si no toda Bogotá. */
function cajaBusqueda(): Caja {
  const b = mapa.getBounds();
  return mapa.getZoom() >= 12.5 ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : CAJA_BOGOTA;
}

async function elegirGusto(id: string) {
  const g = perfil.areas.flatMap((a) => a.gustos).find((x) => x.id === id) ?? null;
  if (gustoActivo?.id === id) {
    gustoActivo = null;
    resultados = [];
    return actualizarIntereses();
  }
  gustoActivo = g;
  resultados = [];
  fuenteResultados = "";
  pintarIntereses();
  if (!g) return;
  for (const c of g.capas ?? []) if (!activasPOI.has(c)) alternarPOI(c, true);
  controlIntereses?.abort();
  controlIntereses = new AbortController();
  const signal = controlIntereses.signal;
  // 1) Lugares guardados con la página: instantáneo y sin servidor.
  const a = await cargarGuardados(g.id);
  if (signal.aborted) return;
  if (a?.lugares.length) {
    const caja = cajaBusqueda();
    const todos = aLugaresOSM(a);
    const enVista = todos.filter((l) => dentroDeCaja(l, caja));
    resultados = enVista.length ? enVista : todos;
    fuenteResultados = `guardados ${a.generado.slice(0, 10)} · ${a.fuente}${enVista.length && enVista.length < todos.length ? ` · en esta vista (${todos.length} en Bogotá)` : ""}`;
    actualizarIntereses();
    return;
  }
  // 2) Sin archivo guardado: en vivo.
  await buscarEnVivo(g);
}

/** Overpass (todas las etiquetas) y, si no responde, Photon como respaldo parcial. */
async function buscarEnVivo(g: Gusto) {
  if (!g.osm?.length && !g.photon) return aviso("Este gusto no tiene etiquetas de OpenStreetMap todavía");
  controlIntereses?.abort();
  controlIntereses = new AbortController();
  const signal = controlIntereses.signal;
  const caja = cajaBusqueda();
  document.getElementById("buscando")?.remove();
  tabs.intereses.insertAdjacentHTML("beforeend", `<p class="cargando" id="buscando">Buscando ${esc(g.nombre)} en vivo en OpenStreetMap</p>`);
  let error = "";
  try {
    if (!g.osm?.length) throw new Error("sin etiquetas");
    resultados = await buscar(g.osm, caja, signal);
    fuenteResultados = "OpenStreetMap en vivo (Overpass)";
  } catch (e) {
    if (signal.aborted) return;
    error = e instanceof Error ? e.message : String(e);
    try {
      if (!g.photon) throw new Error("sin respaldo");
      resultados = await buscarPhoton(g.photon.include, caja, g.photon.nombre, signal);
      fuenteResultados = "resultados parciales (respaldo Photon, máx. 50, sin horario ni cobro)";
    } catch (e2) {
      if (signal.aborted) return;
      document.getElementById("buscando")?.remove();
      return aviso(`OpenStreetMap no respondió (${error}; respaldo: ${e2 instanceof Error ? e2.message : e2}). Intenta de nuevo.`);
    }
  }
  actualizarIntereses();
  if (!resultados.length) aviso("Sin resultados en esta zona; aleja el mapa para buscar en toda Bogotá");
}

// ---------- Mis lugares ----------
function pinesLugares() {
  pinesMapa.poner("mis-lugares", geoLugares(), { color: (p) => (p.visitado ? "#2ecc71" : "#f39c12"), icono: (p) => (p.visitado ? "✅" : "⭐"), escala: 1.2 });
}

function geoLugares(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: lugares.todos().map((l) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [l.lng, l.lat] },
      properties: { id: l.id, nombre: l.nombre, visitado: l.visitado, sub: `${l.categoria} · ${l.visitado ? "ya fui" : "pendiente"}${l.notas ? " · " + l.notas : ""}` },
    })),
  };
}

function guardarPunto(lat: number, lng: number) {
  const nombre = prompt("Nombre del lugar:");
  if (!nombre) return;
  const categoria = prompt("Categoría (casa, trabajo, comida, deporte…):", "otro") || "otro";
  const visitado = confirm("¿Ya fuiste a este lugar? (Aceptar = sí, Cancelar = pendiente)");
  lugares.agregar({ nombre, lat, lng, categoria, visitado, fecha: visitado ? new Date().toISOString().slice(0, 10) : undefined });
  aviso(`★ Guardado: ${nombre}`);
}

function pintarLugares() {
  const todos = lugares.todos();
  const lista = todos.filter((l) => (filtroLugares === "todos" ? true : filtroLugares === "visitados" ? l.visitado : !l.visitado));
  const v = todos.filter((l) => l.visitado).length;
  let h = `<div class="tarjetas"><div class="tarjeta"><b>${todos.length}</b><span>lugares</span></div><div class="tarjeta"><b>${v}</b><span>ya fui</span></div><div class="tarjeta"><b>${todos.length - v}</b><span>pendientes</span></div></div>
  <div class="acciones">
    <button class="boton" data-agregar>＋ Agregar tocando el mapa</button>
    <button class="boton sec" data-exportar>Exportar</button>
    <label class="boton sec">Importar<input type="file" accept="application/json" hidden data-importar></label>
  </div>
  <p class="nota">Se guardan solo en este navegador. Exporta el JSON para respaldarlos o pasárselos a Claude.</p>
  <div class="chips" style="margin:10px 0">${(["todos", "visitados", "pendientes"] as const)
    .map((f) => `<button class="chip" data-filtro="${f}" aria-pressed="${filtroLugares === f}">${f === "todos" ? "Todos" : f === "visitados" ? "Ya fui" : "Pendientes"}</button>`)
    .join("")}</div><ul class="lista">`;
  const dCasa = (l: MiLugar) => (casa ? distancia(casa.lat, casa.lng, l.lat, l.lng) : 0);
  const orden = casa ? (a: MiLugar, b: MiLugar) => dCasa(a) - dCasa(b) : (a: MiLugar, b: MiLugar) => a.nombre.localeCompare(b.nombre, "es");
  if (casa) h += `<p class="nota">Ordenados por distancia a tu casa.</p>`;
  for (const l of lista.sort(orden)) {
    h += `<li><div class="fila"><button class="enlace" data-ver="${l.id}">${esc(l.nombre)}</button><span class="sub">${esc(l.categoria)}${casa ? ` · ${(dCasa(l) / 1000).toFixed(1)} km` : ""}</span></div>
      ${l.notas ? `<div class="sub">${esc(l.notas)}</div>` : ""}
      <div class="acciones">
        <button class="boton peq ${l.visitado ? "" : "sec"}" data-alternar="${l.id}">${l.visitado ? "✓ Ya fui" : "Pendiente"}</button>
        <button class="boton sec peq" data-nota="${l.id}">Nota</button>
        <button class="boton sec peq" data-borrar="${l.id}">Borrar</button>
      </div></li>`;
  }
  h += `</ul>${lista.length ? "" : `<p class="vacio">Aún no hay lugares aquí.</p>`}`;
  tabs.lugares.innerHTML = h;

  const q = <T extends HTMLElement>(sel: string) => tabs.lugares.querySelectorAll<T>(sel);
  q("[data-agregar]").forEach((b) =>
    b.addEventListener("click", () => {
      modoAgregar = true;
      mapa.getCanvas().style.cursor = "crosshair";
      panel.classList.add("contraido");
      aviso("Toca el mapa donde está el lugar");
    }),
  );
  q("[data-exportar]").forEach((b) => b.addEventListener("click", () => descargar("mis-lugares.json", lugares.exportar())));
  q<HTMLInputElement>("[data-importar]").forEach((i) =>
    i.addEventListener("change", async () => {
      const f = i.files?.[0];
      if (!f) return;
      try {
        aviso(`Importados ${lugares.importar(JSON.parse(await f.text()))} lugares`);
      } catch {
        aviso("Ese archivo no es un JSON válido");
      }
    }),
  );
  q("[data-filtro]").forEach((b) =>
    b.addEventListener("click", () => {
      filtroLugares = b.dataset.filtro as typeof filtroLugares;
      pintarLugares();
    }),
  );
  const buscarL = (id: string) => todos.find((l) => l.id === id)!;
  q("[data-ver]").forEach((b) =>
    b.addEventListener("click", () => {
      const l = buscarL(b.dataset.ver!);
      caerEn(l.lat, l.lng);
    }),
  );
  q("[data-alternar]").forEach((b) => b.addEventListener("click", () => lugares.marcarVisitado(b.dataset.alternar!, !buscarL(b.dataset.alternar!).visitado)));
  q("[data-nota]").forEach((b) =>
    b.addEventListener("click", () => {
      const l = buscarL(b.dataset.nota!);
      const n = prompt(`Nota para ${l.nombre}:`, l.notas ?? "");
      if (n !== null) lugares.actualizar(l.id, { notas: n });
    }),
  );
  q("[data-borrar]").forEach((b) =>
    b.addEventListener("click", () => {
      const l = buscarL(b.dataset.borrar!);
      if (confirm(`¿Borrar ${l.nombre}?`)) lugares.eliminar(l.id);
    }),
  );
}

lugares.alCambiar(() => {
  (mapa.getSource("mis-lugares") as GeoJSONSource | undefined)?.setData(geoLugares());
  pinesLugares();
  pintarLugares();
  if (gustoActivo) actualizarIntereses();
});

pintarCapas();
pintarIntereses();
pintarLugares();

// ---------- Jarvis: el asistente usa las mismas funciones del mapa ----------
async function resolverLugar(lugar?: string, lat?: number, lng?: number): Promise<{ lat: number; lng: number; nombre: string }> {
  if (lat !== undefined && lng !== undefined) return { lat, lng, nombre: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
  const q = (lugar ?? "").trim();
  if (!q || /^(mi )?casa$/i.test(q)) {
    if (!casa) throw new Error("No has marcado tu casa (botón ⌂)");
    return { lat: casa.lat, lng: casa.lng, nombre: "tu casa" };
  }
  const [r] = await buscarDireccion(/bogot/i.test(q) ? q : `${q}, Bogotá`);
  if (!r) throw new Error(`No encontré "${q}"`);
  return { lat: r.lat, lng: r.lng, nombre: r.nombre };
}

const jarvisUI = iniciarJarvis({
  async volarA(lugar) {
    const p = await resolverLugar(lugar);
    caerEn(p.lat, p.lng, p.nombre === "tu casa" ? 16.5 : 15);
    return `Volé a ${p.nombre} (${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}).`;
  },
  async leerZona(lugar, lat, lng) {
    const p = await resolverLugar(lugar, lat, lng);
    caerEn(p.lat, p.lng, 15.5);
    void leerZona(p.lat, p.lng); // la ficha en pantalla
    const r = await resumir(p.lat, p.lng, 500);
    const datos = r.zona.map((d) => `${d.etiqueta}: ${d.valor}`);
    if (r.clima) datos.push(`Clima: ${Math.round(r.clima.temperatura)} °C, ${describirClima(r.clima.codigo)}, lluvia próx. 3 h ${r.clima.probLluviaProx3h}%`);
    if (r.aire) datos.push(`Aire: índice US ${r.aire.indiceUS} (${categoriaAire(r.aire.indiceUS).texto}), PM2.5 ${r.aire.pm25}`);
    for (const c of r.cerca) datos.push(`${c.capa.nombre} a menos de 500 m: ${c.total}${c.ejemplos.length ? ` (${c.ejemplos.map((e) => `${e.nombre} ${e.metros} m`).join(", ")})` : ""}`);
    if (casa) datos.push(`Distancia a la casa: ${textoDistancia(distancia(p.lat, p.lng, casa.lat, casa.lng))}`);
    if (r.errores.length) datos.push(`Fuentes que no respondieron: ${r.errores.join("; ")}`);
    return `Zona en ${p.nombre}:\n${datos.join("\n")}`;
  },
  async buscarGusto(id, gratis) {
    if (gustoActivo?.id !== id) await elegirGusto(id);
    if (gratis !== soloGratis) {
      soloGratis = !!gratis;
      actualizarIntereses();
    }
    abrirTab("intereses");
    const ref = casa ?? referencia();
    const lista = visibles()
      .map((l) => ({ l, d: distancia(ref.lat, ref.lng, l.lat, l.lng) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 10);
    if (!lista.length) return `No hay resultados de ${id} en esta vista.`;
    return `${visibles().length} lugares de "${gustoActivo?.nombre ?? id}" (${fuenteResultados}). Los más cercanos a ${casa ? "la casa" : "la vista"}:\n${lista
      .map(({ l, d }) => `- ${l.nombre} · ${(d / 1000).toFixed(1)} km${l.cobra ? ` · cobra: ${l.cobra}` : ""}${l.horario ? ` · ${l.horario}` : ""}${l.direccion ? ` · ${l.direccion}` : ""} · ${estadoDe(l) === "visitado" ? "ya fue" : estadoDe(l) === "pendiente" ? "quiere ir" : "no ha ido"}`)
      .join("\n")}`;
  },
  async capa(id, on) {
    if (["satelites", "noche", "incendios", "eventos"].includes(id)) planeta.alternar(id as "satelites", on);
    else if (id === "pines-3d") pinesMapa.alternar(on);
    else if (CAPAS_POI.some((c) => c.id === id)) {
      if (activasPOI.has(id) !== on) alternarPOI(id, on);
    } else if (CAPAS_RASTER.some((c) => c.id === id)) {
      alternarRaster(id, on);
      pintarCapas();
    } else throw new Error(`No conozco la capa ${id}`);
    return `Capa ${id} ${on ? "encendida" : "apagada"}.`;
  },
  async vista(tipo) {
    if (tipo === "tierra") {
      if (!enTierra) botonTierra.click();
    } else if (tipo === "bogota") volarABogota(4200);
    else if (tipo === "satelite_hd") await satelite.poner("esri");
    else if (tipo === "satelite_2026") await satelite.poner("sentinel");
    else if (tipo === "mapa") await satelite.poner("mapa");
    else if (tipo === "capas3d") {
      abrirTab("capas");
      capas3d.entrar();
    }
    return `Vista: ${tipo}.`;
  },
  async misDatos() {
    const ls = lugares.todos();
    const gustos = perfil.areas.flatMap((a) => a.gustos.map((g) => `${g.nombre} (${g.id}${g.nivel ? `, nivel ${g.nivel}` : ""}${g.preferencias ? `, ${JSON.stringify(g.preferencias)}` : ""})`));
    return [
      casa ? `Casa: ${casa.lat.toFixed(4)}, ${casa.lng.toFixed(4)}` : "Casa: no marcada",
      `Lugares guardados (${ls.length}): ${ls.map((l) => `${l.nombre} [${l.categoria}, ${l.visitado ? "ya fue" : "quiere ir"}${casa ? `, ${(distancia(casa.lat, casa.lng, l.lat, l.lng) / 1000).toFixed(1)} km` : ""}]`).join("; ") || "ninguno"}`,
      `Gustos: ${gustos.join("; ")}`,
    ].join("\n");
  },
  async planeta(lat, lng) {
    const p = lat !== undefined && lng !== undefined ? { lat, lng } : casa ?? { lat: 4.65, lng: -74.08 };
    const l = await planeta.resumen(p.lat, p.lng);
    return l.length ? l.join("\n") : "Nada destacado encima ni alrededor.";
  },
  catalogo: () => ({
    gustos: perfil.areas.flatMap((a) => a.gustos.map((g) => g.id)),
    capas: [...CAPAS_POI.map((c) => c.id), ...CAPAS_RASTER.map((c) => c.id), "satelites", "noche", "incendios", "eventos", "pines-3d"],
  }),
});
document.getElementById("boton-jarvis")?.addEventListener("click", () => jarvisUI.abrir());

// ---------- Atajos de teclado ----------
const ATAJOS: Record<string, [string, () => void]> = {
  j: ["Jarvis", () => jarvisUI.abrir()],
  g: ["Globo / volver a Bogotá", () => botonTierra.click()],
  d: ["Día y noche", () => planeta.alternar("noche")],
  s: ["Satélites", () => planeta.alternar("satelites")],
  i: ["Incendios", () => planeta.alternar("incendios")],
  e: ["Eventos NASA", () => planeta.alternar("eventos")],
  v: ["Pestaña Vivo", () => abrirTab("vivo")],
  "?": ["Ver atajos", () => aviso(Object.entries(ATAJOS).map(([k, [n]]) => `${k.toUpperCase()} ${n}`).join(" · ") + " · Esc cerrar", 7000)],
};
addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement;
  if (e.metaKey || e.ctrlKey || e.altKey || t.closest("input, textarea, select, [contenteditable]")) return;
  if (e.key === "Escape") {
    document.querySelectorAll<HTMLElement>(".menu, #jarvis").forEach((m) => (m.hidden = true));
    return;
  }
  const a = ATAJOS[e.key.toLowerCase()];
  if (a) {
    e.preventDefault();
    a[1]();
  }
});
