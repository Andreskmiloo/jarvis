// Día y noche: la línea donde el Sol está en el horizonte y la cara nocturna del planeta.
// Cálculo astronómico estándar (posición subsolar por fecha), sin red.

const RAD = Math.PI / 180;

/** Punto subsolar (donde el Sol está en el cénit) para un instante. */
export function puntoSubsolar(cuando = new Date()): { lat: number; lng: number } {
  // Días desde J2000.0
  const d = cuando.getTime() / 86400000 - 10957.5;
  const g = (357.529 + 0.98560028 * d) * RAD; // anomalía media
  const q = 280.459 + 0.98564736 * d; // longitud media
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // longitud eclíptica
  const e = (23.439 - 0.00000036 * d) * RAD; // oblicuidad
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const ar = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  // Tiempo sidéreo de Greenwich (grados)
  const gmst = (280.46061837 + 360.98564736629 * d) % 360;
  let lng = ((ar / RAD - gmst) % 360 + 540) % 360 - 180;
  return { lat: dec / RAD, lng };
}

/** Elevación del Sol (grados) en un punto. */
export function elevacionSol(lat: number, lng: number, cuando = new Date()): number {
  const s = puntoSubsolar(cuando);
  const cos = Math.sin(lat * RAD) * Math.sin(s.lat * RAD) + Math.cos(lat * RAD) * Math.cos(s.lat * RAD) * Math.cos((lng - s.lng) * RAD);
  return Math.asin(Math.max(-1, Math.min(1, cos))) / RAD;
}

/**
 * Polígono de la noche: para cada longitud, la latitud donde el Sol está en el
 * horizonte; se cierra hacia el polo que está a oscuras.
 * `depresion` > 0 da el crepúsculo (p. ej. 6° civil, 12° náutico, 18° astronómico).
 */
export function poligonoNoche(cuando = new Date(), depresion = 0): GeoJSON.Feature<GeoJSON.Polygon> {
  const s = puntoSubsolar(cuando);
  const dec = (Math.abs(s.lat) < 0.01 ? 0.01 : s.lat) * RAD;
  const anillo: [number, number][] = [];
  for (let lng = -180; lng <= 180; lng += 2) {
    const H = (lng - s.lng) * RAD; // ángulo horario
    // sin(h) = sin(lat)sin(dec) + cos(lat)cos(dec)cos(H), con h = -depresion
    const a = Math.sin(dec), b = Math.cos(dec) * Math.cos(H), c = Math.sin(-depresion * RAD);
    // a·sin(lat) + b·cos(lat) = c  →  R·sin(lat + φ) = c
    // Dos raíces separadas por ~180°: la válida es la que cae entre -90° y 90°.
    const R = Math.hypot(a, b), phi = Math.atan2(b, a);
    const as = Math.asin(Math.max(-1, Math.min(1, c / R)));
    const norm = (x: number) => Math.atan2(Math.sin(x), Math.cos(x)) / RAD;
    const r1 = norm(as - phi), r2 = norm(Math.PI - as - phi);
    const lat = Math.abs(r1) <= 90 ? r1 : r2;
    anillo.push([lng, Math.max(-85, Math.min(85, lat))]);
  }
  const polo = s.lat > 0 ? -85 : 85; // la noche envuelve el polo sin sol
  return {
    type: "Feature",
    properties: { depresion },
    geometry: { type: "Polygon", coordinates: [[...anillo, [180, polo], [-180, polo], anillo[0]]] },
  };
}
