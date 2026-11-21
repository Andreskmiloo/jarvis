// Regulador de animaciones: mientras arrastras el mapa (o la pestaña está oculta) las
// animaciones decorativas se pausan, así la GPU solo trabaja en mover el mapa 3D.
import type { Map as Mapa } from "maplibre-gl";

let moviendo = false;
/** setPixelRatio redimensiona y MapLibre emite movestart/moveend: esos eventos se ignoran. */
let propio = false;
let conectado: Mapa | null = null;
const reducido = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)");
export const MOVIL = typeof matchMedia === "function" && matchMedia("(max-width: 720px)").matches;

export function conectarRitmo(mapa: Mapa) {
  if (conectado === mapa) return;
  conectado = mapa;
  mapa.on("movestart", () => {
    if (!propio) moviendo = true;
  });
  mapa.on("moveend", () => (moviendo = false));
}

/**
 * Nitidez adaptativa: quieto se dibuja a la resolución real de la pantalla (nítido, como
 * Google Earth al soltar) y en movimiento con menos píxeles para que vaya fluido.
 */
export function nitidezAdaptativa(mapa: Mapa) {
  const nitido = Math.min(devicePixelRatio || 1, 2);
  const fluido = Math.min(nitido, MOVIL ? 1.25 : 1.5);
  if (nitido === fluido) return;
  let espera = 0;
  const poner = (r: number) => {
    if (Math.abs(mapa.getPixelRatio() - r) < 0.01) return;
    propio = true;
    mapa.setPixelRatio(r);
    propio = false;
  };
  mapa.on("movestart", () => {
    if (propio) return;
    clearTimeout(espera);
    poner(fluido);
  });
  mapa.on("moveend", () => {
    if (propio) return;
    clearTimeout(espera);
    espera = window.setTimeout(() => !moviendo && poner(nitido), 250);
  });
}

/** ¿Vale la pena pintar un cuadro de animación ahora? */
export function puedeAnimar(): boolean {
  return !moviendo && !(typeof document !== "undefined" && document.hidden) && !(reducido && reducido.matches);
}
