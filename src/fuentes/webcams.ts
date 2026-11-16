// Webcams públicas en vivo (directorio de Windy). Las cámaras del Distrito (C4,
// Centro de Gestión de Tránsito, fotodetección) no tienen transmisión pública.
// Con una clave gratuita de https://api.windy.com/keys en VITE_WINDY_KEY, las
// webcams aparecen en el mapa con su reproductor; sin clave se abren en Windy.

export interface Webcam {
  id: string;
  titulo: string;
  lat: number;
  lng: number;
  estado: string;
  actualizada: string;
  imagen?: string;
  reproductor?: string;
}

export const CLAVE_WINDY: string = import.meta.env.VITE_WINDY_KEY ?? "";

export function urlWebcams(lat: number, lng: number, radioKm = 30): string {
  const p = new URLSearchParams({ nearby: `${lat.toFixed(4)},${lng.toFixed(4)},${radioKm}`, limit: "50", include: "location,images,player" });
  return `https://api.windy.com/webcams/api/v3/webcams?${p}`;
}

interface RespuestaWindy {
  webcams: {
    webcamId: number;
    title: string;
    status: string;
    lastUpdatedOn?: string;
    location?: { latitude: number; longitude: number };
    images?: { current?: { preview?: string } };
    player?: { live?: string; day?: string };
  }[];
}

export function leerWebcams(d: RespuestaWindy): Webcam[] {
  return (d.webcams ?? [])
    .filter((w) => w.location && w.status === "active")
    .map((w) => ({
      id: String(w.webcamId),
      titulo: w.title,
      lat: w.location!.latitude,
      lng: w.location!.longitude,
      estado: w.status,
      actualizada: w.lastUpdatedOn ?? "",
      imagen: w.images?.current?.preview,
      reproductor: w.player?.live || w.player?.day,
    }));
}

export async function webcamsCerca(lat: number, lng: number, signal?: AbortSignal): Promise<Webcam[]> {
  if (!CLAVE_WINDY) return [];
  const r = await fetch(urlWebcams(lat, lng), { headers: { "x-windy-api-key": CLAVE_WINDY }, signal });
  if (!r.ok) throw new Error(`Windy HTTP ${r.status}`);
  return leerWebcams(await r.json());
}

/** Enlaces a directorios de cámaras en vivo centrados en un punto (no requieren clave). */
export function enlacesEnVivo(lat: number, lng: number): { nombre: string; url: string }[] {
  return [
    { nombre: "Webcams en vivo (Windy)", url: `https://www.windy.com/-Webcams/webcams?${lat.toFixed(3)},${lng.toFixed(3)},13` },
    { nombre: "Webcams (Windfinder)", url: "https://www.windfinder.com/webcams/bogota" },
    { nombre: "Transmisiones en YouTube", url: "https://www.youtube.com/results?search_query=bogot%C3%A1+en+vivo&sp=EgJAAQ%253D%253D" },
  ];
}
