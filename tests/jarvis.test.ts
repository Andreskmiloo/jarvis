import { afterEach, describe, expect, it, vi } from "vitest";
import { ejecutar, Jarvis, MODELO, type Acciones, type Evento } from "../src/jarvis/asistente";

const acciones = (): Acciones & { llamadas: string[] } => {
  const llamadas: string[] = [];
  const r = (n: string) => async (...a: unknown[]) => (llamadas.push(`${n}:${JSON.stringify(a)}`), `ok ${n}`);
  return {
    llamadas,
    volarA: r("volarA"),
    leerZona: r("leerZona"),
    buscarGusto: r("buscarGusto"),
    capa: r("capa"),
    vista: r("vista"),
    misDatos: r("misDatos"),
    planeta: r("planeta"),
    catalogo: () => ({ gustos: ["voley", "helado"], capas: ["incendios"] }),
  } as Acciones & { llamadas: string[] };
};

const respuesta = (content: unknown[], stop_reason: string) =>
  new Response(JSON.stringify({ id: "m", type: "message", role: "assistant", model: MODELO, content, stop_reason, stop_details: null, usage: { input_tokens: 1, output_tokens: 1 } }), {
    headers: { "content-type": "application/json" },
  });

describe("Jarvis", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("ejecuta cada herramienta con sus argumentos", async () => {
    const a = acciones();
    await ejecutar(a, "buscar_gusto", { gusto: "voley", solo_gratis: true });
    await ejecutar(a, "leer_zona", { lugar: "Chapinero" });
    await ejecutar(a, "capa", { capa: "incendios", encendida: false });
    expect(a.llamadas).toEqual(['buscarGusto:["voley",true]', 'leerZona:["Chapinero",null,null]', 'capa:["incendios",false]']);
    await expect(ejecutar(a, "borrar_todo", {})).rejects.toThrow("desconocida");
  });

  it("sin clave pide configurarla", async () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} });
    await expect(new Jarvis(acciones()).preguntar("hola", () => {})).rejects.toThrow("clave");
  });

  it("ciclo: el modelo pide volar, recibe el resultado y responde", async () => {
    vi.stubGlobal("localStorage", { getItem: () => "sk-ant-prueba", setItem() {}, removeItem() {} });
    const cuerpos: { model: string; messages: { role: string; content: unknown }[]; tools: { name: string }[] }[] = [];
    const respuestas = [
      respuesta([{ type: "text", text: "Voy." }, { type: "tool_use", id: "t1", name: "volar_a", input: { lugar: "Usaquén" } }], "tool_use"),
      respuesta([{ type: "text", text: "Listo, estás en Usaquén." }], "end_turn"),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: unknown, init?: RequestInit) => {
        cuerpos.push(JSON.parse(String(init?.body)));
        return respuestas.shift()!;
      }),
    );
    const a = acciones();
    const eventos: Evento[] = [];
    await new Jarvis(a).preguntar("llévame a Usaquén", (e) => eventos.push(e));
    expect(a.llamadas).toEqual(['volarA:["Usaquén"]']);
    expect(eventos.map((e) => e.tipo)).toEqual(["texto", "herramienta", "texto"]);
    expect(cuerpos[0].model).toBe("claude-opus-5-5");
    expect(cuerpos[0].tools.map((t) => t.name)).toContain("buscar_gusto");
    const ultimo = cuerpos[1].messages.at(-1)!;
    expect(ultimo.role).toBe("user");
    expect(JSON.stringify(ultimo.content)).toContain('"tool_use_id":"t1"');
    expect(JSON.stringify(ultimo.content)).toContain("ok volarA");
  });
});
