// Panel "Ciudad en capas 3D" y selector de modelo de ciudad.
import type { Map as Mapa } from "maplibre-gl";
import { CAPAS_RASTER, urlImagenCiudad } from "../config/capas";
import { CAPA_EDIFICIOS } from "../mapa/estilo";
import type { VistaSatelite } from "../mapa/satelite";
import { esc } from "../ui/html";
import { Apilado, type DefPlano } from "./apilado";

/** Orden de abajo hacia arriba y color de cada lámina. */
const ORDEN: { id: string; color: string; opacidad?: number }[] = [
  { id: "r-estrato", color: "#ff7b54" },
  { id: "r-uso", color: "#c38bff" },
  { id: "r-valor", color: "#3ddc97" },
  { id: "r-densidad", color: "#ffb02e" },
  { id: "r-arboles", color: "#5fd35f" },
  { id: "r-comparendos", color: "#ff4d6d" },
  { id: "r-troncales", color: "#ff3b3b" },
  { id: "r-metro", color: "#b06cff" },
  { id: "r-ciclovia", color: "#2ec4ff" },
  { id: "r-upz", color: "#d9d9d9", opacidad: 0.5 },
  { id: "r-localidades", color: "#ffffff", opacidad: 0.45 },
];
const INICIALES = new Set(["r-estrato", "r-valor", "r-densidad", "r-arboles", "r-localidades"]);

export type Modelo = "mapa" | "satelite" | "relieve" | "edificios";
const MODELOS: { id: Modelo; nombre: string; detalle: string }[] = [
  { id: "mapa", nombre: "Mapa", detalle: "vías y nombres" },
  { id: "satelite", nombre: "Satélite 2026", detalle: "Sentinel-2" },
  { id: "relieve", nombre: "Relieve", detalle: "solo el terreno" },
  { id: "edificios", nombre: "Edificios 3D", detalle: "volúmenes desde más lejos" },
];
const CAPAS_VIAS = ["vias-menores", "vias-medias", "vias-brillo", "vias-principales", "rieles", "nombres-vias", "nombres-lugares"];

export interface DepsCapas3D {
  mapa: Mapa;
  satelite: VistaSatelite;
  /** Pone o quita una capa raster en el suelo del mapa. */
  alSuelo: (id: string, activo: boolean) => void;
  enSuelo: (id: string) => boolean;
}

