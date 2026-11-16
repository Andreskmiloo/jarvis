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
import { cargarPerfil, type Gusto } from "./intereses/perfil";
import { ANCLA_DATOS, CAPA_EDIFICIOS, estiloMapa, EXAGERACION, type Tema, VISTA_2D, VISTA_3D } from "./mapa/estilo";
import { animar } from "./ui/anim";
import { iniciarVivo } from "./vivo";
import { iniciarCamaras } from "./camaras/ui";
import { borrarCasa, guardarCasa, leerCasa, textoDistancia, type Casa } from "./lugares/casa";
import { BASES, VistaSatelite, type Base } from "./mapa/satelite";
import { CLAVE_WINDY, enlacesEnVivo, webcamsCerca } from "./fuentes/webcams";
import { Lugares, type MiLugar } from "./lugares/store";
import { aviso, descargar, esc, metros } from "./ui/html";
import { distancia, resumir, type Resumen } from "./zona/resumen";

// ---------- Estado ----------
const iniciales = import.meta.glob<unknown>("/data/mis-lugares*.json", { eager: true, import: "default" });
const lugares = new Lugares(undefined, (iniciales["/data/mis-lugares.json"] as MiLugar[]) ?? []);
const perfil = cargarPerfil();
const activasPOI = new Set<string>();
const activasRaster = new Set<string>();
let gustoActivo: Gusto | null = null;
let resultados: LugarOSM[] = [];
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
  ...VISTA_3D,
  zoom: movil ? VISTA_3D.zoom - 0.9 : VISTA_3D.zoom,
  maxPitch: 78,
  // En pantallas densas se limita la resolución: se ve igual y va más fluido.
  pixelRatio: Math.min(devicePixelRatio, movil ? 1.5 : 2),
  attributionControl: { compact: true },
});
// El panel tapa parte del mapa: el "centro" útil se corre para que nada quede debajo.
mapa.setPadding(movil ? { top: 0, left: 0, right: 0, bottom: innerHeight * 0.42 } : { top: 0, left: 410, right: 0, bottom: 0 });

let en3d = true;
function relieve(activo: boolean) {
  try {
    mapa.setTerrain(activo ? { source: "relieve", exaggeration: EXAGERACION } : null);
  } catch {
    /* equipo sin soporte de relieve: el mapa sigue en plano */
  }
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
      "circle-radius": 7,
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
        "circle-radius": 6,
        "circle-color": ["match", ["get", "estado"], "visitado", "#1e8449", "pendiente", "#f39c12", "#8e44ad"],
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#fff",
      },
    },
    "mis-lugares",
  );
  capasInteractivas.push("mis-lugares", "intereses");
  for (const id of ["mis-lugares", "intereses"]) {
    mapa.on("mouseenter", id, () => (mapa.getCanvas().style.cursor = "pointer"));
    mapa.on("mouseleave", id, () => (mapa.getCanvas().style.cursor = ""));
  }
  pintarCapas();
  pintarIntereses();
  pintarLugares();
});

