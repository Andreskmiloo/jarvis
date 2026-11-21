import { describe, expect, it } from "vitest";
import { CAPAS_RASTER, plantillaRaster } from "../src/config/capas";
import { urlConsultaCaja, urlConsultaPunto } from "../src/fuentes/arcgis";
import { coordenadasEnTexto } from "../src/fuentes/nominatim";
import { categoriaAire } from "../src/fuentes/openmeteo";
import { centro, distancia } from "../src/zona/resumen";

describe("fuentes", () => {
  it("consulta ArcGIS por punto con radio en metros", () => {
    const u = new URL(urlConsultaPunto("a/b/MapServer/0", { lng: -74.06, lat: 4.65, radio: 25 }));
    expect(u.pathname).toMatch(/a\/b\/MapServer\/0\/query$/);
    expect(u.searchParams.get("geometry")).toBe("-74.06,4.65");
    expect(u.searchParams.get("distance")).toBe("25");
    expect(u.searchParams.get("f")).toBe("json");
  });

  it("consulta ArcGIS por caja devuelve geojson", () => {
    const u = new URL(urlConsultaCaja("x/MapServer/1", [-74.1, 4.6, -74, 4.7]));
    expect(u.searchParams.get("f")).toBe("geojson");
    expect(u.searchParams.get("geometryType")).toBe("esriGeometryEnvelope");
  });

  it("la plantilla raster deja {bbox-epsg-3857} sin codificar", () => {
    for (const c of CAPAS_RASTER) expect(plantillaRaster(c)).toContain("bbox={bbox-epsg-3857}&");
  });

  it("lee coordenadas y links de Google Maps", () => {
    expect(coordenadasEnTexto("4.6486, -74.0628")).toEqual({ lat: 4.6486, lng: -74.0628 });
    expect(coordenadasEnTexto("https://www.google.com/maps/place/X/@4.6097,-74.0817,17z")).toEqual({ lat: 4.6097, lng: -74.0817 });
    expect(coordenadasEnTexto("Calle 72 # 10-34")).toBeNull();
  });

  it("distancia y centro", () => {
    expect(Math.round(distancia(4.6, -74.1, 4.61, -74.1))).toBeCloseTo(1112, -1);
    expect(centro({ type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] })).toEqual([1, 1]);
  });

  it("categoría de aire", () => {
    expect(categoriaAire(30).texto).toBe("Buena");
    expect(categoriaAire(120).texto).toBe("Dañina para sensibles");
  });
});
