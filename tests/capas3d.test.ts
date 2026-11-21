import { describe, expect, it } from "vitest";
import { CAJA_CIUDAD, CAPAS_RASTER, SOLO_ANIO, urlImagenCiudad } from "../src/config/capas";

describe("ciudad en capas", () => {
  it("la imagen de cada lámina cubre la caja de Bogotá con su proporción real", () => {
    const c = CAPAS_RASTER.find((x) => x.id === "r-valor")!;
    const u = new URL(urlImagenCiudad(c, 1000));
    const [w, h] = u.searchParams.get("size")!.split(",").map(Number);
    const [x0, y0, x1, y1] = u.searchParams.get("bbox")!.split(",").map(Number);
    expect(w).toBe(1000);
    expect(h / w).toBeCloseTo((y1 - y0) / (x1 - x0), 2);
    expect(x0).toBeCloseTo((CAJA_CIUDAD[0] * 20037508.34) / 180, -1);
    expect(u.searchParams.get("layerDefs")).toBe(JSON.stringify({ 0: SOLO_ANIO }));
    expect(u.searchParams.get("transparent")).toBe("true");
  });

  it("todas las capas raster tienen imagen de ciudad", () => {
    for (const c of CAPAS_RASTER) expect(urlImagenCiudad(c)).toContain(`/${c.servicio}/export?`);
  });
});
