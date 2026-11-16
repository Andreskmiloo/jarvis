// Regulador de animaciones: mientras arrastras el mapa (o la pestaña está oculta) las
// animaciones decorativas se pausan, así la GPU solo trabaja en mover el mapa 3D.
import type { Map as Mapa } from "maplibre-gl";

let moviendo = false;
let conectado: Mapa | null = null;
const reducido = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const MOVIL = typeof matchMedia === "function" && matchMedia("(max-width: 720px)").matches;

export function conectarRitmo(mapa: Mapa) {
  if (conectado === mapa) return;
  conectado = mapa;
  mapa.on("movestart", () => (moviendo = true));
  mapa.on("moveend", () => (moviendo = false));
}

/** ¿Vale la pena pintar un cuadro de animación ahora? */
export function puedeAnimar(): boolean {
  return !moviendo && !(typeof document !== "undefined" && document.hidden) && !reducido;
}
