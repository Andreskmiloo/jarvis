import { describe, expect, it } from "vitest";
import { cieloPara, cruceSol, faseLunar, momento } from "../src/mapa/luz";
import { componentes, leerMalla, puntosMalla, vientoEn } from "../src/mapa/viento";
import { puntajeZona } from "../src/zona/puntaje";
import { decidirAlertas } from "../src/alertas";
import { tipoAvion } from "../src/fuentes/aviones";

describe("luz real", () => {
  it("amanecer y atardecer de Bogotá a mediados de noviembre (~5:40 y ~17:45)", () => {
    const d = new Date("2026-11-17T12:00:00Z");
    const sale = cruceSol(d, true)!, pone = cruceSol(d, false)!;
    const local = (x: Date) => (x.getUTCHours() - 5) * 60 + x.getUTCMinutes();
    expect(local(sale)).toBeGreaterThan(5 * 60 + 25);
    expect(local(sale)).toBeLessThan(5 * 60 + 55);
    expect(local(pone)).toBeGreaterThan(17 * 60 + 30);
    expect(local(pone)).toBeLessThan(18 * 60);
  });
  it("cielo de noche oscuro y de día el del tema", () => {
    const base = { cielo: "#88aadd", horizonte: "#ffffff", niebla: "#dddddd" };
    expect(cieloPara(40, true, base)).toEqual(base);
    expect(cieloPara(-20, false, base).cielo).toBe("#03050b");
    expect(momento(3, true)).toBe("amanecer");
    expect(momento(3, false)).toBe("atardecer");
    expect(momento(-10, false)).toBe("noche");
  });
  it("fase lunar: luna llena del 24 nov 2026 y nueva del 9 nov 2026", () => {
    expect(faseLunar(new Date("2026-11-24T14:53:00Z")).nombre).toBe("Luna llena");
    expect(faseLunar(new Date("2026-11-09T07:02:00Z")).nombre).toBe("Luna nueva");
  });
});

describe("viento", () => {
  it("dirección meteorológica: viento del este empuja hacia el oeste", () => {
    const [u, v] = componentes(36, 90); // 10 m/s desde el este
    expect(u).toBeCloseTo(-10, 5);
    expect(v).toBeCloseTo(0, 5);
  });
  it("malla 6×6 e interpolación", () => {
    const p = puntosMalla();
    expect(p).toHaveLength(36);
    const m = leerMalla(p.map(() => ({ current: { wind_speed_10m: 18, wind_direction_10m: 0 } })));
    expect(m.velocidadMedia).toBe(18);
    const [u, v] = vientoEn(m, -74.1, 4.6);
    expect(u).toBeCloseTo(0, 5);
    expect(v).toBeCloseTo(-5, 5); // desde el norte: hacia el sur
  });
});

describe("puntaje de zona", () => {
  it("excelente sin problemas y baja con aire malo, río alto e incendio", () => {
    expect(puntajeZona({ aqi: 30, probLluvia: 10, temperatura: 16 }).etiqueta).toBe("Excelente");
    const p = puntajeZona({ aqi: 160, rio: "muy alto", incendioKm: 3, probLluvia: 80 });
    expect(p.valor).toBe(20);
    expect(p.etiqueta).toBe("Complicado");
    expect(p.motivos).toContain("aire dañino");
  });
});

describe("alertas cerca de ti", () => {
  it("avisa incendios cercanos sin repetirlos y el río alto en casa", () => {
    const cercanos = () => ({ incendio: { lat: 4.7, lng: -74.1, km: 4, texto: "🔥 Foco" }, evento: { lat: 0, lng: 0, km: 900, texto: "🌀 lejos" } });
    const a = decidirAlertas(
      [
        { nombre: "tu casa", lat: 4.65, lng: -74.06 },
        { nombre: "Cancha X", lat: 4.66, lng: -74.07 },
      ],
      cercanos,
      { nivel: "alto", lat: 4.65, lng: -74.06 },
    );
    expect(a).toHaveLength(2);
    expect(a[0].nivel).toBe("alerta");
    expect(a[0].texto).toContain("tu casa");
    expect(a.some((x) => x.clave === "rio")).toBe(true);
  });
});

describe("aviones por tipo", () => {
  it("clasifica por indicativo", () => {
    expect(tipoAvion("AVA283")).toBe("comercial");
    expect(tipoAvion("TPA4501")).toBe("carga");
    expect(tipoAvion("FAC5748")).toBe("estatal");
    expect(tipoAvion("HK5123")).toBe("privado");
    expect(tipoAvion("N123AB")).toBe("privado");
    expect(tipoAvion("")).toBe("desconocido");
  });
});
