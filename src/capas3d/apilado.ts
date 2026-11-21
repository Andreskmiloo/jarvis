// Vista de la ciudad en capas 3D: cada capa de datos es un plano de imagen que flota
// sobre Bogotá a una altura distinta. Se dibuja con WebGL dentro del mapa (capa custom).
import { MercatorCoordinate, type CustomLayerInterface, type CustomRenderMethodInput, type Map as Mapa } from "maplibre-gl";
import { CAJA_CIUDAD } from "../config/capas";
import { mallaRelieve } from "./relieve";

const NX = 90;
const NY = 140;

export interface DefPlano {
  id: string;
  nombre: string;
  url: string;
  /** Color del marco y la etiqueta. */
  color: string;
  /** Opacidad de la imagen (las de límites van más transparentes para ver lo de abajo). */
  opacidad?: number;
}

interface Plano {
  def: DefPlano;
  tex: WebGLTexture | null;
  estado: "cargando" | "lista" | "error";
  visible: boolean;
  /** 0..1, animado */
  alfa: number;
  etiqueta: HTMLElement;
}

const VS = `#version 300 es
uniform mat4 u_matriz;
uniform vec4 u_rect;
uniform float u_z;
uniform float u_relieve;
in vec2 a_uv;
in float a_h;
in float a_luz;
out vec2 v_uv;
out float v_luz;
void main() {
  v_uv = a_uv;
  v_luz = a_luz;
  gl_Position = u_matriz * vec4(mix(u_rect.xy, u_rect.zw, a_uv), u_z + a_h * u_relieve, 1.0);
}`;

