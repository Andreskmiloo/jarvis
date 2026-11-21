// "Planeta": lo que pasa encima y alrededor de Bogotá, visto desde el globo.
// Satélites con su órbita, día y noche, incendios de Colombia, eventos naturales de la
// NASA, clima espacial y noticias. Todo se mide contra tu casa (o el centro de Bogotá).
import type { GeoJSONSource, Map as Mapa, MapLayerMouseEvent } from "maplibre-gl";
import { claveImagen } from "../mapa/pines";
import { puedeAnimar } from "../mapa/ritmo";
import { leerCasa } from "../lugares/casa";
import { esc } from "../ui/html";
import { distancia } from "../zona/resumen";
import { hace } from "../fuentes/envivo";
import { climaEspacial, eventosNaturales, incendios, noticias, satelitesGuardados, type EventoNatural, type Foco, type Kp, type Noticia } from "../fuentes/planeta";
import { clasificar, encima, posicion, proximoPaso, trayectoria, type Paso, type Tle } from "./orbitas";
import { poligonoNoche } from "./terminador";

const BOGOTA = { lat: 4.65, lng: -74.08 };
type Capa = "satelites" | "noche" | "incendios" | "eventos";

export interface Planeta {
  alternar(c: Capa, on?: boolean): void;
  activo(c: Capa): boolean;
  /** Para el asistente y la ficha de zona. */
  resumen(lat: number, lng: number): Promise<string[]>;
  noticiasDe(tema: string): Promise<Noticia[]>;
  /** Incendio y evento natural más cercanos a un punto (km), para alertas y puntaje. */
  cercanos(lat: number, lng: number): { incendio?: { lat: number; lng: number; km: number; texto: string }; evento?: { lat: number; lng: number; km: number; texto: string } };
  /** Se resuelve cuando la primera carga de datos terminó. */
  listo: Promise<void>;
}

