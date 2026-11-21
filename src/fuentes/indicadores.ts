// Indicadores del día: TRM oficial (Superfinanciera vía datos.gov.co) y pico y placa de Bogotá.

export interface Trm {
  valor: number;
  desde: string;
  hasta: string;
}

export function leerTrm(d: { valor: string; vigenciadesde: string; vigenciahasta: string }[]): Trm | null {
  const x = d[0];
  return x ? { valor: Number(x.valor), desde: x.vigenciadesde.slice(0, 10), hasta: x.vigenciahasta.slice(0, 10) } : null;
}

export async function trm(signal?: AbortSignal): Promise<Trm | null> {
  const r = await fetch("https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC", { signal });
  if (!r.ok) throw new Error(`TRM HTTP ${r.status}`);
  return leerTrm(await r.json());
}

/** Festivos de Colombia 2026 (Ley Emiliani aplicada). */
export const FESTIVOS_2026 = [
  "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15",
  "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
];

export interface PicoPlaca {
  fecha: string;
  aplica: boolean;
  circulan: number[];
  restringidas: number[];
  horario: string;
  nota: string;
}

/**
 * Vehículos particulares en Bogotá (regla publicada por la Alcaldía para noviembre de 2026):
 * días impares circulan placas terminadas en 1-5; días pares, 6-0; lunes a viernes de
 * 6:00 a. m. a 9:00 p. m.; no aplica sábados, domingos ni festivos.
 */
export function picoYPlaca(fechaISO: string): PicoPlaca {
  const [a, m, d] = fechaISO.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0 domingo
  const festivo = FESTIVOS_2026.includes(fechaISO);
  const base = { fecha: fechaISO, horario: "6:00 a. m. – 9:00 p. m.", nota: "Regla de la Alcaldía de Bogotá publicada para noviembre de 2026; confirma cambios en movilidadbogota.gov.co" };
  if (dia === 0 || dia === 6 || festivo)
    return { ...base, aplica: false, circulan: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], restringidas: [], nota: festivo ? "Festivo: no hay pico y placa en la ciudad (puede haber pico y placa regional de ingreso)" : "Fin de semana: no aplica" };
  const impar = d % 2 === 1;
  const circulan = impar ? [1, 2, 3, 4, 5] : [6, 7, 8, 9, 0];
  return { ...base, aplica: true, circulan, restringidas: impar ? [6, 7, 8, 9, 0] : [1, 2, 3, 4, 5] };
}

export const hoyEnBogota = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
