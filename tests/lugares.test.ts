import { describe, expect, it } from "vitest";
import { Lugares, type Almacen } from "../src/lugares/store";

const almacen = (): Almacen => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe("mis lugares", () => {
  it("agrega, marca visitado y persiste", () => {
    const a = almacen();
    const s = new Lugares(a);
    const l = s.agregar({ nombre: "Casa", lat: 4.6, lng: -74.1, categoria: "casa", visitado: false });
    s.marcarVisitado(l.id, true);
    const s2 = new Lugares(a);
    expect(s2.todos()).toHaveLength(1);
    expect(s2.todos()[0].visitado).toBe(true);
    expect(s2.todos()[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("no duplica lugares OSM ni importaciones", () => {
    const s = new Lugares(almacen());
    s.agregar({ nombre: "Heladería", lat: 4.6, lng: -74.1, categoria: "helado", visitado: false, osm: "node/1" });
    s.agregar({ nombre: "Heladería", lat: 4.6, lng: -74.1, categoria: "helado", visitado: true, osm: "node/1" });
    expect(s.todos()).toHaveLength(1);
    const datos = JSON.parse(s.exportar());
    expect(s.importar(datos)).toBe(0);
    expect(s.importar([{ nombre: "Parque", lat: 4.65, lng: -74.05 }, { basura: true }])).toBe(1);
    expect(s.todos()).toHaveLength(2);
  });
});
