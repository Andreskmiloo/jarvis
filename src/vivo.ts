// Pestaña "Vivo": datos en tiempo real y zonas de calor animadas.
import type { GeoJSONSource, Map as Mapa } from "maplibre-gl";
import { Calor, VELOCIDADES } from "./calor/calor";
import { cargarLocalidades } from "./calor/cupulas";
import { cargarMalla, serieSiniestros, type Serie } from "./calor/series";
import { camaras, fechaLocal, hace, radar, semaforos, siniestrosRecientes, sismos, type Camara, type EstadoSemaforos, type Siniestro, type Sismo } from "./fuentes/envivo";
import { animar } from "./ui/anim";
import { aviso, esc } from "./ui/html";
import { distancia } from "./zona/resumen";

type Modo = "siniestros" | "pm2_5" | "precipitation" | "radar";
const MODOS: { id: Modo; nombre: string }[] = [
  { id: "siniestros", nombre: "Siniestros 30 días" },
  { id: "pm2_5", nombre: "Aire PM2.5" },
  { id: "precipitation", nombre: "Lluvia prevista" },
  { id: "radar", nombre: "Radar de lluvia" },
];
const REFRESCO_MS = 60_000;

export interface Vivo {
  cercaDe(lat: number, lng: number, radio: number): { fallas: number; camaras: Camara[] };
}

