// "Mi casa": punto de referencia que vive solo en este navegador.
const CLAVE = "ojo-de-dios:casa:v1";

export interface Casa {
  lat: number;
  lng: number;
  fijada: string;
}

export function leerCasa(): Casa | null {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE) ?? "null");
    return d && Number.isFinite(d.lat) && Number.isFinite(d.lng) ? d : null;
  } catch {
    return null;
  }
}

export function guardarCasa(lat: number, lng: number): Casa {
  const c = { lat: +lat.toFixed(6), lng: +lng.toFixed(6), fijada: new Date().toISOString().slice(0, 10) };
  try {
    localStorage.setItem(CLAVE, JSON.stringify(c));
  } catch {
    /* sin almacenamiento: vale solo mientras la página esté abierta */
  }
  return c;
}

export function borrarCasa() {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    /* nada que borrar */
  }
}

export function textoDistancia(m: number): string {
  if (m < 60) return "estás en tu casa";
  return m < 1000 ? `a ${Math.round(m / 10) * 10} m de tu casa` : `a ${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km de tu casa`;
}
