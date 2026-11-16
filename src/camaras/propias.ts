// Cámaras que agrega el usuario: YouTube Live, HLS (.m3u8) o una imagen que se refresca.
// Se guardan solo en este navegador.

export type TipoCamara = "youtube" | "hls" | "imagen" | "pagina";

export interface CamaraPropia {
  id: string;
  nombre: string;
  url: string;
  tipo: TipoCamara;
  lat: number;
  lng: number;
}

const CLAVE = "ojo-de-dios:camaras:v1";

/** Identifica el tipo de enlace y, para YouTube, devuelve la URL de inserción. */
export function analizarEnlace(url: string): { tipo: TipoCamara; src: string } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  let video = "";
  if (host === "youtu.be") video = u.pathname.slice(1);
  else if (host === "youtube.com") video = u.searchParams.get("v") ?? u.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]{6,})/)?.[1] ?? "";
  if (video) return { tipo: "youtube", src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(video)}?autoplay=1&mute=1&playsinline=1` };
  const canal = host === "youtube.com" ? u.pathname.match(/^\/(?:channel\/([\w-]+)|@([\w.-]+))/) : null;
  if (canal?.[1]) return { tipo: "youtube", src: `https://www.youtube-nocookie.com/embed/live_stream?channel=${encodeURIComponent(canal[1])}&autoplay=1&mute=1` };
  if (/\.m3u8$/i.test(u.pathname)) return { tipo: "hls", src: u.href };
  if (/\.(jpe?g|png|webp|gif)$/i.test(u.pathname) || /snapshot|snap\.cgi|image\.cgi/i.test(u.pathname)) return { tipo: "imagen", src: u.href };
  return { tipo: "pagina", src: u.href };
}

export function leerCamaras(): CamaraPropia[] {
  try {
    const d = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(d) ? d.filter((c) => c && typeof c.url === "string" && Number.isFinite(c.lat)) : [];
  } catch {
    return [];
  }
}

export function guardarCamaras(lista: CamaraPropia[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento */
  }
}

let hlsCargado: Promise<void> | null = null;
function cargarHls(): Promise<void> {
  if (!hlsCargado)
    hlsCargado = new Promise((ok, mal) => {
      const s = Object.assign(document.createElement("script"), { src: "https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js", onload: () => ok(), onerror: () => mal(new Error("no cargó hls.js")) });
      document.head.append(s);
    });
  return hlsCargado;
}

/** Monta el reproductor de una cámara dentro de `cont`. Devuelve una función para detenerlo. */
export function reproducir(cont: HTMLElement, c: CamaraPropia): () => void {
  const a = analizarEnlace(c.url);
  if (!a) {
    cont.textContent = "Enlace no válido";
    return () => {};
  }
  if (a.tipo === "youtube" || a.tipo === "pagina") {
    const f = Object.assign(document.createElement("iframe"), { src: a.src, title: c.nombre, loading: "lazy", allow: "autoplay; fullscreen; picture-in-picture", referrerPolicy: "strict-origin-when-cross-origin" });
    f.setAttribute("allowfullscreen", "");
    cont.replaceChildren(f);
    return () => f.remove();
  }
  if (a.tipo === "imagen") {
    const img = Object.assign(document.createElement("img"), { alt: c.nombre });
    const refrescar = () => (img.src = `${a.src}${a.src.includes("?") ? "&" : "?"}t=${Date.now()}`);
    refrescar();
    const t = window.setInterval(refrescar, 5000);
    cont.replaceChildren(img);
    return () => clearInterval(t);
  }
  const v = Object.assign(document.createElement("video"), { muted: true, autoplay: true, playsInline: true, controls: true });
  cont.replaceChildren(v);
  let hls: { destroy(): void } | null = null;
  if (v.canPlayType("application/vnd.apple.mpegurl")) v.src = a.src;
  else
    cargarHls()
      .then(() => {
        const H = (window as unknown as { Hls: { new (): { loadSource(u: string): void; attachMedia(v: HTMLVideoElement): void; destroy(): void }; isSupported(): boolean } }).Hls;
        if (!H.isSupported()) throw new Error("este navegador no reproduce HLS");
        const h = new H();
        h.loadSource(a.src);
        h.attachMedia(v);
        hls = h;
      })
      .catch((e) => (cont.textContent = String(e.message ?? e)));
  return () => {
    hls?.destroy();
    v.pause();
    v.removeAttribute("src");
  };
}
