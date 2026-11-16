// OpenStreetMap vía Overpass: lugares por etiquetas en cualquier caja del mundo.

export type Etiquetas = Record<string, string>;
export type Caja = [oeste: number, sur: number, este: number, norte: number];

/** Bogotá urbana (aprox.). Para el mundo basta con pasar otra caja. */
export const CAJA_BOGOTA: Caja = [-74.23, 4.47, -73.99, 4.84];

export const ESPEJOS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

const escapar = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

/** Un filtro por combinación: todas las etiquetas del objeto deben cumplirse juntas. */
export function filtro(et: Etiquetas): string {
  return Object.entries(et)
    .map(([k, v]) => (v === "*" ? `["${escapar(k)}"]` : `["${escapar(k)}"="${escapar(v)}"]`))
    .join("");
}

export function consulta(combos: Etiquetas[], caja: Caja, timeout = 25): string {
  const [o, s, e, n] = caja;
  const bbox = `(${s},${o},${n},${e})`;
  const partes = combos.flatMap((c) => {
    const f = filtro(c);
    return [`node${f}${bbox};`, `way${f}${bbox};`, `relation${f}${bbox};`];
  });
  return `[out:json][timeout:${timeout}];(${partes.join("")});out center tags 1500;`;
}

export interface LugarOSM {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  etiquetas: Etiquetas;
  horario?: string;
  cobra?: "sí" | "no";
  acceso?: string;
  web?: string;
  telefono?: string;
  direccion?: string;
}

interface ElementoOSM {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Etiquetas;
}

export function normalizar(el: ElementoOSM): LugarOSM | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat === undefined || lng === undefined) return null;
  const t = el.tags ?? {};
  const fee = t.fee?.toLowerCase();
  const dir = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ");
  return {
    id: `${el.type}/${el.id}`,
    nombre: t.name ?? t.brand ?? t.operator ?? "(sin nombre en OSM)",
    lat,
    lng,
    etiquetas: t,
    horario: t.opening_hours,
    cobra: fee === "yes" ? "sí" : fee === "no" ? "no" : undefined,
    acceso: t.access,
    web: t.website ?? t["contact:website"] ?? t["contact:instagram"],
    telefono: t.phone ?? t["contact:phone"],
    direccion: dir || t["addr:full"],
  };
}

export async function buscar(combos: Etiquetas[], caja: Caja = CAJA_BOGOTA, signal?: AbortSignal): Promise<LugarOSM[]> {
  if (!combos.length) return [];
  const body = new URLSearchParams({ data: consulta(combos, caja) });
  let ultimo: unknown;
  for (const url of ESPEJOS) {
    try {
      const r = await fetch(url, { method: "POST", body, signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as { elements: ElementoOSM[] };
      return d.elements.map(normalizar).filter((x): x is LugarOSM => x !== null);
    } catch (e) {
      if (signal?.aborted) throw e;
      ultimo = e;
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error("Overpass no respondió");
}