export function iniciarCapas3D(d: DepsCapas3D) {
  const { mapa, satelite } = d;
  const movil = matchMedia("(max-width: 720px)").matches;
  const defs: DefPlano[] = ORDEN.map((o) => {
    const c = CAPAS_RASTER.find((x) => x.id === o.id)!;
    return { id: o.id, nombre: c.nombre, color: o.color, opacidad: o.opacidad, url: urlImagenCiudad(c, movil ? 720 : 1024) };
  });
  const visibles = new Set(INICIALES);
  let apilado: Apilado | null = null;
  let modelo: Modelo = "mapa";
  let separacion = 2400;
  let relieve = 1;

  function crear(): Apilado {
    const a = new Apilado(defs, visibles);
    a.alElegir = (id) => bajar(id);
    return a;
  }

  function activo() {
    return !!apilado && !!mapa.getLayer("capas-3d");
  }

  function entrar() {
    if (activo()) return;
    apilado = crear();
    apilado.separacion = 0; // "explota" desde una sola lámina
    apilado.objetivo = separacion;
    apilado.relieve = relieve;
    // El apilado se dibuja con la matriz plana (Mercator): en esta vista se deja el globo.
    mapa.setProjection({ type: "mercator" });
    mapa.addLayer(apilado);
    mapa.easeTo({ center: movil ? [-74.06, 4.7] : [-74.105, 4.64], zoom: movil ? 9.25 : 10.35, pitch: movil ? 58 : 64, bearing: movil ? -12 : -28, duration: 1800 });
  }

  function salir() {
    if (mapa.getLayer("capas-3d")) mapa.removeLayer("capas-3d");
    apilado = null;
    mapa.setProjection({ type: "globe" });
  }

  /** Baja una lámina al suelo (se pinta sobre el mapa) o la devuelve a la pila. */
  function bajar(id: string) {
    const enSuelo = d.enSuelo(id);
    d.alSuelo(id, !enSuelo);
    if (enSuelo) visibles.add(id);
    else visibles.delete(id);
    apilado?.mostrar(id, !enSuelo);
    pintar?.();
  }

  function aplicarModelo(m: Modelo) {
    modelo = m;
    satelite.poner(m === "satelite" ? "sentinel" : "mapa");
    for (const id of CAPAS_VIAS) if (mapa.getLayer(id)) mapa.setLayoutProperty(id, "visibility", m === "relieve" ? "none" : "visible");
    if (mapa.getLayer(CAPA_EDIFICIOS)) {
      mapa.setLayoutProperty(CAPA_EDIFICIOS, "visibility", m === "relieve" ? "none" : "visible");
      mapa.setLayerZoomRange(CAPA_EDIFICIOS, m === "edificios" ? 11.5 : 13.5, 24);
    }
    if (mapa.getLayer("relieve-sombra")) mapa.setPaintProperty("relieve-sombra", "hillshade-exaggeration", m === "relieve" ? 1 : m === "satelite" ? 0.25 : 0.75);
    if (m === "edificios") mapa.easeTo({ zoom: Math.max(mapa.getZoom(), 12.5), pitch: 65, duration: 1200 });
    pintar?.();
  }

  let pintar: (() => void) | null = null;

  /** HTML del bloque y su conexión de eventos, para insertar al inicio de la pestaña Capas. */
  function html(): string {
    const on = activo();
    let h = `<h2>Ciudad en capas 3D</h2>
      <p class="nota">Cada capa es una lámina de toda Bogotá flotando sobre el relieve. Prende las que quieras, sepáralas o júntalas, y toca su etiqueta (o ⤓) para bajarla al suelo.</p>
      <div class="acciones">
        <button class="boton ${on ? "sec" : ""}" data-c3d="entrar">${on ? "Salir de la vista en capas" : "Ver ciudad en capas"}</button>
        ${on ? `<button class="boton sec" data-c3d="juntar">Juntar</button><button class="boton sec" data-c3d="separar">Separar</button>` : ""}
      </div>
      ${on ? `<label class="rango">Relieve <input type="range" min="0" max="2.5" step="0.1" value="${relieve}" data-c3d="relieve" /><output>${relieve.toFixed(1)}×</output></label>` : ""}
      ${on ? `<label class="rango">Separación <input type="range" min="400" max="6000" step="100" value="${separacion}" data-c3d="sep" /><output>${separacion} m</output></label>` : ""}
      <h3>Láminas (de abajo hacia arriba)</h3><ul class="lista laminas">`;
    for (const def of defs) {
      const suelo = d.enSuelo(def.id);
      const est = apilado?.estadoDe(def.id);
      h += `<li class="lamina"><label class="capa"><input type="checkbox" data-lamina="${def.id}" ${visibles.has(def.id) ? "checked" : ""} ${suelo ? "disabled" : ""}/><i style="background:${def.color}"></i>${esc(def.nombre)}${
        est === "error" ? `<small class="rojo">sin respuesta</small>` : suelo ? `<small>en el suelo</small>` : ""
      }</label><button class="boton ${suelo ? "" : "sec"} peq" data-bajar="${def.id}" title="${suelo ? "Subir a la pila" : "Bajar al suelo"}">${suelo ? "⤒" : "⤓"}</button></li>`;
    }
    h += `</ul><h3>Modelo de ciudad</h3><div class="chips">${MODELOS.map(
      (m) => `<button class="chip" data-modelo="${m.id}" aria-pressed="${modelo === m.id}" title="${esc(m.detalle)}">${esc(m.nombre)}</button>`,
    ).join("")}</div>`;
    return h;
  }

  function conectar(cont: HTMLElement, repintar: () => void) {
    pintar = repintar;
    cont.querySelectorAll<HTMLButtonElement>("[data-c3d]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = b.dataset.c3d;
        if (a === "entrar") activo() ? salir() : entrar();
        else if (a === "juntar" && apilado) apilado.objetivo = 0;
        else if (a === "separar" && apilado) apilado.objetivo = separacion;
        mapa.triggerRepaint();
        repintar();
      }),
    );
    cont.querySelector<HTMLInputElement>('input[data-c3d="sep"]')?.addEventListener("input", (e) => {
      separacion = Number((e.target as HTMLInputElement).value);
      (e.target as HTMLInputElement).nextElementSibling!.textContent = `${separacion} m`;
      if (apilado) apilado.objetivo = separacion;
      mapa.triggerRepaint();
    });
    cont.querySelector<HTMLInputElement>('input[data-c3d="relieve"]')?.addEventListener("input", (e) => {
      relieve = Number((e.target as HTMLInputElement).value);
      (e.target as HTMLInputElement).nextElementSibling!.textContent = `${relieve.toFixed(1)}×`;
      if (apilado) apilado.relieve = relieve;
      mapa.triggerRepaint();
    });
    cont.querySelectorAll<HTMLInputElement>("[data-lamina]").forEach((i) =>
      i.addEventListener("change", () => {
        if (i.checked) visibles.add(i.dataset.lamina!);
        else visibles.delete(i.dataset.lamina!);
        if (!activo() && i.checked) entrar();
        apilado?.mostrar(i.dataset.lamina!, i.checked);
      }),
    );
    cont.querySelectorAll<HTMLButtonElement>("[data-bajar]").forEach((b) => b.addEventListener("click", () => bajar(b.dataset.bajar!)));
    cont.querySelectorAll<HTMLButtonElement>("[data-modelo]").forEach((b) => b.addEventListener("click", () => aplicarModelo(b.dataset.modelo as Modelo)));
  }

  return { html, conectar, entrar, salir, activo };
}
