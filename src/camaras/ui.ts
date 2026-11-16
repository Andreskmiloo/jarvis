// Sección "Mis cámaras" de la pestaña Vivo y visor flotante.
import type { GeoJSONSource, Map as Mapa } from "maplibre-gl";
import { aviso, esc } from "../ui/html";
import { pines } from "../mapa/pines";
import { analizarEnlace, guardarCamaras, leerCamaras, reproducir, type CamaraPropia } from "./propias";

export interface UICamaras {
  abrir(id: string): void;
  /** Abre en el visor cualquier reproductor externo (webcam pública, Waze…). */
  abrirExterna(titulo: string, url: string): void;
  /** El siguiente toque en el mapa ubica la cámara pendiente; devuelve true si lo consumió. */
  tocar(lat: number, lng: number): boolean;
}

export function iniciarCamaras(mapa: Mapa, cont: HTMLElement, registrarCapa: (id: string) => void): UICamaras {
  let lista = leerCamaras();
  let pendiente: Omit<CamaraPropia, "lat" | "lng"> | null = null;
  let detener: () => void = () => {};

  const visor = Object.assign(document.createElement("div"), { className: "visor", hidden: true });
  visor.innerHTML = `<div class="fila visor__barra"><b id="visor-titulo"></b><button class="boton sec peq" id="visor-cerrar" aria-label="Cerrar">✕</button></div><div class="visor__video" id="visor-video"></div>`;
  document.body.append(visor);
  visor.querySelector("#visor-cerrar")!.addEventListener("click", cerrar);

  function cerrar() {
    detener();
    visor.hidden = true;
  }

  function geo(): GeoJSON.FeatureCollection {
    return {
      type: "FeatureCollection",
      features: lista.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: [c.lng, c.lat] }, properties: { camara: c.id, nombre: `📹 ${c.nombre}`, sub: `cámara propia · ${c.tipo}` } })),
    };
  }

  function volcar() {
    (mapa.getSource("camaras-propias") as GeoJSONSource | undefined)?.setData(geo());
    pines()?.poner("camaras-propias", geo(), { color: "#00e5ff", escala: 1.1 });
    pintar();
  }

  function crearCapa() {
    mapa.addSource("camaras-propias", { type: "geojson", data: geo() });
    mapa.addLayer({
      id: "camaras-propias",
      type: "circle",
      source: "camaras-propias",
      paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 0, 7, 7, 9, 7, 10.5, 2.5], "circle-color": "#00e5ff", "circle-stroke-width": 2, "circle-stroke-color": "#fff" },
    });
    registrarCapa("camaras-propias");
  }

  function abrir(id: string) {
    const c = lista.find((x) => x.id === id);
    if (!c) return;
    detener();
    visor.querySelector("#visor-titulo")!.textContent = c.nombre;
    visor.hidden = false;
    detener = reproducir(visor.querySelector<HTMLElement>("#visor-video")!, c);
  }

  function pintar() {
    cont.innerHTML = `<h2>Mis cámaras</h2>
      <p class="nota">Agrega cámaras que sí transmiten al público o que son tuyas: un live de YouTube, un enlace HLS (.m3u8) o una imagen que se refresca. Se ven dentro del mapa y se guardan solo en este navegador.</p>
      <form class="form-camara" id="form-camara">
        <input name="nombre" placeholder="Nombre (p. ej. Monserrate)" required maxlength="60" />
        <input name="url" type="url" placeholder="https://…" required />
        <button class="boton">Agregar y ubicar en el mapa</button>
      </form>
      <ul class="lista">${lista
        .map((c) => `<li><div class="fila"><button class="enlace" data-ver-cam="${esc(c.id)}">📹 ${esc(c.nombre)}</button><span class="etiqueta">${esc(c.tipo)}</span></div><div class="acciones"><button class="boton sec peq" data-ir-cam="${esc(c.id)}">Ir</button><button class="boton sec peq" data-borrar-cam="${esc(c.id)}">Borrar</button></div></li>`)
        .join("")}</ul>`;
    cont.querySelector<HTMLFormElement>("#form-camara")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target as HTMLFormElement);
      const url = String(f.get("url") ?? "");
      const a = analizarEnlace(url);
      if (!a) return aviso("Ese enlace no es válido");
      pendiente = { id: `cam-${Date.now().toString(36)}`, nombre: String(f.get("nombre") ?? "Cámara").trim() || "Cámara", url, tipo: a.tipo };
      mapa.getCanvas().style.cursor = "crosshair";
      document.getElementById("panel")?.classList.add("contraido");
      aviso("Toca el mapa donde está la cámara", 4000);
    });
    cont.querySelectorAll<HTMLButtonElement>("[data-ver-cam]").forEach((b) => b.addEventListener("click", () => abrir(b.dataset.verCam!)));
    cont.querySelectorAll<HTMLButtonElement>("[data-ir-cam]").forEach((b) =>
      b.addEventListener("click", () => {
        const c = lista.find((x) => x.id === b.dataset.irCam)!;
        mapa.flyTo({ center: [c.lng, c.lat], zoom: 16.5, duration: 1600 });
        abrir(c.id);
      }),
    );
    cont.querySelectorAll<HTMLButtonElement>("[data-borrar-cam]").forEach((b) =>
      b.addEventListener("click", () => {
        lista = lista.filter((x) => x.id !== b.dataset.borrarCam);
        guardarCamaras(lista);
        cerrar();
        volcar();
      }),
    );
  }

  function abrirExterna(titulo: string, url: string) {
    detener();
    visor.querySelector("#visor-titulo")!.textContent = titulo;
    visor.hidden = false;
    detener = reproducir(visor.querySelector<HTMLElement>("#visor-video")!, { id: "externa", nombre: titulo, url, tipo: "pagina", lat: 0, lng: 0 });
  }

  if (mapa.loaded()) crearCapa();
  else mapa.once("load", crearCapa);
  pintar();

  setTimeout(() => pines()?.poner("camaras-propias", geo(), { color: "#00e5ff", escala: 1.1 }), 0);

  return {
    abrir,
    abrirExterna,
    tocar(lat, lng) {
      if (!pendiente) return false;
      const c = { ...pendiente, lat, lng };
      pendiente = null;
      mapa.getCanvas().style.cursor = "";
      lista.push(c);
      guardarCamaras(lista);
      volcar();
      abrir(c.id);
      aviso(`📹 ${c.nombre} agregada`);
      return true;
    },
  };
}
