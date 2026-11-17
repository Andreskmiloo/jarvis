// "Hoy en Bogotá": lo del día en una sola tarjeta compacta (pestaña Vivo).
// Pico y placa, TRM, sol y luna, lluvia del mes frente a lo normal, río más cercano a tu casa
// y el viento animado.
import type { Map as Mapa } from "maplibre-gl";
import { hoyEnBogota, picoYPlaca, trm, type Trm } from "./fuentes/indicadores";
import { lluviaVsNormal, rio, type Lluvia, type Rio } from "./fuentes/agua";
import { cruceSol, faseLunar } from "./mapa/luz";
import { CapaViento } from "./mapa/viento";
import { leerCasa } from "./lugares/casa";
import { esc } from "./ui/html";
import { guardarPref, leerPref } from "./ui/preferencias";

const BOGOTA = { lat: 4.65, lng: -74.08 };

export interface Hoy {
  texto(): string;
  rioCasa(): Promise<Rio | null>;
  listo: Promise<void>;
}

export function iniciarHoy(mapa: Mapa, cont: HTMLElement): Hoy {
  let tasa: Trm | null = null;
  let lluvia: Lluvia | null = null;
  let rioRef: Rio | null = null;
  const errores: string[] = [];
  const viento = new CapaViento(mapa);
  let vientoOn = leerPref("viento", false);
  let vientoKmh = 0;
  const ref = () => leerCasa() ?? BOGOTA;
  const hora = (d: Date | null) => (d ? d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "America/Bogota" }) : "–");

  function pintar() {
    const pyp = picoYPlaca(hoyEnBogota());
    const ahora = new Date();
    const sale = cruceSol(ahora, true);
    const pone = cruceSol(ahora, false);
    const luna = faseLunar(ahora);
    const donde = leerCasa() ? "tu casa" : "Bogotá";
    cont.innerHTML = `<h2>Hoy</h2>
    <div class="hoy">
      <div class="hoy__item"><span>🚗 Pico y placa</span><b>${pyp.aplica ? `no circulan ${pyp.restringidas.join("-")}` : "no aplica"}</b><small>${pyp.aplica ? pyp.horario : esc(pyp.nota)}</small></div>
      <div class="hoy__item"><span>💵 TRM</span><b>${tasa ? `$${tasa.valor.toLocaleString("es-CO", { minimumFractionDigits: 2 })}` : "–"}</b><small>${tasa ? `vigente hasta ${tasa.hasta}` : "datos.gov.co"}</small></div>
      <div class="hoy__item"><span>☀️ Sol</span><b>${hora(sale)} · ${hora(pone)}</b><small>amanecer · atardecer</small></div>
      <div class="hoy__item"><span>${luna.icono} Luna</span><b>${esc(luna.nombre)}</b><small>${luna.iluminada}% iluminada</small></div>
      <div class="hoy__item"><span>🌧 Lluvia 30 días</span><b>${lluvia ? `${lluvia.ultimos30} mm` : "–"}</b><small>${lluvia ? `${esc(lluvia.texto)} (normal ${lluvia.normal} mm)` : "frente a años anteriores"}</small></div>
      <div class="hoy__item"><span>🌊 Río cerca de ${donde}</span><b>${rioRef ? rioRef.nivel : "–"}</b><small>${rioRef ? `${rioRef.hoy.toFixed(2)} m³/s · normal ${rioRef.mediana.toFixed(2)}` : "caudal GloFAS"}</small></div>
    </div>
    <label class="capa"><input type="checkbox" id="hoy-viento" ${vientoOn ? "checked" : ""}/><i style="background:#bee6ff"></i>🌬 Viento animado${vientoKmh ? `<small>${vientoKmh} km/h promedio</small>` : "<small>Open-Meteo, ahora</small>"}</label>
    ${errores.length ? `<p class="nota">${errores.map(esc).join(" · ")}</p>` : ""}`;
    cont.querySelector<HTMLInputElement>("#hoy-viento")?.addEventListener("change", async (e) => {
      vientoOn = (e.target as HTMLInputElement).checked;
      guardarPref("viento", vientoOn);
      await ponerViento();
    });
  }

  async function ponerViento() {
    try {
      const m = await viento.encender(vientoOn);
      vientoKmh = m?.velocidadMedia ?? 0;
    } catch (e) {
      vientoOn = false;
      errores.push(e instanceof Error ? e.message : String(e));
    }
    pintar();
  }

  const r = ref();
  const conError = (n: string) => (e: unknown) => void errores.push(`${n}: ${e instanceof Error ? e.message : e}`);
  const listo = Promise.all([
    trm().then((t) => void (tasa = t), conError("TRM")),
    lluviaVsNormal(r.lat, r.lng).then((l) => void (lluvia = l), conError("Lluvia")),
    rio(r.lat, r.lng).then((x) => void (rioRef = x), conError("Río")),
  ]).then(pintar);
  pintar();
  if (vientoOn) mapa.once("idle", () => void ponerViento());

  return {
    listo,
    texto() {
      const p = picoYPlaca(hoyEnBogota());
      return [
        `Pico y placa hoy (${p.fecha}): ${p.aplica ? `no circulan placas terminadas en ${p.restringidas.join(", ")} (${p.horario})` : p.nota}`,
        tasa ? `TRM: $${tasa.valor} (vigente ${tasa.desde} a ${tasa.hasta})` : "TRM: sin dato",
        lluvia ? `Lluvia últimos 30 días: ${lluvia.ultimos30} mm, normal ${lluvia.normal} mm (${lluvia.texto})` : "",
        rioRef ? `Río cerca de ${leerCasa() ? "la casa" : "Bogotá"}: ${rioRef.nivel} (${rioRef.hoy} m³/s, normal ${rioRef.mediana})` : "",
        `Luna: ${faseLunar().nombre}`,
      ]
        .filter(Boolean)
        .join("\n");
    },
    async rioCasa() {
      await listo;
      return rioRef;
    },
  };
}
