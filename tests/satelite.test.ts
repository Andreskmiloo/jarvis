import { describe, expect, it } from "vitest";
import { analizarEnlace } from "../src/camaras/propias";
import { textoDistancia } from "../src/lugares/casa";
import { BASES, busquedaSentinel, DESDE, fechaModis, opacidadConTope, plantillaGoes, plantillaModis, plantillaSentinel, TOPE_ZOOM } from "../src/mapa/satelite";

describe("satélite", () => {
  it("Sentinel-2: solo 2026, más recientes primero y con pocas nubes", () => {
    const b = busquedaSentinel() as { collections: string[]; filter: { args: { op: string; args: unknown[] }[] }; sortby: { field: string; direction: string }[] };
    expect(b.collections).toEqual(["sentinel-2-l2a"]);
    expect(DESDE.startsWith("2026")).toBe(true);
    expect(b.filter.args.find((a) => a.op === ">=")!.args[1]).toBe(DESDE);
    expect(b.sortby[0]).toEqual({ field: "datetime", direction: "desc" });
    const t = plantillaSentinel("abc");
    expect(t).toContain("/mosaic/abc/tiles/WebMercatorQuad/{z}/{x}/{y}@2x?");
    expect(new URLSearchParams(t.split("?")[1]).get("assets")).toBe("visual");
  });

  it("MODIS usa la fecha de ayer en hora de Bogotá", () => {
    expect(fechaModis(new Date("2026-11-16T04:00:00Z"))).toBe("2026-11-14");
    expect(fechaModis(new Date("2026-11-16T20:00:00Z"))).toBe("2026-11-15");
    expect(plantillaModis("2026-11-15")).toContain("/default/2026-11-15/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg");
  });

  it("GOES pide el último cuadro de 10 min con margen de publicación", () => {
    expect(plantillaGoes(new Date("2026-11-16T12:47:30Z"))).toContain("/default/2026-11-16T12:00:00Z/");
  });
});

describe("satélite nítido", () => {
  it("HD es la primera opción después del mapa", () => {
    expect(BASES.map((b) => b.id).slice(0, 3)).toEqual(["mapa", "esri", "sentinel"]);
  });

  it("cada fuente se apaga antes de pixelarse", () => {
    expect(TOPE_ZOOM).toEqual({ sentinel: 14, modis: 10, goes: 8 });
    expect(opacidadConTope(undefined)).toBe(1);
    expect(opacidadConTope(10)).toEqual(["interpolate", ["linear"], ["zoom"], 8.8, 1, 10, 0]);
  });
});

describe("mi casa", () => {
  it("distancia legible", () => {
    expect(textoDistancia(30)).toBe("estás en tu casa");
    expect(textoDistancia(347)).toBe("a 350 m de tu casa");
    expect(textoDistancia(4321)).toBe("a 4.3 km de tu casa");
    expect(textoDistancia(15500)).toBe("a 16 km de tu casa");
  });
});

describe("cámaras propias", () => {
  it("reconoce YouTube, HLS, imagen y página", () => {
    expect(analizarEnlace("https://www.youtube.com/watch?v=abc123XYZ")).toEqual({ tipo: "youtube", src: expect.stringContaining("youtube-nocookie.com/embed/abc123XYZ") });
    expect(analizarEnlace("https://youtu.be/abc123XYZ")?.tipo).toBe("youtube");
    expect(analizarEnlace("https://www.youtube.com/live/abc123XYZ")?.src).toContain("/embed/abc123XYZ");
    expect(analizarEnlace("https://www.youtube.com/channel/UC123456")?.src).toContain("live_stream?channel=UC123456");
    expect(analizarEnlace("https://cdn.ejemplo.com/cam/index.m3u8")?.tipo).toBe("hls");
    expect(analizarEnlace("https://ejemplo.com/snapshot.jpg")?.tipo).toBe("imagen");
    expect(analizarEnlace("https://ejemplo.com/camara")?.tipo).toBe("pagina");
    expect(analizarEnlace("javascript:alert(1)")).toBeNull();
    expect(analizarEnlace("no es url")).toBeNull();
  });
});