mapa.on("click", (e: MapMouseEvent) => {
  const f = mapa.queryRenderedFeatures(e.point, { layers: capasInteractivas.filter((l) => mapa.getLayer(l)) })[0];
  if (f?.properties?.camara && !modoAgregar && !modoCasa) return camarasUI.abrir(String(f.properties.camara));
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

function abrirTab(t: Tab) {
  const cambia = tabs[t].hidden;
  for (const [k, el] of Object.entries(tabs)) el.hidden = k !== t;
  if (cambia) animar(tabs[t]);
  document.querySelectorAll<HTMLButtonElement>(".pestanas button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === t)));
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
const vivo = iniciarVivo(mapa, document.getElementById("vivo-datos")!, (id) => {
  capasInteractivas.push(id);
  mapa.on("mouseenter", id, () => (mapa.getCanvas().style.cursor = "pointer"));
  mapa.on("mouseleave", id, () => (mapa.getCanvas().style.cursor = ""));
});

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
    tabs.zona.querySelector("[data-guardar]")?.addEventListener("click", () => guardarPunto(lat, lng));
  } catch (e) {
    if (!controlZona.signal.aborted) tabs.zona.innerHTML = `<p class="errores">No pude leer la zona: ${esc(e)}</p>`;
  }
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
  let h = `<p class="nota">Datos oficiales en vivo del servidor de Catastro Bogotá / IDECA.</p>`;
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
  tabs.capas.querySelectorAll<HTMLInputElement>("[data-poi]").forEach((i) => i.addEventListener("change", () => alternarPOI(i.dataset.poi!, i.checked)));
  tabs.capas.querySelectorAll<HTMLInputElement>("[data-raster]").forEach((i) => i.addEventListener("change", () => alternarRaster(i.dataset.raster!, i.checked)));
}

function alternarRaster(id: string, on: boolean) {
  const c = CAPAS_RASTER.find((x) => x.id === id)!;
  if (on) {
    activasRaster.add(id);
    if (!mapa.getSource(id)) mapa.addSource(id, { type: "raster", tiles: [plantillaRaster(c)], tileSize: 256 });
    mapa.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": c.opacidad } }, ANCLA_DATOS);
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
      mapa.addLayer({ id: `${id}-punto`, type: "circle", source: id, filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": c.color, "circle-stroke-width": 1, "circle-stroke-color": "#fff" } }, antes);
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
    for (const s of ["area", "linea", "punto"]) if (mapa.getLayer(`${id}-${s}`)) mapa.setLayoutProperty(`${id}-${s}`, "visibility", "none");
  }
  pintarCapas();
}

const controlesPOI = new Map<string, AbortController>();
async function cargarPOI(c: CapaPOI) {
  if (mapa.getZoom() < c.zoomMin) return;
  controlesPOI.get(c.id)?.abort();
  const ctl = new AbortController();
  controlesPOI.set(c.id, ctl);
  const b = mapa.getBounds();
  try {
    const fc = await geojsonCaja(c.ruta, [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], ctl.signal);
    fc.features.forEach((f) => (f.properties = { ...f.properties, __capa: c.id }));
    (mapa.getSource(c.id) as GeoJSONSource | undefined)?.setData(fc);
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
    h += `<p class="nota">${lista.length} resultados de OpenStreetMap${g.capas?.length ? " + capas oficiales activadas en el mapa" : ""}.</p><ul class="lista">`;
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
  pintarIntereses();
}

let controlIntereses: AbortController | null = null;
async function elegirGusto(id: string) {
  const g = perfil.areas.flatMap((a) => a.gustos).find((x) => x.id === id) ?? null;
  if (gustoActivo?.id === id) {
    gustoActivo = null;
    resultados = [];
    return actualizarIntereses();
  }
  gustoActivo = g;
  resultados = [];
  pintarIntereses();
  if (!g) return;
  for (const c of g.capas ?? []) if (!activasPOI.has(c)) alternarPOI(c, true);
  if (!g.osm?.length) return aviso("Este gusto no tiene etiquetas de OpenStreetMap todavía");
  controlIntereses?.abort();
  controlIntereses = new AbortController();
  const b = mapa.getBounds();
  const caja: Caja = mapa.getZoom() >= 12.5 ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : CAJA_BOGOTA;
  tabs.intereses.insertAdjacentHTML("beforeend", `<p class="cargando" id="buscando">Buscando ${esc(g.nombre)} en OpenStreetMap</p>`);
  try {
    resultados = await buscar(g.osm, caja, controlIntereses.signal);
    actualizarIntereses();
    if (!resultados.length) aviso("Sin resultados en esta zona; aleja el mapa para buscar en toda Bogotá");
  } catch (e) {
    if (!controlIntereses.signal.aborted) {
      document.getElementById("buscando")?.remove();
      aviso("OpenStreetMap no respondió, intenta de nuevo");
    }
  }
}

// ---------- Mis lugares ----------
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
  pintarLugares();
  if (gustoActivo) actualizarIntereses();
});

pintarCapas();
pintarIntereses();
pintarLugares();