export function iniciarVivo(mapa: Mapa, cont: HTMLElement, registrarCapa: (id: string) => void): Vivo {
  let sem: EstadoSemaforos | null = null;
  let cams: Camara[] = [];
  let sis: Sismo[] = [];
  let sin: Siniestro[] = [];
  let actualizado = 0;
  let errorSem = "";
  const visibles = { fallas: true, camaras: false, sismos: false };
  let modo: Modo | null = null;
  let notaModo = "";
  let cargandoModo = false;
  let forma: "cupulas" | "manta" = "cupulas";
  let serieActual: Serie | null = null;
  const calor = new Calor(mapa, "vivo-camaras");

  const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });
  const punto = (lng: number, lat: number, properties: Record<string, unknown>): GeoJSON.Feature => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [lng, lat] },
    properties,
  });

  // ---------- Capas ----------
  function crearCapas() {
    for (const id of ["vivo-camaras", "vivo-sismos", "vivo-fallas"]) mapa.addSource(id, { type: "geojson", data: fc([]) });
    const antes = mapa.getLayer("intereses") ? "intereses" : undefined;
    mapa.addLayer(
      {
        id: "vivo-camaras",
        type: "circle",
        source: "vivo-camaras",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": 4.5,
          "circle-color": ["case", ["get", "opera"], "#00e5ff", "#5f6f66"],
          "circle-stroke-width": 1,
          "circle-stroke-color": "#001a0a",
        },
      },
      antes,
    );
    mapa.addLayer(
      {
        id: "vivo-sismos",
        type: "circle",
        source: "vivo-sismos",
        layout: { visibility: "none" },
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "mag"], 2, 5, 6, 26],
          "circle-color": "rgba(255,170,0,0.25)",
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffaa00",
        },
      },
      antes,
    );
    mapa.addLayer(
      {
        id: "vivo-fallas-pulso",
        type: "circle",
        source: "vivo-fallas",
        paint: { "circle-radius": 8, "circle-color": "#ff2a4f", "circle-opacity": 0.4 },
      },
      antes,
    );
    mapa.addLayer(
      {
        id: "vivo-fallas",
        type: "circle",
        source: "vivo-fallas",
        paint: { "circle-radius": 5, "circle-color": "#ff2a4f", "circle-stroke-width": 1.5, "circle-stroke-color": "#fff" },
      },
      antes,
    );
    ["vivo-camaras", "vivo-sismos", "vivo-fallas"].forEach(registrarCapa);
    pulsar();
    volcar();
  }

  // Pulso de los semáforos en falla: llama la atención sin ocultar el punto.
  function pulsar() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let ultimo = 0;
    const paso = (t: number) => {
      requestAnimationFrame(paso);
      if (t - ultimo < 60 || document.hidden || !visibles.fallas || !sem?.fallas.length || !mapa.getLayer("vivo-fallas-pulso")) return;
      ultimo = t;
      const k = (t % 1400) / 1400;
      mapa.setPaintProperty("vivo-fallas-pulso", "circle-radius", 6 + 18 * k);
      mapa.setPaintProperty("vivo-fallas-pulso", "circle-opacity", 0.55 * (1 - k));
    };
    requestAnimationFrame(paso);
  }

  function volcar() {
    if (!mapa.getSource("vivo-fallas")) return;
    (mapa.getSource("vivo-fallas") as GeoJSONSource).setData(
      fc((sem?.fallas ?? []).map((f) => punto(f.lng, f.lat, { nombre: `Semáforo ${f.estado.toLowerCase()}`, sub: `${f.direccion} · ${f.localidad}${f.tiempo && f.tiempo !== "0:00:00" ? ` · lleva ${f.tiempo}` : ""}` }))),
    );
    (mapa.getSource("vivo-camaras") as GeoJSONSource).setData(
      fc(cams.map((c) => punto(c.lng, c.lat, { nombre: c.tipo, sub: `${c.direccion} · ${c.estado}${c.detalle ? ` · ${c.detalle}` : ""} · sin video público`, opera: /OPERA|ACTIV/i.test(c.estado) }))),
    );
    (mapa.getSource("vivo-sismos") as GeoJSONSource).setData(
      fc(sis.map((s) => punto(s.lng, s.lat, { nombre: `Sismo M${s.magnitud.toFixed(1)}`, sub: `${s.lugar} · ${hace(s.fecha)} · ${Math.round(s.profundidad)} km de profundidad`, mag: s.magnitud }))),
    );
    mapa.setLayoutProperty("vivo-fallas", "visibility", visibles.fallas ? "visible" : "none");
    mapa.setLayoutProperty("vivo-fallas-pulso", "visibility", visibles.fallas ? "visible" : "none");
    mapa.setLayoutProperty("vivo-camaras", "visibility", visibles.camaras ? "visible" : "none");
    mapa.setLayoutProperty("vivo-sismos", "visibility", visibles.sismos ? "visible" : "none");
  }

  // ---------- Datos ----------
  async function refrescarSemaforos(animado = false) {
    try {
      sem = await semaforos();
      actualizado = Date.now();
      errorSem = "";
    } catch (e) {
      errorSem = e instanceof Error ? e.message : String(e);
    }
    volcar();
    pintar(animado);
  }

  async function cargarFijos() {
    const [c, s, a] = await Promise.allSettled([camaras(), sismos(), siniestrosRecientes()]);
    if (c.status === "fulfilled") cams = c.value;
    if (s.status === "fulfilled") sis = s.value;
    if (a.status === "fulfilled") sin = a.value;
    volcar();
    pintar(true);
  }

  // ---------- Calor ----------
  calor.alCuadro = (etiqueta, i, total) => {
    const e = cont.querySelector<HTMLElement>("#calor-hora");
    const r = cont.querySelector<HTMLInputElement>("#calor-rango");
    if (e) e.textContent = etiqueta;
    if (r && document.activeElement !== r) {
      r.max = String(total - 1);
      r.value = String(i);
    }
  };

  async function dibujar() {
    if (!serieActual) return;
    // Si las localidades no cargan, se cae a la manta continua en vez de fallar.
    const locs = forma === "cupulas" ? await cargarLocalidades().catch(() => []) : [];
    calor.mostrar(serieActual, locs);
  }

  async function elegirModo(m: Modo) {
    if (modo === m) {
      modo = null;
      calor.ocultar();
      return pintar();
    }
    modo = m;
    cargandoModo = true;
    notaModo = "";
    calor.ocultar();
    pintar();
    try {
      if (m === "radar") {
        const cuadros = await radar();
        if (modo !== m) return;
        if (!cuadros.length) throw new Error("RainViewer no devolvió cuadros");
        calor.mostrarRadar(cuadros);
        notaModo = "Radar real de las últimas 2 horas (RainViewer). La cobertura de radar sobre Bogotá depende del IDEAM; si no ves ecos, no hay lluvia detectada o no hay cobertura.";
      } else {
        if (m === "siniestros" && !sin.length) sin = await siniestrosRecientes();
        const serie: Serie = m === "siniestros" ? serieSiniestros(sin) : await cargarMalla(m);
        if (modo !== m) return;
        serieActual = serie;
        await dibujar();
        notaModo = serie.nota;
      }
    } catch (e) {
      if (modo !== m) return;
      modo = null;
      aviso(`No pude cargar ${MODOS.find((x) => x.id === m)!.nombre}: ${e instanceof Error ? e.message : e}`, 4000);
    }
    cargandoModo = false;
    pintar();
  }

  // ---------- Panel ----------
  function pintar(animado = false) {
    const fallas = sem?.fallas ?? [];
    let h = `<div class="fila"><h2><span class="vivo-punto"></span> En vivo</h2><button class="boton sec peq" data-refrescar>↻ ${actualizado ? esc(hace(actualizado)) : "cargando"}</button></div>`;
    h += `<div class="tarjetas">
      <div class="tarjeta ${fallas.length ? "alerta" : ""}"><b data-contar="${fallas.length}">${fallas.length}</b><span>semáforos en falla</span></div>
      <div class="tarjeta"><b data-contar="${sem?.enServicio ?? 0}">${sem?.enServicio ?? "—"}</b><span>de ${sem?.total ?? "—"} en servicio</span></div>
      <div class="tarjeta"><b data-contar="${cams.length}">${cams.length || "—"}</b><span>cámaras ubicadas</span></div>
      <div class="tarjeta"><b data-contar="${sin.length}">${sin.length || "—"}</b><span>siniestros en 30 días</span></div>
      <div class="tarjeta"><b data-contar="${sis.length}">${sis.length}</b><span>sismos 30 d · 400 km</span></div>
    </div>`;
    if (errorSem) h += `<p class="errores">Semáforos: ${esc(errorSem)}</p>`;
    h += `<label class="capa"><input type="checkbox" data-ver="fallas" ${visibles.fallas ? "checked" : ""}/><i style="background:#ff2a4f"></i>Semáforos en falla<small>Sec. Movilidad · 60 s</small></label>
      <label class="capa"><input type="checkbox" data-ver="camaras" ${visibles.camaras ? "checked" : ""}/><i style="background:#00e5ff"></i>Cámaras de tráfico y fotodetección<small>ubicación</small></label>
      <label class="capa"><input type="checkbox" data-ver="sismos" ${visibles.sismos ? "checked" : ""}/><i style="background:#ffaa00"></i>Sismos recientes<small>USGS</small></label>`;
    if (fallas.length) {
      h += `<ul class="lista">${fallas
        .slice(0, 12)
        .map((f, i) => `<li><div class="fila"><button class="enlace" data-falla="${i}">${esc(f.direccion)}</button><span class="etiqueta no">${esc(f.estado.toLowerCase())}</span></div><div class="sub">${esc(f.localidad)}${f.tiempo && f.tiempo !== "0:00:00" ? ` · lleva ${esc(f.tiempo)}` : ""}</div></li>`)
        .join("")}</ul>`;
    }

    h += `<h2>Zonas de calor</h2><div class="chips">${MODOS.map((m) => `<button class="chip" data-modo="${m.id}" aria-pressed="${modo === m.id}">${esc(m.nombre)}</button>`).join("")}</div>`;
    if (cargandoModo) h += `<p class="cargando">Cargando datos</p>`;
    else if (modo) {
      if (modo !== "radar")
        h += `<div class="chips" style="margin-top:8px"><button class="chip" data-forma="cupulas" aria-pressed="${forma === "cupulas"}">Cúpulas por localidad</button><button class="chip" data-forma="manta" aria-pressed="${forma === "manta"}">Manta continua</button></div>`;
      h += `<div class="tiempo"><button class="boton peq" id="calor-play" aria-label="Reproducir o pausar">${calor.reproduciendo ? "❚❚" : "▶"}</button>
        <input type="range" id="calor-rango" min="0" max="${Math.max(0, calor.total - 1)}" value="${Math.floor(calor.cuadro)}" aria-label="Hora" />
        <output id="calor-hora"></output>
        <button class="boton sec peq" id="calor-vel" title="Velocidad del lapso de tiempo">×${calor.velocidad}</button></div>
        <div class="rampa"><span>menos</span><i></i><span>más</span></div>
        <p class="nota">${esc(notaModo)}</p>`;
    }
    if (sin.length) {
      h += `<h3>Últimos siniestros reportados</h3><ul class="lista">${sin
        .slice(0, 8)
        .map((x, i) => `<li><div class="fila"><button class="enlace" data-sin="${i}">${esc(x.direccion)}</button><span class="etiqueta ${/MUERT|HERID/i.test(x.gravedad) ? "no" : ""}">${esc(x.gravedad.toLowerCase())}</span></div><div class="sub">${esc(fechaLocal(x.fecha))} · ${String(x.hora).padStart(2, "0")}:00 · ${esc(x.clase.toLowerCase())} · ${esc(x.localidad)}</div></li>`)
        .join("")}</ul>`;
    }
    h += `<h3>Sobre las cámaras</h3><p class="nota">Bogotá no publica el video de sus cámaras: el mapa muestra dónde están y si operan. Para ver una calle usa Street View o Mapillary desde la ficha de zona.</p>`;
    cont.innerHTML = h;
    if (animado) animar(cont);

    cont.querySelector("[data-refrescar]")?.addEventListener("click", () => refrescarSemaforos(true));
    cont.querySelectorAll<HTMLInputElement>("[data-ver]").forEach((i) =>
      i.addEventListener("change", () => {
        visibles[i.dataset.ver as keyof typeof visibles] = i.checked;
        volcar();
      }),
    );
    cont.querySelectorAll<HTMLButtonElement>("[data-falla]").forEach((b) =>
      b.addEventListener("click", () => {
        const f = fallas[Number(b.dataset.falla)];
        mapa.flyTo({ center: [f.lng, f.lat], zoom: 16, duration: 900 });
      }),
    );
    cont.querySelectorAll<HTMLButtonElement>("[data-sin]").forEach((b) =>
      b.addEventListener("click", () => {
        const x = sin[Number(b.dataset.sin)];
        mapa.flyTo({ center: [x.lng, x.lat], zoom: 16, duration: 900 });
      }),
    );
    cont.querySelectorAll<HTMLButtonElement>("[data-modo]").forEach((b) => b.addEventListener("click", () => elegirModo(b.dataset.modo as Modo)));
    cont.querySelector("#calor-play")?.addEventListener("click", (e) => {
      calor.alternar();
      (e.currentTarget as HTMLElement).textContent = calor.reproduciendo ? "❚❚" : "▶";
    });
    cont.querySelectorAll<HTMLButtonElement>("[data-forma]").forEach((b) =>
      b.addEventListener("click", async () => {
        forma = b.dataset.forma as typeof forma;
        const cuadro = calor.cuadro;
        await dibujar();
        calor.cuadro = cuadro;
        pintar();
      }),
    );
    cont.querySelector("#calor-vel")?.addEventListener("click", (e) => {
      calor.velocidad = VELOCIDADES[(VELOCIDADES.indexOf(calor.velocidad as (typeof VELOCIDADES)[number]) + 1) % VELOCIDADES.length];
      (e.currentTarget as HTMLElement).textContent = `×${calor.velocidad}`;
    });
    cont.querySelector<HTMLInputElement>("#calor-rango")?.addEventListener("input", (e) => {
      if (calor.reproduciendo) {
        calor.alternar();
        cont.querySelector("#calor-play")!.textContent = "▶";
      }
      calor.irA(Number((e.target as HTMLInputElement).value));
    });
    if (modo && !cargandoModo) calor.irA(calor.cuadro);
  }

  if (mapa.loaded()) crearCapas();
  else mapa.once("load", crearCapas);
  pintar();
  refrescarSemaforos(true);
  cargarFijos();
  setInterval(() => !document.hidden && refrescarSemaforos(), REFRESCO_MS);

  return {
    cercaDe(lat, lng, radio) {
      return {
        fallas: (sem?.fallas ?? []).filter((f) => distancia(lat, lng, f.lat, f.lng) <= radio).length,
        camaras: cams.filter((c) => distancia(lat, lng, c.lat, c.lng) <= radio),
      };
    },
  };
}
