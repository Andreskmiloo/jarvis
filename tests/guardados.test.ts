import { afterEach, describe, expect, it, vi } from "vitest";
import { aLugaresOSM, dentroDeCaja, geojsonGuardados, type ArchivoLugares } from "../src/fuentes/guardados";
import { buscarPhoton, leerPhoton, urlPhoton } from "../src/fuentes/photon";
import { credencialesValidas, HUELLA, sha256 } from "../src/acceso";
import { centro } from "../src/zona/resumen";
import { CAPAS_POI } from "../src/config/capas";
import { PERFIL_BASE } from "../src/intereses/perfil";

const archivo: ArchivoLugares = {
  id: "voley",
  generado: "2026-11-16T00:00:00Z",
  fuente: "OpenStreetMap (Overpass)",
  lugares: [
    { id: "way/1", nombre: "", lat: 4.65, lng: -74.08, deporte: "volleyball", horario: "Mo-Su 06:00-22:00" },
    { id: "oficial/2", nombre: "Centro Comercial Andino", lat: 4.667, lng: -74.053, fuente: "oficial" },
  ],
};

describe("lugares guardados", () => {
  it("convierte a LugarOSM con nombre de respaldo y deporte", () => {
    const [a, b] = aLugaresOSM(archivo);
    expect(a.nombre).toBe("Cancha (volleyball)");
    expect(a.etiquetas.sport).toBe("volleyball");
    expect(b.nombre).toBe("Centro Comercial Andino");
  });

  it("filtra por caja y arma GeoJSON con la fuente", () => {
    expect(dentroDeCaja(archivo.lugares[0], [-74.1, 4.6, -74.0, 4.7])).toBe(true);
    expect(dentroDeCaja(archivo.lugares[0], [-74.0, 4.6, -73.9, 4.7])).toBe(false);
    const fc = geojsonGuardados(archivo);
    expect(fc.features[1].properties!.FUENTE).toBe("Nomenclátor oficial");
    expect((fc.features[0].geometry as GeoJSON.Point).coordinates).toEqual([-74.08, 4.65]);
  });

  it("la capa de centros comerciales sale de archivo y está en el catálogo", () => {
    expect(CAPAS_POI.find((c) => c.id === "centros-comerciales")?.archivo).toBe("centros-comerciales");
    const ids = PERFIL_BASE.areas.flatMap((a) => a.gustos.map((g) => g.id));
    expect(ids).toEqual(expect.arrayContaining(["voley", "centros-comerciales", "helado"]));
  });

  it("pin en el centro de un polígono", () => {
    const c = centro({ type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2]]] });
    expect(c).toEqual([1, 1]);
  });
});

describe("Photon (respaldo)", () => {
  afterEach(() => vi.unstubAllGlobals());
  const d = {
    features: [
      { geometry: { coordinates: [-74.1, 4.6] as [number, number] }, properties: { osm_type: "W", osm_id: 5, name: "Cancha de Voleibol Parque X" } },
      { geometry: { coordinates: [-74.2, 4.7] as [number, number] }, properties: { osm_type: "N", osm_id: 6, name: "Cancha de fútbol", street: "Calle 1" } },
    ],
  };

  it("arma la URL con include y bbox", () => {
    const u = new URL(urlPhoton(["osm.leisure.pitch"], [-74.2, 4.5, -74, 4.8]));
    expect(u.searchParams.getAll("include")).toEqual(["osm.leisure.pitch"]);
    expect(u.searchParams.get("bbox")).toBe("-74.2,4.5,-74,4.8");
  });

  it("filtra por nombre", () => {
    expect(leerPhoton(d, "vole|volley").map((l) => l.id)).toEqual(["way/5"]);
    expect(leerPhoton(d)[1].direccion).toBe("Calle 1");
  });

  it("buscarPhoton usa fetch y falla con mensaje claro", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(d))));
    expect(await buscarPhoton(["osm.leisure.pitch"], [-75, 4, -73, 5])).toHaveLength(2);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    await expect(buscarPhoton(["x"], [-75, 4, -73, 5])).rejects.toThrow("Photon HTTP 503");
  });
});

describe("acceso", () => {
  it("guarda solo la huella, no la contraseña", async () => {
    expect(await sha256("ojo-de-dios:camilo123")).toBe(HUELLA);
  });

  it("valida usuario y contraseña", async () => {
    expect(await credencialesValidas("Camilo ", "camilo123")).toBe(true);
    expect(await credencialesValidas("camilo123", "camilo123")).toBe(true);
    expect(await credencialesValidas("camilo", "otra")).toBe(false);
    expect(await credencialesValidas("pedro", "camilo123")).toBe(false);
  });
});
