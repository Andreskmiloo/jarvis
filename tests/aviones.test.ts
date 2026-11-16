import { describe, expect, it } from "vitest";
import { avanzar, leerAviones, urlAviones } from "../src/fuentes/aviones";
import { leerVideodetectores, WEBCAMS_CONOCIDAS } from "../src/fuentes/envivo";
import { flecha, geojsonAviones } from "../src/mapa/aviones";
import { geometriaPines, metrosPorPixel, poligono } from "../src/mapa/pines";

describe("aviones", () => {
  const estado = ["aa490a", "AVA283  ", "United States", 100, 100, -74.2, 4.75, 2758, false, 100, 90, -3, null, 2800, null, false, 0];

  it("lee el formato de OpenSky", () => {
    const [a] = leerAviones({ time: 100, states: [estado, ["x", "", "", 0, 0, null, null, null, true, 0, 0, 0]] });
    expect(a).toMatchObject({ icao: "aa490a", vuelo: "AVA283", lat: 4.75, lng: -74.2, altitud: 2800, enTierra: false, velocidad: 100, rumbo: 90 });
    expect(leerAviones({ states: null })).toEqual([]);
  });

  it("consulta la caja de Bogotá en el puente o en OpenSky", () => {
    expect(urlAviones("https://puente.ejemplo.workers.dev")).toBe("https://puente.ejemplo.workers.dev?lamin=3.9&lomin=-75&lamax=5.5&lomax=-73.2");
    expect(urlAviones("")).toContain("opensky-network.org/api/states/all?");
  });

  it("estima la posición entre lecturas con rumbo y velocidad", () => {
    const [a] = leerAviones({ states: [estado] });
    const p = avanzar(a, 10); // 1 km al este
    expect(p.lat).toBeCloseTo(4.75, 6);
    expect((p.lng - a.lng) * 111_320 * Math.cos((4.75 * Math.PI) / 180)).toBeCloseTo(1000, 0);
    expect(p.altitud).toBe(2770);
    expect(avanzar({ ...a, enTierra: true }, 10)).toEqual({ lat: a.lat, lng: a.lng, altitud: a.altitud });
  });

  it("dibuja una flecha cerrada y una línea al suelo por avión en vuelo", () => {
    const f = flecha(-74, 4.6, 0, 100);
    expect(f[0]).toEqual(f[f.length - 1]);
    const [a] = leerAviones({ states: [estado] });
    const fc = geojsonAviones([a, { ...a, icao: "b", enTierra: true }], 0, 12);
    expect(fc.features).toHaveLength(3);
    expect(fc.features[0].properties).toMatchObject({ nombre: "✈ AVA283", tierra: false, linea: false });
  });
});

describe("pines 3D y cámaras", () => {
  it("tamaño constante en pantalla y dos piezas por pin", () => {
    expect(metrosPorPixel(0, 0)).toBeCloseTo(78271.5, 0);
    expect(metrosPorPixel(4.6, 12) * 2).toBeCloseTo(metrosPorPixel(4.6, 11), 6);
    expect(poligono(-74, 4.6, 10, 6)).toHaveLength(7);
    const fc = geometriaPines([{ lng: -74, lat: 4.6, color: "#f00", escala: 1, props: { nombre: "x" } }], 14);
    expect(fc.features.map((f) => f.properties!.__parte)).toEqual(["tallo", "cabeza"]);
    expect(fc.features[1].properties!.__base).toBe(fc.features[0].properties!.__alto);
  });

  it("videodetectores solo con ubicación y la webcam conocida trae reproductor", () => {
    const v = leerVideodetectores([{ attributes: { OBJECTID: 1, COSTADO: "E", SENTIDO: "S-N", IP_VIDEO: "10.0.0.1" }, geometry: { x: -74.1, y: 4.63 } }]);
    expect(v[0]).toMatchObject({ clase: "detector", lat: 4.63 });
    expect(JSON.stringify(v)).not.toContain("10.0.0.1");
    expect(WEBCAMS_CONOCIDAS[0].video).toMatch(/^https:\/\/webcams\.windy\.com\/webcams\/public\/embed\/player\/\d+\/day$/);
  });
});
