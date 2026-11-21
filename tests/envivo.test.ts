import { describe, expect, it } from "vitest";
import { agregar, centroide, dentro, geojsonCupulas, leerLocalidades } from "../src/calor/cupulas";
import { expresionPeso } from "../src/calor/expresiones";
import { malla, serieMalla, serieSiniestros } from "../src/calor/series";
import { CAPAS_RASTER, CAPAS_ZONA, plantillaRaster, SOLO_ANIO } from "../src/config/capas";
import { urlConsultaPunto } from "../src/fuentes/arcgis";
import { hace, leerCamarasCGT, leerFotodeteccion, leerRadar, leerSemaforos, leerSiniestros, urlSemaforos } from "../src/fuentes/envivo";
import { enlacesEnVivo, leerWebcams } from "../src/fuentes/webcams";

describe("solo datos del año en curso", () => {
  it("valor del suelo y uso se consultan filtrados a 2026", () => {
    for (const id of ["valor", "uso"]) expect(CAPAS_ZONA.find((c) => c.id === id)!.donde).toBe(SOLO_ANIO);
    const u = new URL(urlConsultaPunto("x/MapServer/0", { lng: -74, lat: 4.6, donde: SOLO_ANIO }));
    expect(u.searchParams.get("where")).toBe("ANO >= DATE '2026-01-01'");
    const r = plantillaRaster(CAPAS_RASTER.find((c) => c.id === "r-valor")!);
    expect(new URLSearchParams(r.split("?")[1]).get("layerDefs")).toBe(`{"0":"ANO >= DATE '2026-01-01'"}`);
  });
});

describe("fuentes en vivo", () => {
  it("semáforos: solo pide los que no están en servicio", () => {
    expect(new URL(urlSemaforos()).searchParams.get("where")).toBe("ESTADO <> 'EN SERVICIO'");
    const e = leerSemaforos([
      { attributes: { ID: 1, ESTADO: "EN SERVICIO", LATITUD: 4.6, LONGITUD: -74.1 } },
      { attributes: { ID: 2, ESTADO: "intermitente", DIRECCION: "KR 7 X CL 72", LOCALIDAD: "CHAPINERO", LATITUD: 4.65, LONGITUD: -74.05, TIEMPO_TRANSCURRIDO: "1:00:00" } },
      { attributes: { ID: 3, ESTADO: "APAGADA", LATITUD: 0, LONGITUD: 0 } },
    ]);
    expect(e.enServicio).toBe(1);
    expect(e.fallas).toEqual([expect.objectContaining({ id: 2, estado: "INTERMITENTE", localidad: "CHAPINERO" })]);
  });

  it("siniestros: hora local, más recientes primero, descarta coordenadas fuera de Bogotá", () => {
    const l = leerSiniestros([
      { attributes: { FECHA_HORA_ACC: 1000, HORA_OCURRENCIA_ACC: "07:30:00", GRAVEDAD: "SOLO DAÑOS" }, geometry: { x: -74.1, y: 4.6 } },
      { attributes: { FECHA_HORA_ACC: 2000, HORA_OCURRENCIA_ACC: "23:50:00", GRAVEDAD: "CON HERIDOS" }, geometry: { x: -74.05, y: 4.7 } },
      { attributes: { FECHA_HORA_ACC: 3000 }, geometry: { x: 0, y: 0 } },
    ]);
    expect(l.map((x) => x.hora)).toEqual([23, 7]);
  });

  it("cámaras: tráfico y fotodetección con estado", () => {
    expect(leerCamarasCGT([{ attributes: { ID: "Cam05", DIRECCION: "AK 24 X AC 80", ESTADO: "OPERATIVO", LATITUD: 4.66, LONGITUD: -74.06 } }])[0]).toMatchObject({ id: "Cam05", estado: "OPERATIVO" });
    expect(leerFotodeteccion([{ attributes: { OBJECTID: 9, LATITUD: 0, LONGITUD: 0 } }])).toHaveLength(0);
  });

  it("radar y webcams", () => {
    const r = leerRadar({ host: "https://h", radar: { past: [{ time: 1, path: "/v2/radar/a" }], nowcast: [] } });
    expect(r[0].plantilla).toBe("https://h/v2/radar/a/256/{z}/{x}/{y}/2/1_1.png");
    const w = leerWebcams({ webcams: [{ webcamId: 1, title: "Monserrate", status: "active", location: { latitude: 4.6, longitude: -74.05 }, player: { live: "https://p" } }, { webcamId: 2, title: "Caída", status: "inactive", location: { latitude: 4.6, longitude: -74 } }] });
    expect(w).toEqual([expect.objectContaining({ id: "1", reproductor: "https://p" })]);
    expect(enlacesEnVivo(4.6, -74.05)[0].url).toContain("4.600,-74.050");
    expect(hace(0, 90_000)).toBe("hace 2 min");
  });
});

describe("calor", () => {
  it("interpola entre cuadros y da la vuelta al final", () => {
    expect(expresionPeso(23.5, 24)).toEqual(["+", ["*", ["get", "v23"], 0.5], ["*", ["get", "v0"], 0.5]]);
  });

  it("malla y serie de Open-Meteo arrancan en la hora actual", () => {
    expect(malla(undefined, 2, 3)).toHaveLength(6);
    const s = serieMalla("pm2_5", [{ latitude: 4.6, longitude: -74.1, hourly: { time: ["2026-11-16T09:00", "2026-11-16T10:00"], pm2_5: [10, null] } }], new Date("2026-11-16T15:10:00Z"));
    expect(s.inicio).toBe(1);
    expect(s.puntos[0].valores).toEqual([10, 0]);
  });

  it("cada siniestro calienta su hora y se desvanece en las vecinas", () => {
    const s = serieSiniestros([{ fecha: 1, hora: 0, direccion: "", gravedad: "CON HERIDOS", clase: "", localidad: "", lat: 4.6, lng: -74.1 }], 5);
    expect(s.puntos[0].valores[0]).toBe(2);
    expect(s.puntos[0].valores[23]).toBeGreaterThan(0);
    expect(s.puntos[0].valores[12]).toBe(0);
    expect(s.inicio).toBe(5);
  });

  it("cúpulas por localidad: centroide, conteo dentro y anillos", () => {
    const cuadro = [[-74.1, 4.6], [-74.0, 4.6], [-74.0, 4.7], [-74.1, 4.7], [-74.1, 4.6]];
    expect(centroide(cuadro).centro.map((x) => +x.toFixed(3))).toEqual([-74.05, 4.65]);
    expect(dentro(-74.05, 4.65, cuadro)).toBe(true);
    expect(dentro(-73.9, 4.65, cuadro)).toBe(false);
    const locs = leerLocalidades({ type: "FeatureCollection", features: [{ type: "Feature", properties: { LOCNOMBRE: "PRUEBA" }, geometry: { type: "Polygon", coordinates: [cuadro] } }] });
    const serie = { id: "siniestros", nombre: "", unidad: "", radioM: 1, tope: 1, etiquetas: ["a", "b"], inicio: 0, nota: "", puntos: [{ lng: -74.05, lat: 4.65, valores: [1, 3] }, { lng: -73, lat: 4, valores: [9, 9] }] };
    const v = agregar(serie, locs, "suma");
    expect(v).toEqual([[1, 3]]);
    const { domos, centros } = geojsonCupulas(locs, v, 3);
    expect(domos.features.length).toBe(7);
    expect(centros.features[0].properties).toMatchObject({ v0: 0.333, v1: 1, nombre: "PRUEBA" });
  });
});
