import { describe, expect, it } from "vitest";
import { leerRuta, textoDuracion, urlRuta } from "../src/fuentes/rutas";
import { leerArticulos, leerFotos } from "../src/fuentes/wiki";
import { compararLluvia, leerRio, nivelRio } from "../src/fuentes/agua";
import { FESTIVOS_2026, leerTrm, picoYPlaca } from "../src/fuentes/indicadores";

describe("cómo llegar (OSRM)", () => {
  it("arma la URL por perfil y lee la ruta", () => {
    expect(urlRuta("bici", { lat: 4.65, lng: -74.06 }, { lat: 4.69, lng: -74.04 })).toContain("/routed-bike/route/v1/driving/-74.060000,4.650000;-74.040000,4.690000");
    const r = leerRuta("pie", { code: "Ok", routes: [{ distance: 5400, duration: 4343, geometry: { coordinates: [[-74.06, 4.65], [-74.05, 4.66]] } }] })!;
    expect(r.linea).toHaveLength(2);
    expect(textoDuracion(r.segundos)).toBe("1 h 12 min");
    expect(textoDuracion(600)).toBe("10 min");
    expect(leerRuta("carro", { code: "NoRoute" })).toBeNull();
  });
});

describe("Wikimedia", () => {
  it("fotos ordenadas por distancia, solo imágenes", () => {
    const f = leerFotos({ query: { pages: {
      "1": { title: "File:Plaza de Bolívar.jpg", imageinfo: [{ thumburl: "https://u/a.jpg", descriptionurl: "https://c/a" }], coordinates: [{ dist: 120.4 }] },
      "2": { title: "File:Mapa.pdf", imageinfo: [{ thumburl: "https://u/b.pdf" }], coordinates: [{ dist: 10 }] },
      "3": { title: "File:Catedral.JPG", imageinfo: [{ thumburl: "https://u/c.JPG", descriptionurl: "https://c/c" }], coordinates: [{ dist: 50 }] },
    } } });
    expect(f.map((x) => x.titulo)).toEqual(["Catedral", "Plaza de Bolívar"]);
  });
  it("artículos con resumen", () => {
    const a = leerArticulos({ query: { pages: { "9": { title: "Chapinero", extract: "Localidad de Bogotá.", coordinates: [{ dist: 300 }] }, "8": { title: "Sin texto" } } } });
    expect(a).toHaveLength(1);
    expect(a[0].url).toContain("Chapinero");
  });
});

describe("agua", () => {
  it("nivel del río frente a la mediana", () => {
    const r = leerRio({ daily: { time: ["2026-11-16", "2026-11-17", "2026-11-18"], river_discharge: [0.5, 1.2, 0.9], river_discharge_median: [0.5, 0.5, 0.5] } }, "2026-11-17")!;
    expect(r.nivel).toBe("muy alto");
    expect(r.proximos).toEqual([{ fecha: "2026-11-18", caudal: 0.9 }]);
    expect(nivelRio(1)).toBe("normal");
    expect(nivelRio(0.5)).toBe("bajo");
  });
  it("lluvia frente a lo normal", () => {
    expect(compararLluvia(27, [100, 120, 137])!.texto).toBe("mucho más seca de lo normal");
    expect(compararLluvia(150, [100, 100])!.relacion).toBe(1.5);
    expect(compararLluvia(10, [])).toBeNull();
  });
});

describe("indicadores", () => {
  it("TRM", () => {
    expect(leerTrm([{ valor: "3316.7", vigenciadesde: "2026-11-14T00:00:00.000", vigenciahasta: "2026-11-17T00:00:00.000" }])).toEqual({ valor: 3316.7, desde: "2026-11-14", hasta: "2026-11-17" });
  });
  it("pico y placa coincide con el calendario oficial de noviembre de 2026", () => {
    // Fechas publicadas por bogota.gov.co
    expect(picoYPlaca("2026-11-03").circulan).toEqual([1, 2, 3, 4, 5]);
    expect(picoYPlaca("2026-11-04").circulan).toEqual([6, 7, 8, 9, 0]);
    expect(picoYPlaca("2026-11-17").restringidas).toEqual([6, 7, 8, 9, 0]);
    expect(picoYPlaca("2026-11-30").circulan).toEqual([6, 7, 8, 9, 0]);
    expect(picoYPlaca("2026-11-14").aplica).toBe(false); // sábado
    expect(picoYPlaca("2026-11-16").aplica).toBe(false); // festivo
    expect(picoYPlaca("2026-11-02").nota).toContain("Festivo");
    expect(FESTIVOS_2026).toHaveLength(18);
  });
});

import { sumarVentanas } from "../src/fuentes/agua";
describe("lluvia por ventanas", () => {
  it("suma solo los días de cada ventana", () => {
    expect(sumarVentanas(["2026-01-01", "2026-01-02", "2026-01-03"], [1, null, 4], [["2026-01-01", "2026-01-02"], ["2026-01-03", "2026-01-03"]])).toEqual([1, 4]);
  });
});