const FS = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform float u_alfa;
uniform float u_lista;
uniform float u_opacidad;
uniform vec3 u_color;
uniform float u_sombra;
in vec2 v_uv;
in float v_luz;
out vec4 color;
void main() {
  vec4 t = u_lista > 0.5 ? texture(u_tex, v_uv) : vec4(0.0);
  // Marco del plano y una retícula muy tenue para que se lea como lámina.
  vec2 d = min(v_uv, 1.0 - v_uv);
  float borde = 1.0 - smoothstep(0.0, 0.006, min(d.x, d.y * 0.65));
  vec2 g = abs(fract(v_uv * vec2(12.0, 18.0)) - 0.5);
  float reticula = (1.0 - smoothstep(0.0, 0.02, min(g.x, g.y))) * 0.05;
  vec4 lamina = vec4(u_color, 0.06 + reticula);
  vec4 c = mix(lamina, vec4(t.rgb, 1.0), t.a * u_opacidad);
  // Sombreado del relieve sobre la lámina.
  c.rgb *= mix(1.0, mix(0.55, 1.25, v_luz), u_sombra);
  c.a = max(c.a, 0.10 * u_sombra * (1.0 - v_luz));
  c = mix(c, vec4(u_color, 1.0), borde);
  color = vec4(c.rgb, c.a * u_alfa);
}`;

function hexARgb(h: string): [number, number, number] {
  const n = parseInt(h.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class Apilado implements CustomLayerInterface {
  readonly id = "capas-3d";
  readonly type = "custom" as const;
  readonly renderingMode = "3d" as const;

  /** Separación entre planos en metros (animada hacia `objetivo`). */
  separacion = 0;
  objetivo = 2400;
  /** Altura del primer plano sobre la sabana. */
  base = 1500;

  private mapa!: Mapa;
  private gl!: WebGL2RenderingContext;
  private prog!: WebGLProgram;
  private buf!: WebGLBuffer;
  private ibuf!: WebGLBuffer;
  private nIndices = 0;
  private conRelieve = false;
  /** Multiplicador del relieve de las láminas (1 = igual que el terreno del mapa). */
  relieve = 1;
  /** Animado de 0 al valor de `relieve` cuando llega la malla. */
  private relieveActual = 0;
  private planos: Plano[] = [];
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private capaEtiquetas: HTMLElement;
  private ultimoCuadro = 0;
  alElegir: (id: string) => void = () => {};

  constructor(defs: DefPlano[], visibles: Set<string>) {
    this.capaEtiquetas = Object.assign(document.createElement("div"), { className: "etiquetas-capas" });
    this.planos = defs.map((def) => {
      const etiqueta = Object.assign(document.createElement("button"), { className: "etiqueta-capa", textContent: def.nombre, title: "Bajar esta capa al suelo" });
      etiqueta.style.setProperty("--c", def.color);
      etiqueta.addEventListener("click", () => this.alElegir(def.id));
      return { def, tex: null, estado: "cargando", visible: visibles.has(def.id), alfa: 0, etiqueta };
    });
  }

  onAdd(mapa: Mapa, gl: WebGL2RenderingContext) {
    this.mapa = mapa;
    this.gl = gl;
    const sh = (tipo: number, src: string) => {
      const s = gl.createShader(tipo)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    this.prog = p;
    for (const u of ["u_matriz", "u_rect", "u_z", "u_tex", "u_alfa", "u_lista", "u_opacidad", "u_color", "u_relieve", "u_sombra"]) this.loc[u] = gl.getUniformLocation(p, u);
    this.buf = gl.createBuffer()!;
    this.ibuf = gl.createBuffer()!;
    this.malla(new Float32Array(NX * NY), new Float32Array(NX * NY).fill(0.5));
    mallaRelieve(CAJA_CIUDAD, NX, NY)
      .then(({ alturas, luz }) => {
        this.malla(alturas, luz);
        this.conRelieve = true;
        this.mapa.triggerRepaint();
      })
      .catch(() => {
        /* sin relieve: las láminas quedan planas */
      });
    mapa.getContainer().append(this.capaEtiquetas);
    this.planos.forEach((pl) => this.capaEtiquetas.append(pl.etiqueta));
    this.planos.filter((pl) => pl.visible).forEach((pl) => this.cargar(pl));
  }

  onRemove() {
    this.capaEtiquetas.remove();
    this.planos.forEach((p) => p.tex && this.gl.deleteTexture(p.tex));
    this.planos.forEach((p) => ((p.tex = null), (p.estado = "cargando")));
  }

  /** Cuadrícula NX × NY: uv, altura y luz por vértice; índices de los triángulos. */
  private malla(alturas: Float32Array, luz: Float32Array) {
    const gl = this.gl;
    const v = new Float32Array(NX * NY * 4);
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        v.set([i / (NX - 1), j / (NY - 1), alturas[k], luz[k]], k * 4);
      }
    const idx = new Uint32Array((NX - 1) * (NY - 1) * 6);
    let p = 0;
    for (let j = 0; j < NY - 1; j++)
      for (let i = 0; i < NX - 1; i++) {
        const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
        idx.set([a, b, c, c, b, d], p);
        p += 6;
      }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, v, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    this.nIndices = idx.length;
  }

  private cargar(pl: Plano) {
    if (pl.tex || pl.estado === "error") return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const gl = this.gl;
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      pl.tex = t;
      pl.estado = "lista";
      this.mapa.triggerRepaint();
    };
    img.onerror = () => {
      pl.estado = "error";
      pl.etiqueta.classList.add("error");
    };
    img.src = pl.def.url;
  }

  mostrar(id: string, visible: boolean) {
    const pl = this.planos.find((p) => p.def.id === id);
    if (!pl) return;
    pl.visible = visible;
    if (visible) this.cargar(pl);
    this.mapa?.triggerRepaint();
  }

  estadoDe(id: string) {
    return this.planos.find((p) => p.def.id === id)?.estado;
  }

  render(gl: WebGL2RenderingContext, op: CustomRenderMethodInput) {
    // Animaciones: separación y aparición de cada plano.
    let animando = false;
    // Interpolación por tiempo: igual de fluida a 20 o a 120 cuadros por segundo.
    const ahora = performance.now();
    const dt = Math.min(100, ahora - (this.ultimoCuadro || ahora - 16));
    this.ultimoCuadro = ahora;
    const k = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 1 - Math.exp(-dt / 140);
    const dif = this.objetivo - this.separacion;
    if (Math.abs(dif) > 1) {
      this.separacion += dif * k;
      animando = true;
    } else this.separacion = this.objetivo;

    const [o, s, e, n] = CAJA_CIUDAD;
    const centro: [number, number] = [(o + e) / 2, (s + n) / 2];
    // Con relieve, la sabana se dibuja a ~2.550 m × exageración; si el relieve aún no cargó, se usa ese valor.
    const terreno = this.mapa.getTerrain();
    const consultado = this.mapa.queryTerrainElevation(centro) ?? 0;
    const suelo = terreno ? Math.max(consultado, 2550 * (terreno.exaggeration ?? 1)) : 0;
    // En MapLibre 6 la matriz de capas custom trabaja en píxeles del mundo (x, y) y metros (z).
    const ws = 512 * 2 ** this.mapa.getZoom();
    const nwM = MercatorCoordinate.fromLngLat([o, n]);
    const seM = MercatorCoordinate.fromLngLat([e, s]);
    const nw = { x: nwM.x * ws, y: nwM.y * ws };
    const se = { x: seM.x * ws, y: seM.y * ws };

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.u_matriz, false, op.modelViewProjectionMatrix as unknown as Float32Array);
    gl.uniform4f(this.loc.u_rect, nw.x, nw.y, se.x, se.y);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibuf);
    const atributos: [string, number, number][] = [["a_uv", 2, 0], ["a_h", 1, 8], ["a_luz", 1, 12]];
    for (const [nombre, n, desp] of atributos) {
      const a = gl.getAttribLocation(this.prog, nombre);
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, n, gl.FLOAT, false, 16, desp);
    }
    // El relieve "crece" al aparecer la malla y sigue la exageración del terreno del mapa.
    const metaRelieve = this.conRelieve ? this.relieve * (terreno?.exaggeration ?? 1.5) : 0;
    if (Math.abs(metaRelieve - this.relieveActual) > 0.005) {
      this.relieveActual += (metaRelieve - this.relieveActual) * k;
      animando = true;
    } else this.relieveActual = metaRelieve;
    gl.uniform1f(this.loc.u_relieve, this.relieveActual);
    gl.uniform1f(this.loc.u_sombra, this.conRelieve ? Math.min(1, this.relieveActual) : 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.loc.u_tex, 0);

    const lienzo = this.mapa.getCanvas();
    const w = lienzo.clientWidth;
    const h = lienzo.clientHeight;
    const m = op.modelViewProjectionMatrix as unknown as number[];
    let nivel = 0;
    for (const pl of this.planos) {
      const meta = pl.visible ? 1 : 0;
      if (Math.abs(pl.alfa - meta) > 0.01) {
        pl.alfa += (meta - pl.alfa) * k;
        animando = true;
      } else pl.alfa = meta;
      if (pl.alfa < 0.01) {
        pl.etiqueta.hidden = true;
        continue;
      }
      const alt = suelo + this.base + nivel * this.separacion;
      nivel += pl.alfa; // los planos que se van ceden su espacio suavemente
      const z = alt;
      gl.uniform1f(this.loc.u_z, z);
      gl.uniform1f(this.loc.u_alfa, pl.alfa);
      gl.uniform1f(this.loc.u_lista, pl.estado === "lista" ? 1 : 0);
      gl.uniform3fv(this.loc.u_color, hexARgb(pl.def.color));
      gl.uniform1f(this.loc.u_opacidad, pl.def.opacidad ?? 0.92);
      if (pl.tex) gl.bindTexture(gl.TEXTURE_2D, pl.tex);
      gl.drawElements(gl.TRIANGLES, this.nIndices, gl.UNSIGNED_INT, 0);

      // Etiqueta anclada al borde oeste de la lámina (lado izquierdo en la vista inicial).
      const x = nw.x, y = (nw.y + se.y) / 2;
      const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
      const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw <= 0) {
        pl.etiqueta.hidden = true;
        continue;
      }
      pl.etiqueta.hidden = false;
      pl.etiqueta.style.opacity = String(pl.alfa);
      pl.etiqueta.style.transform = `translate(${((cx / cw + 1) / 2) * w}px, ${((1 - cy / cw) / 2) * h}px)`;
      pl.etiqueta.classList.toggle("cargando", pl.estado === "cargando");
    }
    gl.depthMask(true);
    if (animando) this.mapa.triggerRepaint();
  }
}
