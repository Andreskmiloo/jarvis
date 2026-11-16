// Panel de Jarvis: chat flotante de vidrio. Atajo: tecla J.
import { esc } from "../ui/html";
import type { Acciones, Jarvis } from "./asistente";
import { guardarClave, leerClave } from "./clave";

const NOMBRES: Record<string, string> = {
  volar_a: "Volando",
  leer_zona: "Leyendo la zona",
  buscar_gusto: "Buscando",
  capa: "Capa",
  vista: "Cambiando la vista",
  mis_datos: "Mirando tus lugares",
  planeta: "Mirando el cielo",
};

export function iniciarJarvis(acciones: Acciones) {
  // El SDK de Claude se descarga solo la primera vez que se usa Jarvis.
  let jarvis: Jarvis | null = null;
  const cargar = async () => (jarvis ??= new (await import("./asistente")).Jarvis(acciones));
  const el = document.createElement("section");
  el.id = "jarvis";
  el.className = "jarvis";
  el.hidden = true;
  el.setAttribute("aria-label", "Jarvis, asistente del mapa");
  document.body.appendChild(el);
  let ocupado = false;

  function pintar() {
    const clave = leerClave();
    el.innerHTML = `<header class="jarvis__cab"><b>◉ JARVIS</b><span class="sub">asistente del mapa</span>
      <button class="jarvis__x" data-cerrar aria-label="Cerrar">✕</button></header>
      ${
        clave
          ? `<div class="jarvis__chat" id="jarvis-chat"><p class="nota">Pídeme cosas como: <i>"llévame a Chapinero y dime el estrato"</i>, <i>"canchas de vóley gratis cerca de mi casa a las que no he ido"</i>, <i>"¿qué satélites pasan sobre mi casa?"</i>, <i>"muéstrame la Tierra"</i>.</p></div>
        <form class="jarvis__form" id="jarvis-form"><input id="jarvis-txt" autocomplete="off" placeholder="Escribe a Jarvis…" /><button class="boton" type="submit">↑</button></form>
        <p class="jarvis__pie"><button class="enlace" data-olvidar>Quitar clave</button> · <button class="enlace" data-nuevo>Nueva conversación</button></p>`
          : `<div class="jarvis__chat"><p>Jarvis usa la API de Claude con <b>tu propia clave</b>. Se guarda solo en este navegador y viaja directo a Anthropic; nunca se sube al repositorio ni a la página.</p>
        <p class="nota">Crea una en console.anthropic.com → API Keys (empieza por <code>sk-ant-</code>). Cada pregunta gasta un poco de tu saldo. Cuando la usas, Jarvis puede leer tu casa, tus lugares y tus gustos para responder.</p></div>
        <form class="jarvis__form" id="jarvis-clave"><input id="jarvis-k" type="password" autocomplete="off" placeholder="sk-ant-…" /><button class="boton" type="submit">Guardar</button></form>`
      }`;
    el.querySelector("[data-cerrar]")?.addEventListener("click", () => abrir(false));
    el.querySelector("[data-olvidar]")?.addEventListener("click", () => {
      guardarClave("");
      jarvis?.reiniciar();
      pintar();
    });
    el.querySelector("[data-nuevo]")?.addEventListener("click", () => {
      jarvis?.reiniciar();
      pintar();
    });
    el.querySelector<HTMLFormElement>("#jarvis-clave")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const k = el.querySelector<HTMLInputElement>("#jarvis-k")!.value.trim();
      if (!k.startsWith("sk-ant-")) return alert("La clave debe empezar por sk-ant-");
      guardarClave(k);
      pintar();
    });
    el.querySelector<HTMLFormElement>("#jarvis-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const i = el.querySelector<HTMLInputElement>("#jarvis-txt")!;
      const t = i.value.trim();
      if (!t || ocupado) return;
      i.value = "";
      void preguntar(t);
    });
    el.querySelector<HTMLInputElement>("#jarvis-txt, #jarvis-k")?.focus({ preventScroll: true });
  }

  function burbuja(clase: string, html: string): HTMLElement {
    const chat = el.querySelector("#jarvis-chat")!;
    const b = document.createElement("div");
    b.className = `jarvis__msg ${clase}`;
    b.innerHTML = html;
    chat.appendChild(b);
    chat.scrollTop = chat.scrollHeight;
    return b;
  }

  /** Texto plano con **negritas** y saltos de línea, sin HTML del modelo. */
  const formato = (t: string) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\n/g, "<br>");

  async function preguntar(t: string) {
    ocupado = true;
    burbuja("yo", esc(t));
    const pensando = burbuja("paso", "Pensando…");
    try {
      await (await cargar()).preguntar(t, (ev) => {
        if (ev.tipo === "texto") burbuja("el", formato(ev.texto));
        else if (ev.tipo === "herramienta") {
          const x = ev.entrada as Record<string, unknown>;
          const det = String(x.lugar ?? x.gusto ?? x.capa ?? x.tipo ?? "");
          burbuja("paso", `⚙ ${esc(NOMBRES[ev.nombre] ?? ev.nombre)}${det ? `: ${esc(det)}` : ""}`);
        } else burbuja("error", esc(ev.texto));
      });
    } catch (e) {
      burbuja("error", esc(e instanceof Error ? e.message : String(e)));
    } finally {
      pensando.remove();
      ocupado = false;
    }
  }

  function abrir(v = el.hidden) {
    el.hidden = !v;
    if (v) {
      if (!el.innerHTML) pintar();
      el.querySelector<HTMLInputElement>("#jarvis-txt, #jarvis-k")?.focus({ preventScroll: true });
    }
  }
  return { abrir };
}
