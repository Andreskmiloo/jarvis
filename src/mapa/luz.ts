// Luz real: el cielo, el horizonte y la niebla del mapa siguen al Sol sobre Bogotá
// (amanecer dorado, mediodía claro, atardecer naranja, noche azul oscura). Además, fase lunar.
import type { Map as Mapa, SkySpecification } from "maplibre-gl";
import { elevacionSol } from "../espacio/terminador";

const BOGOTA = { lat: 4.65, lng: -74.08 };

type Rgb = [number, number, number];
const hex = (c: string): Rgb => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c.trim());
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [128, 128, 128];
};
const mezclar = (a: string, b: string, t: number) => {
  const x = hex(a), y = hex(b);
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, t))).toString(16).padStart(2, "0")).join("");
};

export type Momento = "noche" | "amanecer" | "dia" | "atardecer";

/** Momento del día según la altura del Sol (grados) y si va subiendo. */
export function momento(elev: number, subiendo: boolean): Momento {
  if (elev < -6) return "noche";
  if (elev < 8) return subiendo ? "amanecer" : "atardecer";
  return "dia";
}

/** Colores del cielo para una altura de Sol, partiendo de los del tema. */
export function cieloPara(elev: number, subiendo: boolean, base: { cielo: string; horizonte: string; niebla: string }) {
  const noche = { cielo: "#03050b", horizonte: "#0b1424", niebla: "#05080f" };
  const oro = subiendo ? { cielo: "#2a3b5c", horizonte: "#ffb36b", niebla: "#3a3340" } : { cielo: "#2b2a4a", horizonte: "#ff7a45", niebla: "#3b2b35" };
  if (elev <= -8) return noche;
  if (elev < 0) {
    const t = (elev + 8) / 8; // noche → hora dorada
    return { cielo: mezclar(noche.cielo, oro.cielo, t), horizonte: mezclar(noche.horizonte, oro.horizonte, t), niebla: mezclar(noche.niebla, oro.niebla, t) };
  }
  if (elev < 12) {
    const t = elev / 12; // hora dorada → día del tema
    return { cielo: mezclar(oro.cielo, base.cielo, t), horizonte: mezclar(oro.horizonte, base.horizonte, t), niebla: mezclar(oro.niebla, base.niebla, t) };
  }
  return base;
}

/** Fase lunar (0 nueva, 0.5 llena) y su nombre. */
export function faseLunar(cuando = new Date()): { fase: number; nombre: string; icono: string; iluminada: number } {
  const SINODICO = 29.530588853;
  const nuevaRef = Date.UTC(2000, 0, 6, 18, 14); // luna nueva de referencia
  const dias = (cuando.getTime() - nuevaRef) / 864e5;
  const fase = (((dias % SINODICO) + SINODICO) % SINODICO) / SINODICO;
  const iluminada = Math.round(((1 - Math.cos(2 * Math.PI * fase)) / 2) * 100);
  const nombres: [number, string, string][] = [
    [0.03, "Luna nueva", "🌑"], [0.22, "Creciente", "🌒"], [0.28, "Cuarto creciente", "🌓"], [0.47, "Gibosa creciente", "🌔"],
    [0.53, "Luna llena", "🌕"], [0.72, "Gibosa menguante", "🌖"], [0.78, "Cuarto menguante", "🌗"], [0.97, "Menguante", "🌘"], [1, "Luna nueva", "🌑"],
  ];
  const [, nombre, icono] = nombres.find(([h]) => fase < h)!;
  return { fase, nombre, icono, iluminada };
}

/** Hora de salida o puesta del Sol (busca el cruce del horizonte en pasos de 1 min). */
export function cruceSol(fecha: Date, subiendo: boolean, lat = BOGOTA.lat, lng = BOGOTA.lng): Date | null {
  const ini = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), 5)); // 00:00 en Bogotá
  let previo = elevacionSol(lat, lng, ini);
  for (let m = 1; m <= 1440; m++) {
    const t = new Date(ini.getTime() + m * 60e3);
    const e = elevacionSol(lat, lng, t) + 0.833; // refracción y radio del disco
    const p = previo + 0.833;
    if (subiendo ? p < 0 && e >= 0 : p >= 0 && e < 0) return t;
    previo = e - 0.833;
  }
  return null;
}

export function iniciarLuz(mapa: Mapa) {
  let base: { cielo: string; horizonte: string; niebla: string } | null = null;
  const aplicar = () => {
    const sky = mapa.getSky() as SkySpecification | undefined;
    if (!sky) return;
    base ??= { cielo: String(sky["sky-color"] ?? "#88aadd"), horizonte: String(sky["horizon-color"] ?? "#ffffff"), niebla: String(sky["fog-color"] ?? "#ffffff") };
    const ahora = new Date();
    const e = elevacionSol(BOGOTA.lat, BOGOTA.lng, ahora);
    const subiendo = elevacionSol(BOGOTA.lat, BOGOTA.lng, new Date(ahora.getTime() + 600e3)) > e;
    const c = cieloPara(e, subiendo, base);
    mapa.setSky({ ...sky, "sky-color": c.cielo, "horizon-color": c.horizonte, "fog-color": c.niebla });
  };
  if (mapa.loaded()) aplicar();
  else mapa.once("load", aplicar);
  setInterval(() => !document.hidden && aplicar(), 5 * 60e3);
}
