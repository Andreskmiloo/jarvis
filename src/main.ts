import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { type GeoJSONSource, type LngLatLike, type MapMouseEvent, type StyleSpecification } from "maplibre-gl";
import { CAPAS_POI, CAPAS_RASTER, plantillaRaster, type Atributos, type CapaPOI } from "./config/capas";
import { geojsonCaja } from "./fuentes/arcgis";
import { buscarDireccion } from "./fuentes/nominatim";
import { categoriaAire, describirClima } from "./fuentes/openmeteo";
import { buscar, CAJA_BOGOTA, type Caja, type LugarOSM } from "./fuentes/overpass";
import { cargarPerfil, type Gusto } from "./intereses/perfil";
import { Lugares, type MiLugar } from "./lugares/store";
import { aviso, descargar, esc, metros } from "./ui/html";
import { distancia, resumir, type Resumen } from "./zona/resumen";

// ---------- Estado ----------
const BOGOTA: LngLatLike = [-74.0817, 4.6482];
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
let ultimoPunto: { lat: number; lng: number } | null = null;
let controlZona: AbortController | null = null;

// ---------- Mapa ----------
maplibregl.setWorkerUrl(workerUrl);
// Base de OpenStreetMap: sin clave y con cobertura mundial.
const oscuro = matchMedia("(prefers-color-scheme: dark)").matches;
const estilo: StyleSpecification = {
  version: 8,
  sources: {
    base: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap · Datos: Catastro Bogotá/IDECA, Open-Meteo",
    },
  },
  layers: [
    {
      id: "base",
      type: "raster",
      source: "base",
      paint: oscuro
        ? { "raster-saturation": -0.6, "raster-brightness-max": 0.55, "raster-contrast": 0.15 }
        : { "raster-saturation": -0.45 },
    },
  ],
};

const mapa = new maplibregl.Map({
  container: "mapa",
  style: estilo,
  center: BOGOTA,
  zoom: 11.3,
  attributionControl: { compact: true },
});
mapa.addControl(new maplibregl.NavigationControl(), "top-right");
mapa.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), "top-right");

const marcador = new maplibregl.Marker({ color: "#0b7a75" });
const capasInteractivas: string[] = [];

mapa.on("load", () => {
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
  if (f && !modoAgregar) return popupDe(f, e.lngLat);
  const { lat, lng } = e.lngLat;
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
  intereses: document.getElementById("tab-intereses")!,
  lugares: document.getElementById("tab-lugares")!,
  capas: document.getElementById("tab-capas")!,
};
type Tab = keyof typeof tabs;

function abrirTab(t: Tab) {
  for (const [k, el] of Object.entries(tabs)) el.hidden = k !== t;
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
    mapa.flyTo({ center: [r.lng, r.lat], zoom: 16 });
    leerZona(r.lat, r.lng);
  } catch {
    aviso("La búsqueda falló, intenta de nuevo");
  }
});

// ---------- Zona ----------
async function leerZona(lat: number, lng: number) {
  ultimoPunto = { lat, lng };
  marcador.setLngLat([lng, lat]).addTo(mapa);
  abrirTab("zona");
  controlZona?.abort();
  controlZona = new AbortController();
  tabs.zona.innerHTML = `<p class="cargando">Leyendo la zona (${lat.toFixed(5)}, ${lng.toFixed(5)})</p>`;
  try {
    const r = await resumir(lat, lng, 500, controlZona.signal);
    if (controlZona.signal.aborted) return;
    tabs.zona.innerHTML = htmlZona(r);
    tabs.zona.querySelector("[data-guardar]")?.addEventListener("click", () => guardarPunto(lat, lng));
  } catch (e) {
    if (!controlZona.signal.aborted) tabs.zona.innerHTML = `<p class="errores">No pude leer la zona: ${esc(e)}</p>`;
  }
}

function htmlZona(r: Resumen): string {
  const partes: string[] = [];
  partes.push(`<h2>📍 ${esc(r.zona.find((d) => d.etiqueta === "Barrio")?.valor ?? "Zona")}</h2>`);
  partes.push(
    r.zona.length
      ? `<dl class="datos">${r.zona.map((d) => `<dt>${esc(d.etiqueta)}</dt><dd>${esc(d.valor)}</dd>`).join("")}</dl>`
      : `<p class="vacio">Fuera de las capas de Bogotá.</p>`,
  );

  const t: string[] = [];
  if (r.clima) {
    t.push(`<div class="tarjeta"><b>${Math.round(r.clima.temperatura)}°</b><span>${esc(describirClima(r.clima.codigo))} · sens. ${Math.round(r.clima.sensacion)}°</span></div>`);
    t.push(`<div class="tarjeta"><b>${r.clima.probLluviaProx3h}%</b><span>lluvia próx. 3 h</span></div>`);
    t.push(`<div class="tarjeta"><b>${r.clima.humedad}%</b><span>humedad · viento ${Math.round(r.clima.viento)} km/h</span></div>`);
  }
  if (r.aire) {
    const c = categoriaAire(r.aire.indiceUS);
    t.push(`<div class="tarjeta" style="box-shadow: inset 4px 0 0 ${c.color}"><b>${r.aire.indiceUS}</b><span>aire: ${esc(c.texto)} · PM2.5 ${r.aire.pm25}</span></div>`);
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
  partes.push(`<h3>Ver la calle</h3><div class="acciones">
    <a class="boton sec peq" target="_blank" rel="noopener" href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}">Street View</a>
    <a class="boton sec peq" target="_blank" rel="noopener" href="https://www.mapillary.com/app/?lat=${r.lat}&lng=${r.lng}&z=17">Mapillary</a>
    <a class="boton sec peq" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${ll}">Google Maps</a>
  </div>
  <p class="nota">Bogotá no publica video en vivo de sus cámaras (C4/CEM son internas); estas son fotos públicas a nivel de calle.</p>`);
  partes.push(`<div class="acciones"><button class="boton" data-guardar>★ Guardar como mi lugar</button></div>`);
  if (r.errores.length) partes.push(`<p class="errores">Sin respuesta: ${r.errores.map(esc).join(" · ")}</p>`);
  return partes.join("");
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
    mapa.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": c.opacidad } }, primeraCapaVectorial());
  } else {
    activasRaster.delete(id);
    if (mapa.getLayer(id)) mapa.removeLayer(id);
  }
}

function primeraCapaVectorial(): string | undefined {
  return mapa.getStyle().layers.find((l) => l.type !== "raster")?.id;
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
  if (f.layer.id === "mis-lugares" || f.layer.id === "intereses") {
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
  for (const l of lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))) {
    h += `<li><div class="fila"><button class="enlace" data-ver="${l.id}">${esc(l.nombre)}</button><span class="sub">${esc(l.categoria)}</span></div>
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
      mapa.flyTo({ center: [l.lng, l.lat], zoom: 16 });
      leerZona(l.lat, l.lng);
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
