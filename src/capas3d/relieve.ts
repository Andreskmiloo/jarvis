// Malla de alturas de Bogotá para que las láminas sigan el relieve.
// Lee las teselas Terrarium (AWS Terrain Tiles) que ya usa el mapa y las muestrea en una cuadrícula.

const TESELAS = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
/** Altura aproximada de la sabana: lo que queda por encima se levanta, lo de abajo se hunde. */
export const SABANA_M = 2550;

export function lngAX(lng: number, z: number): number {
  return ((lng + 180) / 360) * 2 ** z * 256;
}
export function latAY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z * 256;
}

/** Decodifica un píxel Terrarium a metros. */
export function terrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

function cargarImagen(url: string): Promise<ImageData> {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const ctx = c.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0);
      ok(ctx.getImageData(0, 0, 256, 256));
    };
    img.onerror = () => mal(new Error("tesela de relieve"));
    img.src = url;
  });
}

/**
 * Alturas (m sobre la sabana) en una cuadrícula nx × ny que cubre la caja,
 * de norte a sur y de oeste a este, más un sombreado 0..1 para dar volumen.
 */
export async function mallaRelieve(caja: [number, number, number, number], nx: number, ny: number, z = 11): Promise<{ alturas: Float32Array; luz: Float32Array }> {
  const [o, s, e, n] = caja;
  const x0 = Math.floor(lngAX(o, z) / 256), x1 = Math.floor(lngAX(e, z) / 256);
  const y0 = Math.floor(latAY(n, z) / 256), y1 = Math.floor(latAY(s, z) / 256);
  const teselas = new Map<string, ImageData>();
  await Promise.all(
    Array.from({ length: (x1 - x0 + 1) * (y1 - y0 + 1) }, (_, i) => {
      const tx = x0 + (i % (x1 - x0 + 1));
      const ty = y0 + Math.floor(i / (x1 - x0 + 1));
      return cargarImagen(TESELAS.replace("{z}", String(z)).replace("{x}", String(tx)).replace("{y}", String(ty))).then((d) => teselas.set(`${tx}/${ty}`, d));
    }),
  );
  const alturas = new Float32Array(nx * ny);
  const pxO = lngAX(o, z), pxE = lngAX(e, z), pyN = latAY(n, z), pyS = latAY(s, z);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const px = pxO + ((pxE - pxO) * i) / (nx - 1);
      const py = pyN + ((pyS - pyN) * j) / (ny - 1);
      const t = teselas.get(`${Math.floor(px / 256)}/${Math.floor(py / 256)}`);
      if (!t) continue;
      const k = (Math.min(255, Math.floor(py % 256)) * 256 + Math.min(255, Math.floor(px % 256))) * 4;
      alturas[j * nx + i] = Math.max(-300, terrarium(t.data[k], t.data[k + 1], t.data[k + 2]) - SABANA_M);
    }
  return { alturas, luz: sombreado(alturas, nx, ny, ((pxE - pxO) / (nx - 1)) * metrosPorPixelTesela(n, z)) };
}

function metrosPorPixelTesela(lat: number, z: number): number {
  return (156543.03 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
}

/** Sombreado tipo hillshade con luz del noroeste (0 = sombra, 1 = iluminado). */
export function sombreado(h: Float32Array, nx: number, ny: number, paso: number): Float32Array {
  const luz = new Float32Array(nx * ny);
  const lx = -0.6, ly = -0.6, lz = 0.53; // luz desde el noroeste y arriba
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const a = h[j * nx + Math.max(0, i - 1)], b = h[j * nx + Math.min(nx - 1, i + 1)];
      const c = h[Math.max(0, j - 1) * nx + i], d = h[Math.min(ny - 1, j + 1) * nx + i];
      const dx = (b - a) / (2 * paso), dy = (d - c) / (2 * paso);
      const nz = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      luz[j * nx + i] = Math.max(0, Math.min(1, (-dx * lx - dy * ly + lz) * nz * 1.25));
    }
  return luz;
}
