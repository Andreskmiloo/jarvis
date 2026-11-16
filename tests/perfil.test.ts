import { describe, expect, it } from "vitest";
import { esPerfil, fusionar, PERFIL_BASE, type Perfil } from "../src/intereses/perfil";

describe("perfil de gustos", () => {
  it("valida el formato acordado", () => {
    expect(esPerfil(PERFIL_BASE)).toBe(true);
    expect(esPerfil({ version: 1, areas: [{ area: "x", gustos: [{ id: 1 }] }] })).toBe(false);
    expect(esPerfil(null)).toBe(false);
  });

  it("el perfil real manda y conserva etiquetas OSM del base si faltan", () => {
    const real: Perfil = {
      version: 1,
      actualizado: "2026-11-16",
      areas: [
        { area: "comida", gustos: [{ id: "helado", nombre: "Helado", nivel: 5, preferencias: { sabor: "maracuyá" }, osm: [] }] },
        { area: "música", gustos: [{ id: "jazz", nombre: "Jazz", nivel: 4, palabras_clave: ["jazz"] }] },
      ],
    };
    const p = fusionar(PERFIL_BASE, real);
    const comida = p.areas.find((a) => a.area === "comida")!;
    expect(comida.gustos[0].id).toBe("helado"); // nivel 5 primero
    expect(comida.gustos[0].preferencias).toEqual({ sabor: "maracuyá" });
    expect(comida.gustos[0].osm?.length).toBeGreaterThan(0);
    expect(p.areas.some((a) => a.area === "música")).toBe(true);
    expect(p.actualizado).toBe("2026-11-16");
  });
});