export function iniciarPlaneta(mapa: Mapa, cont: HTMLElement, registrar: (id: string) => void, caerEn: (lat: number, lng: number, zoom?: number) => void): Planeta {
  const on: Record<Capa, boolean> = { satelites: true, noche: true, incendios: true, eventos: true };
  let tles: Tle[] = [];
  let focos: Foco[] = [];
  let generadoFocos = "";
  let eventos: EventoNatural[] = [];
  let kp: Kp | null = null;
  let errores: string[] = [];
  let elegido: Tle | null = null;
  let pasoIss: Paso | null = null;
  let noticiasBogota: Noticia[] | null = null;
  let errorNoticias = "";
  const ref = () => leerCasa() ?? BOGOTA;
  const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features });

  // ---------- capas del mapa ----------
  function crear() {
    const antes = mapa.getLayer("pines-sombra") ? "pines-sombra" : undefined;
    for (const id of ["noche", "orbita", "satelites", "incendios", "eventos"]) mapa.addSource(id, { type: "geojson", data: fc([]) });
    mapa.addLayer({ id: "noche", type: "fill", source: "noche", paint: { "fill-color": "#000814", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 5, 0.42, 7.5, 0] } }, antes);
    mapa.addLayer({ id: "noche-borde", type: "line", source: "noche", maxzoom: 7.5, paint: { "line-color": "#ffcf6e", "line-opacity": 0.35, "line-width": 1.2, "line-blur": 2 } }, antes);
    mapa.addLayer({
      id: "incendios",
      type: "circle",
      source: "incendios",
      paint: {
        "circle-color": ["interpolate", ["linear"], ["get", "frp"], 0, "#ffb300", 20, "#ff6d00", 80, "#d50000"],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 3, 1.6, 8, 4, 13, 7],
        "circle-blur": 0.4,
        "circle-opacity": 0.85,
        "circle-stroke-color": "#fff3",
        "circle-stroke-width": 0.5,
      },
    }, antes);
    mapa.addLayer({ id: "orbita", type: "line", source: "orbita", maxzoom: 9, paint: { "line-color": ["get", "color"], "line-width": 1.6, "line-opacity": 0.8, "line-dasharray": [2, 1.5] } });
    for (const id of ["eventos", "satelites"])
      mapa.addLayer({
        id,
        type: "symbol",
        source: id,
        maxzoom: id === "satelites" ? 9 : 24,
        layout: {
          "icon-image": ["get", "__img"],
          "icon-size": ["interpolate", ["linear"], ["zoom"], 1, id === "satelites" ? 0.26 : 0.32, 6, 0.42, 10, 0.55],
          "icon-anchor": "bottom",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "symbol-sort-key": ["get", "__orden"],
        },
      });
    for (const id of ["satelites", "eventos", "incendios"]) {
      registrar(id);
      mapa.on("click", id, (e: MapLayerMouseEvent) => {
        const n = e.features?.[0]?.properties?.norad;
        if (id === "satelites" && n) elegir(tles.find((t) => t.l1.slice(2, 7) === n) ?? null);
      });
    }
    listo = true;
    pintarTodo();
  }
  let listo = false;
  if (mapa.loaded()) crear();
  else mapa.once("load", crear);

  const vis = (id: string, v: boolean) => mapa.getLayer(id) && mapa.setLayoutProperty(id, "visibility", v ? "visible" : "none");

  function pintarNoche() {
    if (!listo) return;
    (mapa.getSource("noche") as GeoJSONSource).setData(on.noche ? fc([poligonoNoche(new Date())]) : fc([]));
  }

  function pintarIncendios() {
    if (!listo) return;
    (mapa.getSource("incendios") as GeoJSONSource).setData(
      fc(
        on.incendios
          ? focos.map((f) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [f.lng, f.lat] },
              properties: { frp: f.frp, nombre: `🔥 Foco de calor · ${f.frp.toFixed(1)} MW`, sub: `${f.satelite} · ${hace(Date.parse(f.cuando))} · confianza ${f.confianza} · NASA FIRMS` },
            }))
          : [],
      ),
    );
  }

  function pintarEventos() {
    if (!listo) return;
    (mapa.getSource("eventos") as GeoJSONSource).setData(
      fc(
        on.eventos
          ? eventos.map((e) => ({
              type: "Feature",
              geometry: { type: "Point", coordinates: [e.lng, e.lat] },
              properties: { __img: claveImagen(e.icono, "#ff7043"), __orden: -e.lat, nombre: `${e.icono} ${e.titulo}`, sub: `${e.categoria}${e.magnitud ? ` · ${e.magnitud}` : ""} · ${hace(Date.parse(e.fecha))} · NASA EONET` },
            }))
          : [],
      ),
    );
  }

  function pintarSatelites() {
    if (!listo) return;
    if (!on.satelites) return (mapa.getSource("satelites") as GeoJSONSource).setData(fc([]));
    const ahora = new Date();
    const feats: GeoJSON.Feature[] = [];
    for (const t of tles) {
      const p = posicion(t, ahora);
      if (!p) continue;
      const m = clasificar(t.nombre);
      // Lo lejano (geoestacionarios, GNSS) solo si es el elegido: si no, el globo se llena.
      if (p.altKm > 3000 && t !== elegido) continue;
      feats.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: { __img: claveImagen(m.icono, m.color), __orden: t === elegido ? 1e6 : -p.altKm, norad: t.l1.slice(2, 7), nombre: `${m.icono} ${t.nombre}`, sub: `${m.mision} · ${Math.round(p.altKm)} km de altura · toca para ver su órbita` },
      });
    }
    (mapa.getSource("satelites") as GeoJSONSource).setData(fc(feats));
  }

  function pintarOrbita() {
    if (!listo) return;
    const m = elegido ? clasificar(elegido.nombre) : null;
    (mapa.getSource("orbita") as GeoJSONSource).setData(
      fc(elegido ? trayectoria(elegido).map((tramo) => ({ type: "Feature", geometry: { type: "LineString", coordinates: tramo }, properties: { color: m!.color } })) : []),
    );
  }

  function pintarTodo() {
    pintarNoche();
    pintarIncendios();
    pintarEventos();
    pintarSatelites();
    pintarOrbita();
    for (const c of Object.keys(on) as Capa[]) for (const id of capasDe(c)) vis(id, on[c]);
  }
  const capasDe = (c: Capa) => (c === "noche" ? ["noche", "noche-borde"] : c === "satelites" ? ["satelites", "orbita"] : [c]);

  function elegir(t: Tle | null) {
    elegido = t;
    pintarOrbita();
    pintarSatelites();
    panel();
  }

  // ---------- datos ----------
  async function cargar() {
    errores = [];
    await Promise.all([
      satelitesGuardados()
        .then((l) => {
          tles = l;
          const iss = l.find((t) => t.nombre.startsWith("ISS (ZARYA)"));
          const r = ref();
          if (iss) pasoIss = proximoPaso(iss, r.lat, r.lng);
        })
        .catch((e) => errores.push(`Satélites: ${e.message}`)),
      incendios()
        .then((d) => {
          focos = d.focos;
          generadoFocos = d.generado;
        })
        .catch((e) => errores.push(`Incendios: ${e.message}`)),
      eventosNaturales()
        .then((e) => (eventos = e))
        .catch((e) => errores.push(`Eventos NASA: ${e.message}`)),
      climaEspacial()
        .then((k) => (kp = k))
        .catch((e) => errores.push(`Clima espacial: ${e.message}`)),
    ]);
    pintarTodo();
    panel();
  }
  const primera = cargar();
  // Satélites se mueven ~7 km/s: cada 2 s, solo si se ven (zoom bajo) y el mapa está quieto.
  setInterval(() => on.satelites && tles.length && mapa.getZoom() < 9 && puedeAnimar() && pintarSatelites(), 2000);
  setInterval(() => pintarNoche(), 60_000);
  setInterval(() => !document.hidden && cargar(), 30 * 60_000);

  // ---------- panel ----------
  const hora = (d: Date) => d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  const dia = (d: Date) => (d.toDateString() === new Date().toDateString() ? "hoy" : d.toLocaleDateString("es-CO", { weekday: "long" }));

  function panel() {
    const r = ref();
    const donde = leerCasa() ? "tu casa" : "Bogotá";
    const sobre = tles.length ? encima(tles, r.lat, r.lng) : [];
    const cerca = focos
      .map((f) => ({ f, d: distancia(r.lat, r.lng, f.lat, f.lng) }))
      .sort((a, b) => a.d - b.d);
    const enColombia = eventos.filter((e) => e.lng > -80 && e.lng < -66 && e.lat > -5 && e.lat < 14);
    let h = `<h2>Planeta</h2><div class="chips">${(
      [
        ["satelites", "🛰 Satélites"],
        ["noche", "🌗 Día y noche"],
        ["incendios", "🔥 Incendios"],
        ["eventos", "🌋 Eventos NASA"],
      ] as [Capa, string][]
    )
      .map(([c, n]) => `<button class="chip" data-planeta="${c}" aria-pressed="${on[c]}">${n}</button>`)
      .join("")}</div>
    <p class="nota">Aléjate con 🌍 para ver el planeta completo: satélites en órbita, la línea del día y la noche, y eventos.</p>
    <div class="tarjetas">
      <div class="tarjeta"><b>${sobre.length}</b><span>satélites sobre ${donde} ahora</span></div>
      <div class="tarjeta"><b>${focos.length}</b><span>focos de incendio en Colombia (24 h)</span></div>
      <div class="tarjeta"><b>${kp ? kp.kp : "–"}</b><span>Kp · ${kp ? esc(kp.nivel) : "clima espacial"}</span></div>
    </div><dl class="datos">`;
    if (pasoIss)
      h += `<dt>Estación Espacial (EEI)</dt><dd>pasa sobre ${donde} ${dia(pasoIss.inicio)} ${hora(pasoIss.inicio)}–${hora(pasoIss.fin)} · ${pasoIss.elevacionMax}° de altura${pasoIss.elevacionMax >= 40 ? " · buen paso" : ""}</dd>`;
    if (sobre.length)
      h += `<dt>Encima ahora</dt><dd>${sobre
        .slice(0, 4)
        .map((s) => `<button class="enlace" data-sat="${s.tle.l1.slice(2, 7)}">${esc(s.tle.nombre)}</button> ${s.elevacion}°`)
        .join(" · ")}</dd>`;
    if (cerca[0]) h += `<dt>Incendio más cercano</dt><dd><button class="enlace" data-foco="0">a ${(cerca[0].d / 1000).toFixed(0)} km</button> · ${cerca[0].f.frp.toFixed(1)} MW · ${hace(Date.parse(cerca[0].f.cuando))}</dd>`;
    h += `<dt>Eventos naturales abiertos</dt><dd>${eventos.length} en el mundo · ${enColombia.length} en Colombia</dd></dl>`;
    if (elegido) {
      const m = clasificar(elegido.nombre);
      const p = posicion(elegido);
      const paso = proximoPaso(elegido, r.lat, r.lng);
      h += `<div class="tarjeta-sat"><b>${m.icono} ${esc(elegido.nombre)}</b><span>${esc(m.mision)}${p ? ` · ${Math.round(p.altKm)} km · ${p.lat.toFixed(1)}°, ${p.lng.toFixed(1)}°` : ""}</span>
        <span>${paso?.siempre ? `Siempre visible desde ${donde} (${paso.elevacionMax}° sobre el horizonte)` : paso ? `Próximo paso sobre ${donde}: ${dia(paso.inicio)} ${hora(paso.inicio)} · ${paso.elevacionMax}°` : `No pasa sobre ${donde} en las próximas 24 h`}</span>
        <button class="boton sec peq" data-sat-cerrar>Quitar órbita</button></div>`;
    }
    h += `<h3>Noticias de Bogotá (24 h)</h3>`;
    if (noticiasBogota === null) h += `<button class="boton sec peq" data-noticias>Cargar noticias</button>${errorNoticias ? `<p class="errores">${esc(errorNoticias)}</p>` : ""}`;
    else if (!noticiasBogota.length) h += `<p class="nota">Sin noticias nuevas en GDELT.</p>`;
    else
      h += `<ul class="lista">${noticiasBogota
        .slice(0, 8)
        .map((n) => `<li><a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.titulo)}</a><div class="sub">${esc(n.medio)} · ${hace(n.fecha.getTime())}</div></li>`)
        .join("")}</ul>`;
    h += `<p class="nota">Fuentes: CelesTrak (órbitas SGP4), NASA FIRMS ${generadoFocos ? `(actualizado ${hace(Date.parse(generadoFocos))})` : ""}, NASA EONET, NOAA SWPC, GDELT.</p>`;
    if (errores.length) h += `<p class="errores">${errores.map(esc).join(" · ")}</p>`;
    cont.innerHTML = h;
    cont.querySelectorAll<HTMLButtonElement>("[data-planeta]").forEach((b) => b.addEventListener("click", () => api.alternar(b.dataset.planeta as Capa)));
    cont.querySelectorAll<HTMLButtonElement>("[data-sat]").forEach((b) =>
      b.addEventListener("click", () => {
        const t = tles.find((x) => x.l1.slice(2, 7) === b.dataset.sat) ?? null;
        elegir(t);
        const p = t && posicion(t);
        if (p) mapa.flyTo({ center: [p.lng, p.lat], zoom: 2.4, pitch: 0, duration: 2600 });
      }),
    );
    cont.querySelector("[data-sat-cerrar]")?.addEventListener("click", () => elegir(null));
    cont.querySelector("[data-foco]")?.addEventListener("click", () => cerca[0] && caerEn(cerca[0].f.lat, cerca[0].f.lng, 11));
    cont.querySelector("[data-noticias]")?.addEventListener("click", async (e) => {
      (e.target as HTMLButtonElement).textContent = "Cargando…";
      try {
        noticiasBogota = await noticias("Bogotá");
      } catch (err) {
        errorNoticias = err instanceof Error ? err.message : String(err);
      }
      panel();
    });
  }
  panel();

  const api: Planeta = {
    alternar(c, v) {
      on[c] = v ?? !on[c];
      pintarTodo();
      panel();
    },
    activo: (c) => on[c],
    async resumen(lat, lng) {
      const out: string[] = [];
      const s = tles.length ? encima(tles, lat, lng) : [];
      if (s.length) out.push(`${s.length} satélites sobre este punto ahora (el más alto: ${s[0].tle.nombre}, ${s[0].elevacion}°)`);
      const f = focos.map((x) => distancia(lat, lng, x.lat, x.lng)).sort((a, b) => a - b)[0];
      if (f !== undefined) out.push(`Incendio activo más cercano a ${(f / 1000).toFixed(0)} km`);
      const ev = eventos.map((e) => ({ e, d: distancia(lat, lng, e.lat, e.lng) })).sort((a, b) => a.d - b.d)[0];
      if (ev && ev.d < 300_000) out.push(`${ev.e.icono} ${ev.e.titulo} a ${(ev.d / 1000).toFixed(0)} km`);
      if (kp && kp.kp >= 5) out.push(`Tormenta geomagnética ${kp.nivel} (Kp ${kp.kp})`);
      return out;
    },
    noticiasDe: (tema) => noticias(tema, 48, 6),
    cercanos(lat, lng) {
      const f = focos.map((x) => ({ x, d: distancia(lat, lng, x.lat, x.lng) })).sort((a, b) => a.d - b.d)[0];
      const e = eventos.map((x) => ({ x, d: distancia(lat, lng, x.lat, x.lng) })).sort((a, b) => a.d - b.d)[0];
      return {
        incendio: f && { lat: f.x.lat, lng: f.x.lng, km: f.d / 1000, texto: `🔥 Foco de incendio (${f.x.frp.toFixed(1)} MW, ${hace(Date.parse(f.x.cuando))})` },
        evento: e && { lat: e.x.lat, lng: e.x.lng, km: e.d / 1000, texto: `${e.x.icono} ${e.x.titulo}` },
      };
    },
    listo: primera,
  };
  return api;
}
