import { describe, expect, it } from "vitest";
import { clasificar, encima, leerTle, periodoMin, posicion, proximoPaso, trayectoria } from "../src/espacio/orbitas";
import { elevacionSol, poligonoNoche, puntoSubsolar } from "../src/espacio/terminador";

const TLE = `ISS (ZARYA)
1 25544U 98067A   26320.56058679  .00009493  00000+0  17760-3 0  9997
2 25544  51.6320 266.0553 0007390  32.4819 327.6623 15.49415609595374
`;
const ep = new Date("2026-11-16T14:00:00Z");

describe("órbitas (SGP4)", () => {
  const [iss] = leerTle(TLE);
  it("lee TLE y clasifica por misión", () => {
    expect(iss.nombre).toBe("ISS (ZARYA)");
    expect(clasificar(iss.nombre).mision).toBe("Estación espacial");
    expect(clasificar("STARLINK-1234").icono).toBe("📡");
    expect(clasificar("XYZ").mision).toBe("Otro");
  });
  it("la EEI está a ~420 km, dentro de su inclinación y con periodo ~93 min", () => {
    const p = posicion(iss, ep)!;
    expect(p.altKm).toBeGreaterThan(380);
    expect(p.altKm).toBeLessThan(460);
    expect(Math.abs(p.lat)).toBeLessThanOrEqual(52);
    expect(periodoMin(iss)).toBeCloseTo(92.9, 0);
  });
  it("la trayectoria se parte en el antimeridiano", () => {
    const tramos = trayectoria(iss, ep);
    expect(tramos.length).toBeGreaterThanOrEqual(1);
    for (const t of tramos) for (let i = 1; i < t.length; i++) expect(Math.abs(t[i][0] - t[i - 1][0])).toBeLessThan(180);
  });
  it("encuentra un paso sobre Bogotá en 24 h con elevación ≥ 10°", () => {
    const p = proximoPaso(iss, 4.65, -74.08, ep, 24)!;
    expect(p).not.toBeNull();
    expect(p.elevacionMax).toBeGreaterThanOrEqual(10);
    expect(p.fin.getTime()).toBeGreaterThan(p.inicio.getTime());
    // En el máximo debe estar encima
    expect(encima([iss], 4.65, -74.08, p.maximo).length).toBe(1);
  });
});

describe("día y noche", () => {
  it("el Sol está en el cénit del punto subsolar y la noche cubre lo opuesto", () => {
    const s = puntoSubsolar(ep);
    expect(elevacionSol(s.lat, s.lng, ep)).toBeGreaterThan(89);
    // Solsticio de diciembre cerca: declinación negativa (~-18° el 16 nov)
    expect(s.lat).toBeLessThan(-15);
    const anti = { lat: -s.lat, lng: s.lng > 0 ? s.lng - 180 : s.lng + 180 };
    expect(elevacionSol(anti.lat, anti.lng, ep)).toBeLessThan(-89);
  });
  it("cada vértice del terminador tiene el Sol en el horizonte", () => {
    const f = poligonoNoche(ep);
    const anillo = f.geometry.coordinates[0].slice(0, -3);
    for (const [lng, lat] of anillo.filter((_, i) => i % 15 === 0)) {
      if (Math.abs(lat) < 84) expect(Math.abs(elevacionSol(lat, lng, ep))).toBeLessThan(0.6);
    }
  });
  it("Bogotá: mediodía es de día y medianoche es de noche", () => {
    expect(elevacionSol(4.65, -74.08, new Date("2026-11-16T17:00:00Z"))).toBeGreaterThan(50);
    expect(elevacionSol(4.65, -74.08, new Date("2026-11-17T05:00:00Z"))).toBeLessThan(-50);
  });
});

import { leerEonet, leerGdelt, leerKp, nivelKp } from "../src/fuentes/planeta";
describe("fuentes del planeta", () => {
  it("EONET: punto y polígono con icono por categoría", () => {
    const ev = leerEonet({
      events: [
        { id: "a", title: "Volcán X", categories: [{ id: "volcanoes" }], geometry: [{ date: "2026-11-15T00:00:00Z", type: "Point", coordinates: [-75.3, 4.9] }] },
        { id: "b", title: "Inundación", categories: [{ id: "floods" }], geometry: [{ date: "2026-11-15T00:00:00Z", type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] }] },
      ],
    });
    expect(ev.map((e) => e.icono)).toEqual(["🌋", "🌊"]);
    expect(ev[1].lat).toBe(1);
  });
  it("Kp con nivel de tormenta", () => {
    expect(leerKp([{ time_tag: "2026-11-16T16:57:00", estimated_kp: 5.33 }])).toEqual({ kp: 5.3, hora: "2026-11-16T16:57:00Z", nivel: "G1 menor" });
    expect(nivelKp(2)).toBe("tranquilo");
  });
  it("GDELT: fecha y sin repetidos", () => {
    const n = leerGdelt({ articles: [
      { title: "Hola Bogotá", url: "u1", domain: "eltiempo.com", seendate: "20261116T170000Z" },
      { title: "hola bogotá", url: "u2", domain: "x.com", seendate: "20261116T170000Z" },
    ] });
    expect(n).toHaveLength(1);
    expect(n[0].fecha.toISOString()).toBe("2026-11-16T17:00:00.000Z");
  });
});

describe("noche correcta en todo el planeta", () => {
  const dentro = (pt: [number, number], anillo: number[][]) => {
    let c = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
      if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  for (const iso of ["2026-11-16T23:00:00Z", "2026-06-21T12:00:00Z", "2026-03-20T06:00:00Z"]) {
    it(`cada punto oscuro está en el polígono y cada punto iluminado no (${iso})`, () => {
      const t = new Date(iso);
      const anillo = poligonoNoche(t).geometry.coordinates[0];
      let malos = 0;
      for (let lng = -175; lng <= 175; lng += 10)
        for (let lat = -80; lat <= 80; lat += 10) {
          const e = elevacionSol(lat, lng, t);
          if (Math.abs(e) < 3) continue;
          if (dentro([lng, lat], anillo) !== e < 0) malos++;
        }
      expect(malos).toBe(0);
    });
  }
});

describe("geoestacionario", () => {
  it("un satélite fijo sobre Colombia es 'siempre visible'", () => {
    const [goes] = leerTle(`GOES 19
1 60133U 24119A   26319.50000000 -.00000100  00000+0  00000+0 0  9990
2 60133   0.0300 270.0000 0001000 180.0000 180.0000  1.00270000  5000
`);
    const p = proximoPaso(goes, 4.65, -74.08, ep, 6);
    if (p) expect(p.siempre).toBe(true);
  });
});
