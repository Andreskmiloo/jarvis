// Pantalla de carga + acceso. Es un candado de cortesía: la página es estática y pública,
// así que no protege datos de verdad (tus lugares y tu casa siguen solo en tu navegador).
// La contraseña no está en el código: solo su huella SHA-256 con sal.

const SAL = "ojo-de-dios:";
/** sha256("ojo-de-dios:" + contraseña). Para cambiarla: printf 'ojo-de-dios:NUEVA' | sha256sum */
export const HUELLA = "33aa491447daa2ab93d22ae35511dffc9dd0614f71645f2f1b3b2fb55d415e03";
export const USUARIOS = ["camilo", "camilo123"];
const CLAVE_SESION = "ojo:sesion";
const DIAS = 30;

export async function sha256(texto: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function credencialesValidas(usuario: string, clave: string): Promise<boolean> {
  if (!USUARIOS.includes(usuario.trim().toLowerCase())) return false;
  return (await sha256(SAL + clave)) === HUELLA;
}

function sesionVigente(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_SESION) ?? sessionStorage.getItem(CLAVE_SESION) ?? "null") as { h: string; hasta: number } | null;
    return !!s && s.h === HUELLA && s.hasta > Date.now();
  } catch {
    return false;
  }
}

function guardarSesion(recordar: boolean) {
  const v = JSON.stringify({ h: HUELLA, hasta: Date.now() + DIAS * 864e5 });
  try {
    (recordar ? localStorage : sessionStorage).setItem(CLAVE_SESION, v);
  } catch {
    /* modo privado: la sesión dura lo que dure la pestaña */
  }
}

export function cerrarSesion() {
  try {
    localStorage.removeItem(CLAVE_SESION);
    sessionStorage.removeItem(CLAVE_SESION);
  } catch {
    /* nada */
  }
  location.reload();
}

/**
 * Muestra la pantalla de carga. Si hay sesión, se va sola cuando el mapa está listo;
 * si no, pide usuario y contraseña. El mapa se carga detrás mientras tanto.
 */
export function iniciarAcceso(listo: Promise<unknown>): Promise<void> {
  const el = document.createElement("div");
  el.id = "acceso";
  el.className = "acceso";
  el.innerHTML = `<div class="acceso__fondo" aria-hidden="true"></div>
  <div class="acceso__caja">
    <div class="acceso__ojo" aria-hidden="true"><span></span></div>
    <h1>OJO_DE_DIOS <small>// BOGOTÁ</small></h1>
    <p class="acceso__estado" id="acceso-estado">Cargando relieve, capas y lugares…</p>
    <div class="acceso__barra"><i></i></div>
    <form class="acceso__form" id="acceso-form" hidden autocomplete="on">
      <label>Usuario<input name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" required /></label>
      <label>Contraseña<input name="clave" type="password" autocomplete="current-password" required /></label>
      <label class="acceso__recordar"><input type="checkbox" name="recordar" checked /> Recordarme ${DIAS} días en este dispositivo</label>
      <button class="boton" type="submit">Entrar</button>
      <p class="acceso__error" id="acceso-error" role="alert"></p>
    </form>
  </div>`;
  document.body.appendChild(el);
  const estado = el.querySelector<HTMLElement>("#acceso-estado")!;
  const barra = el.querySelector<HTMLElement>(".acceso__barra")!;
  const form = el.querySelector<HTMLFormElement>("#acceso-form")!;
  const error = el.querySelector<HTMLElement>("#acceso-error")!;

  let mapaListo = false;
  void listo.then(() => {
    mapaListo = true;
    barra.classList.add("llena");
    estado.textContent = form.hidden ? "Listo" : "Mapa listo · ingresa para entrar";
  });

  const salir = () =>
    new Promise<void>((ok) => {
      el.classList.add("sale");
      setTimeout(() => {
        el.remove();
        ok();
      }, 650);
    });

  if (sesionVigente()) return salir();

  return new Promise<void>((ok) => {
    {
      form.hidden = false;
      el.classList.add("pide");
      estado.textContent = mapaListo ? "Mapa listo · ingresa para entrar" : "Cargando el mapa detrás… ya puedes ingresar";
      form.querySelector<HTMLInputElement>("input[name=usuario]")?.focus({ preventScroll: true });
    }
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const d = new FormData(form);
      const boton = form.querySelector("button")!;
      boton.disabled = true;
      if (await credencialesValidas(String(d.get("usuario") ?? ""), String(d.get("clave") ?? ""))) {
        guardarSesion(d.get("recordar") === "on");
        error.textContent = "";
        estado.textContent = "Acceso concedido";
        await salir();
        ok();
      } else {
        boton.disabled = false;
        error.textContent = "Usuario o contraseña incorrectos";
        form.classList.remove("tiembla");
        void form.offsetWidth;
        form.classList.add("tiembla");
      }
    });
  });
}
