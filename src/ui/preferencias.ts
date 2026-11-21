// Preferencias del usuario en este navegador (qué capas dejó encendidas, etc.).
const PREFIJO = "ojo:pref:";

export function leerPref<T>(clave: string, porDefecto: T): T {
  try {
    const v = localStorage.getItem(PREFIJO + clave);
    return v === null ? porDefecto : (JSON.parse(v) as T);
  } catch {
    return porDefecto;
  }
}

export function guardarPref<T>(clave: string, valor: T) {
  try {
    localStorage.setItem(PREFIJO + clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: vale solo para esta visita */
  }
}
