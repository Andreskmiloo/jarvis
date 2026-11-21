// Viento animado: partículas que fluyen con el viento real sobre Bogotá.
// Idea de la capa de viento de OSIRIS (simplifaisoul/osiris, MIT), hecha aquí con una malla
// de Open-Meteo (viento a 10 m, ahora) e interpolación bilineal, dibujada en un canvas
// encima del mapa. Se pausa mientras mueves el mapa.
import type { Map as Mapa } from "maplibre-gl";
import { puedeAnimar } from "./ritmo";

export const CAJA_VIENTO = [-74.3, 4.45, -73.95, 4.85] as const; // oeste, sur, este, norte
const NX = 6, NY = 6;

export interface Malla {
  u: number[]; // componente este (m/s), fila por fila de sur a norte
  v: number[]; // componente norte (m/s)
  velocidadMedia: number;
}

/** Puntos de la malla (lat, lng) en el orden en que Open-Meteo los devuelve. */
export function puntosMalla(): { lat: number; lng: number }[] {
  const [o, s, e, n] = CAJA_VIENTO;
  const p: { lat: number; lng: number }[] = [];
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) p.push({ lat: s + ((n - s) * j) / (NY - 1), lng: o + ((e - o) * i) / (NX - 1) });
  return p;
}

/** De velocidad (km/h) y dirección meteorológica (de dónde viene, grados) a componentes u, v (m/s). */
export function componentes(kmh: number, desdeGrados: number): [number, number] {
  const ms = kmh / 3.6, r = (desdeGrados * Math.PI) / 180;
  return [-ms * Math.sin(r), -ms * Math.cos(r)];
}

export function leerMalla(d: { current: { wind_speed_10m: number; wind_direction_10m: number } }[]): Malla {
  const u: number[] = [], v: number[] = [];
  for (const x of d) {
    const [a, b] = componentes(x.current.wind_speed_10m, x.current.wind_direction_10m);
    u.push(a);
    v.push(b);
  }
  const velocidadMedia = d.reduce((s, x) => s + x.current.wind_speed_10m, 0) / Math.max(1, d.length);
  return { u, v, velocidadMedia: Math.round(velocidadMedia) };
}

/** Viento interpolado en un punto (m/s). */
export function vientoEn(m: Malla, lng: number, lat: number): [number, number] {
  const [o, s, e, n] = CAJA_VIENTO;
  const x = Math.max(0, Math.min(NX - 1.0001, ((lng - o) / (e - o)) * (NX - 1)));
  const y = Math.max(0, Math.min(NY - 1.0001, ((lat - s) / (n - s)) * (NY - 1)));
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const k = (ii: number, jj: number) => jj * NX + ii;
  const bl = (a: number[]) => a[k(i, j)] * (1 - fx) * (1 - fy) + a[k(i + 1, j)] * fx * (1 - fy) + a[k(i, j + 1)] * (1 - fx) * fy + a[k(i + 1, j + 1)] * fx * fy;
  return [bl(m.u), bl(m.v)];
}

export async function cargarViento(signal?: AbortSignal): Promise<Malla> {
  const p = puntosMalla();
  const q = new URLSearchParams({ latitude: p.map((x) => x.lat.toFixed(3)).join(","), longitude: p.map((x) => x.lng.toFixed(3)).join(","), current: "wind_speed_10m,wind_direction_10m" });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal });
  if (r.status === 429) throw new Error("Open-Meteo: límite de consultas, intenta en un rato");
  if (!r.ok) throw new Error(`Viento HTTP ${r.status}`);
  return leerMalla(await r.json());
}

export class CapaViento {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private parts: { lng: number; lat: number; edad: number }[] = [];
  private malla: Malla | null = null;
  private raf = 0;
  activa = false;

  constructor(private mapa: Mapa) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "viento";
    mapa.getCanvasContainer().appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d")!;
    const tam = () => {
      const r = devicePixelRatio || 1;
      this.canvas.width = mapa.getCanvas().clientWidth * r;
      this.canvas.height = mapa.getCanvas().clientHeight * r;
      this.ctx.setTransform(r, 0, 0, r, 0, 0);
    };
    tam();
    mapa.on("resize", tam);
    mapa.on("movestart", () => this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height));
  }

  async encender(on: boolean): Promise<Malla | null> {
    this.activa = on;
    cancelAnimationFrame(this.raf);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.hidden = !on;
    if (!on) return null;
    this.malla ??= await cargarViento();
    this.sembrar();
    this.animar();
    return this.malla;
  }

  private sembrar() {
    const [o, s, e, n] = CAJA_VIENTO;
    const N = matchMedia("(max-width: 720px)").matches ? 450 : 900;
    this.parts = Array.from({ length: N }, () => ({ lng: o + Math.random() * (e - o), lat: s + Math.random() * (n - s), edad: Math.random() * 80 }));
  }

  private animar() {
    const [o, s, e, n] = CAJA_VIENTO;
    const paso = () => {
      this.raf = requestAnimationFrame(paso);
      if (!this.malla || !puedeAnimar()) return;
      const c = this.ctx, w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      // Estela: se desvanece lo anterior en vez de borrarlo.
      c.globalCompositeOperation = "destination-in";
      c.fillStyle = "rgba(0,0,0,0.92)";
      c.fillRect(0, 0, w, h);
      c.globalCompositeOperation = "source-over";
      c.lineWidth = 1.2;
      c.strokeStyle = "rgba(190, 230, 255, 0.75)";
      c.beginPath();
      const escala = 0.00004; // grados por (m/s · cuadro): velocidad visual
      for (const p of this.parts) {
        const [u, v] = vientoEn(this.malla, p.lng, p.lat);
        const a = this.mapa.project([p.lng, p.lat]);
        p.lng += u * escala;
        p.lat += v * escala;
        p.edad++;
        const b = this.mapa.project([p.lng, p.lat]);
        if (p.edad > 90 || p.lng < o || p.lng > e || p.lat < s || p.lat > n) {
          p.lng = o + Math.random() * (e - o);
          p.lat = s + Math.random() * (n - s);
          p.edad = 0;
          continue;
        }
        c.moveTo(a.x, a.y);
        c.lineTo(b.x, b.y);
      }
      c.stroke();
    };
    this.raf = requestAnimationFrame(paso);
  }
}
