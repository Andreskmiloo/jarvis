// La clave de la API de Claude del usuario: solo en su navegador (localStorage).
const CLAVE = "jarvis:clave";

export function leerClave(): string {
  try {
    return localStorage.getItem(CLAVE) ?? "";
  } catch {
    return "";
  }
}
export function guardarClave(k: string) {
  try {
    if (k) localStorage.setItem(CLAVE, k.trim());
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento: dura lo que dure la pestaña */
  }
}

