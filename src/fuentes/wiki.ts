// Fotos y memoria del lugar: Wikimedia Commons (fotos con ubicación) y Wikipedia en español
// (artículos cercanos). APIs abiertas con origin=* (CORS), sin clave.
export interface Foto {
  titulo: string;
  miniatura: string;
  pagina: string;
  metros: number;
}
export interface Articulo {
  titulo: string;
  resumen: string;
  url: string;
  metros: number;
  imagen?: string;
}


export function leerFotos(d: { query?: { pages?: Record<string, { title: string; imageinfo?: { thumburl?: string; descriptionurl?: string }[]; coordinates?: { dist?: number }[] }> } }): Foto[] {
  return Object.values(d.query?.pages ?? {})
    .map((p) => ({
      titulo: p.title.replace(/^File:|^Archivo:/, "").replace(/\.[a-z0-9]+$/i, ""),
      miniatura: p.imageinfo?.[0]?.thumburl ?? "",
      pagina: p.imageinfo?.[0]?.descriptionurl ?? "",
      metros: Math.round(p.coordinates?.[0]?.dist ?? 0),
    }))
    .filter((f) => f.miniatura && /\.(jpe?g|png|webp)/i.test(f.miniatura))
    .sort((a, b) => a.metros - b.metros);
}

export async function fotosCerca(lat: number, lng: number, radio = 400, max = 6, signal?: AbortSignal): Promise<Foto[]> {
  const p = new URLSearchParams({
    action: "query", format: "json", origin: "*", generator: "geosearch", ggsnamespace: "6",
    ggscoord: `${lat}|${lng}`, ggsradius: String(radio), ggslimit: String(max * 2),
    prop: "imageinfo|coordinates", iiprop: "url", iiurlwidth: "360", codistancefrompoint: `${lat}|${lng}`,
  });
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?${p}`, { signal });
  if (!r.ok) throw new Error(`Commons HTTP ${r.status}`);
  return leerFotos(await r.json()).slice(0, max);
}

export function leerArticulos(d: { query?: { pages?: Record<string, { title: string; extract?: string; fullurl?: string; thumbnail?: { source: string }; coordinates?: { dist?: number }[] }> } }): Articulo[] {
  return Object.values(d.query?.pages ?? {})
    .filter((p) => p.extract)
    .map((p) => ({ titulo: p.title, resumen: p.extract!.trim(), url: p.fullurl ?? `https://es.wikipedia.org/wiki/${encodeURIComponent(p.title)}`, metros: Math.round(p.coordinates?.[0]?.dist ?? 0), imagen: p.thumbnail?.source }))
    .sort((a, b) => a.metros - b.metros);
}

export async function articulosCerca(lat: number, lng: number, radio = 1200, max = 4, signal?: AbortSignal): Promise<Articulo[]> {
  const p = new URLSearchParams({
    action: "query", format: "json", origin: "*", generator: "geosearch", ggscoord: `${lat}|${lng}`,
    ggsradius: String(radio), ggslimit: String(max), prop: "extracts|info|pageimages|coordinates",
    exintro: "1", explaintext: "1", exsentences: "2", inprop: "url", pithumbsize: "160", codistancefrompoint: `${lat}|${lng}`,
  });
  const r = await fetch(`https://es.wikipedia.org/w/api.php?${p}`, { signal });
  if (!r.ok) throw new Error(`Wikipedia HTTP ${r.status}`);
  return leerArticulos(await r.json());
}

