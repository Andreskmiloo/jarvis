// Alertas cerca de ti: al abrir, un aviso discreto si algo pasa cerca de tu casa o tus lugares
// (incendio activo, evento natural, río alto). Tocarlo lleva la cámara al punto.
import { esc } from "./ui/html";
import { leerPref, guardarPref } from "./ui/preferencias";

export interface Alerta {
  clave: string;
  texto: string;
  lat: number;
  lng: number;
  nivel: "aviso" | "alerta";
}

export interface Referencia {
  nombre: string;
  lat: number;
  lng: number;
}

/** Decide qué alertar a partir de lo cercano a cada referencia (casa primero). */
export function decidirAlertas(
  refs: Referencia[],
  cercanos: (lat: number, lng: number) => { incendio?: { lat: number; lng: number; km: number; texto: string }; evento?: { lat: number; lng: number; km: number; texto: string } },
  rioCasa?: { nivel: string; lat: number; lng: number },
  kmIncendio = 15,
  kmEvento = 80,
): Alerta[] {
  const out = new Map<string, Alerta>();
  for (const r of refs) {
    const c = cercanos(r.lat, r.lng);
    if (c.incendio && c.incendio.km <= kmIncendio) {
      const k = `fuego:${c.incendio.lat.toFixed(3)},${c.incendio.lng.toFixed(3)}`;
      if (!out.has(k)) out.set(k, { clave: k, texto: `${c.incendio.texto} a ${c.incendio.km.toFixed(0)} km de ${r.nombre}`, lat: c.incendio.lat, lng: c.incendio.lng, nivel: c.incendio.km < 5 ? "alerta" : "aviso" });
    }
    if (c.evento && c.evento.km <= kmEvento) {
      const k = `evento:${c.evento.texto}`;
      if (!out.has(k)) out.set(k, { clave: k, texto: `${c.evento.texto} a ${c.evento.km.toFixed(0)} km de ${r.nombre}`, lat: c.evento.lat, lng: c.evento.lng, nivel: "aviso" });
    }
  }
  if (rioCasa && (rioCasa.nivel === "alto" || rioCasa.nivel === "muy alto"))
    out.set("rio", { clave: "rio", texto: `🌊 Río cerca de tu casa: caudal ${rioCasa.nivel}`, lat: rioCasa.lat, lng: rioCasa.lng, nivel: rioCasa.nivel === "muy alto" ? "alerta" : "aviso" });
  return [...out.values()].sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "alerta" ? -1 : 1));
}

/** Muestra hasta 3 alertas nuevas de hoy (las que cerraste no vuelven el mismo día). */
export function mostrarAlertas(lista: Alerta[], irA: (lat: number, lng: number) => void) {
  const hoy = new Date().toISOString().slice(0, 10);
  const vistas = leerPref<{ dia: string; claves: string[] }>("alertas", { dia: hoy, claves: [] });
  const cerradas = new Set(vistas.dia === hoy ? vistas.claves : []);
  const nuevas = lista.filter((a) => !cerradas.has(a.clave)).slice(0, 3);
  if (!nuevas.length) return;
  let caja = document.getElementById("alertas");
  if (!caja) {
    caja = document.createElement("div");
    caja.id = "alertas";
    caja.className = "alertas";
    caja.setAttribute("role", "status");
    document.body.appendChild(caja);
  }
  for (const a of nuevas) {
    const el = document.createElement("div");
    el.className = `alerta alerta--${a.nivel}`;
    el.innerHTML = `<button class="alerta__ir">${esc(a.texto)}</button><button class="alerta__x" aria-label="Cerrar">✕</button>`;
    const cerrar = () => {
      cerradas.add(a.clave);
      guardarPref("alertas", { dia: hoy, claves: [...cerradas] });
      el.classList.add("sale");
      setTimeout(() => el.remove(), 300);
    };
    el.querySelector(".alerta__ir")!.addEventListener("click", () => {
      irA(a.lat, a.lng);
      cerrar();
    });
    el.querySelector(".alerta__x")!.addEventListener("click", cerrar);
    caja.appendChild(el);
    setTimeout(() => el.isConnected && el.classList.add("sale"), 20000);
    setTimeout(() => el.isConnected && el.remove(), 20400);
  }
}
