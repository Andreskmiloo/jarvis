import { describe, expect, it } from "vitest";
import { CAJA_BOGOTA, consulta, filtro, normalizar } from "../src/fuentes/overpass";

describe("overpass", () => {
  it("arma filtros con todas las etiquetas juntas", () => {
    expect(filtro({ leisure: "pitch", sport: "volleyball" })).toBe('["leisure"="pitch"]["sport"="volleyball"]');
    expect(filtro({ name: "*" })).toBe('["name"]');
  });

  it("consulta nodos, vías y relaciones dentro de la caja (sur,oeste,norte,este)", () => {
    const q = consulta([{ amenity: "ice_cream" }], CAJA_BOGOTA);
    expect(q).toContain('node["amenity"="ice_cream"](4.47,-74.23,4.84,-73.99);');
    expect(q).toContain("way[");
    expect(q).toContain("relation[");
    expect(q).toContain("out center tags");
  });

  it("escapa comillas", () => {
    expect(filtro({ name: 'a"b' })).toBe('["name"="a\\"b"]');
  });

  it("normaliza horario, cobro y centro de vías", () => {
    const l = normalizar({ type: "way", id: 5, center: { lat: 4.6, lon: -74.1 }, tags: { name: "Cancha", fee: "no", opening_hours: "Mo-Su 06:00-18:00", access: "yes" } });
    expect(l).toMatchObject({ id: "way/5", nombre: "Cancha", lat: 4.6, lng: -74.1, cobra: "no", horario: "Mo-Su 06:00-18:00", acceso: "yes" });
    expect(normalizar({ type: "node", id: 1 })).toBeNull();
  });
});
