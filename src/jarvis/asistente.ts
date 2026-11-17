// Jarvis: asistente que entiende lo que pides y mueve el mapa por ti.
// Idea inspirada en el asistente "OI" de OSIRIS (simplifaisoul/osiris, MIT): la clave de IA es
// del propio usuario y vive solo en su navegador. Aquí usa la API de Claude con herramientas
// que son las mismas funciones del mapa (volar, leer zona, buscar gustos, capas, satélite…).
import Anthropic from "@anthropic-ai/sdk";
import { leerClave } from "./clave";
export { guardarClave, leerClave } from "./clave";

export const MODELO = "claude-opus-5-5";
/** Lo que Jarvis puede hacer en el mapa. Cada función devuelve texto para el modelo. */
export interface Acciones {
  volarA(lugar: string): Promise<string>;
  leerZona(lugar?: string, lat?: number, lng?: number): Promise<string>;
  buscarGusto(gusto: string, soloGratis?: boolean): Promise<string>;
  capa(capa: string, encendida: boolean): Promise<string>;
  vista(tipo: string): Promise<string>;
  misDatos(): Promise<string>;
  planeta(lat?: number, lng?: number): Promise<string>;
  ruta(destino: string, modo: string): Promise<string>;
  hoy(): Promise<string>;
  /** Catálogo para el prompt: ids de gustos y de capas. */
  catalogo(): { gustos: string[]; capas: string[] };
}

function herramientas(c: { gustos: string[]; capas: string[] }): Anthropic.Beta.BetaTool[] {
  const t = (name: string, description: string, properties: Record<string, unknown>, required: string[] = []): Anthropic.Beta.BetaTool => ({
    name,
    description,
    // strict solo cuando todos los campos son obligatorios (garantiza entradas válidas)
    ...(required.length === Object.keys(properties).length ? { strict: true } : {}),
    input_schema: { type: "object", properties, required, additionalProperties: false },
  });
  return [
    t("volar_a", "Mueve la cámara con efecto de caída a un lugar de Bogotá (dirección, barrio, localidad, sitio o 'mi casa').", { lugar: { type: "string" } }, ["lugar"]),
    t(
      "leer_zona",
      "Lee los datos públicos de un punto: localidad, UPZ, barrio, estrato, valor del suelo 2026, uso, clima, aire, transporte y qué hay cerca. Da `lugar` o `lat`+`lng`.",
      { lugar: { type: "string" }, lat: { type: "number" }, lng: { type: "number" } },
    ),
    t(
      "buscar_gusto",
      "Muestra en el mapa los lugares de un gusto (canchas, heladerías, café…) y devuelve los más cercanos a la casa del usuario con horario, si cobran y si ya fue.",
      { gusto: { type: "string", enum: c.gustos }, solo_gratis: { type: "boolean" } },
      ["gusto"],
    ),
    t("capa", "Enciende o apaga una capa del mapa.", { capa: { type: "string", enum: c.capas }, encendida: { type: "boolean" } }, ["capa", "encendida"]),
    t(
      "vista",
      "Cambia la vista: 'tierra' (globo completo), 'bogota' (vuelve a la ciudad en 3D), 'satelite_hd', 'satelite_2026', 'mapa' (vectorial), 'capas3d' (ciudad en láminas de datos).",
      { tipo: { type: "string", enum: ["tierra", "bogota", "satelite_hd", "satelite_2026", "mapa", "capas3d"] } },
      ["tipo"],
    ),
    t("mis_datos", "Devuelve la casa del usuario, sus lugares guardados (ya fue / quiere ir) y sus gustos. Úsala antes de recomendar.", {}),
    t(
      "ruta",
      "Calcula y dibuja cómo llegar desde la casa del usuario a un lugar (dirección, barrio o sitio), con tiempo y distancia.",
      { destino: { type: "string" }, modo: { type: "string", enum: ["carro", "bici", "pie"] } },
      ["destino", "modo"],
    ),
    t("hoy", "Datos del día en Bogotá: pico y placa (qué placas no circulan), TRM, lluvia de los últimos 30 días frente a lo normal, nivel del río cerca de la casa y fase lunar.", {}),
    t("planeta", "Qué pasa encima y alrededor de un punto ahora: satélites visibles, paso de la Estación Espacial, incendio y evento natural más cercanos, clima espacial. Sin coordenadas usa la casa.", { lat: { type: "number" }, lng: { type: "number" } }),
  ];
}

const SISTEMA = `Eres Jarvis, el asistente del mapa "Ojo de Dios" de Bogotá de Camilo. Hablas en español de Colombia, en frases cortas y concretas.
Tienes herramientas que mueven el mapa y leen datos públicos reales (Catastro/IDECA 2026, Secretaría de Movilidad, Open-Meteo, OpenStreetMap, NASA, satélites). Úsalas en vez de suponer: si te preguntan por un sitio, vuela allá y léelo; si piden recomendaciones, mira sus datos y busca el gusto.
Responde con lo importante (cifras, nombres, distancias) y di de dónde sale el dato cuando sea relevante. Si una herramienta falla o no hay dato, dilo sin inventar. No uses tablas ni encabezados: es un panel pequeño.`;

export type Evento = { tipo: "texto"; texto: string } | { tipo: "herramienta"; nombre: string; entrada: unknown } | { tipo: "error"; texto: string };

/**
 * Una conversación. `preguntar` corre el ciclo de herramientas hasta que el modelo termina,
 * avisando cada paso para pintarlo en el panel.
 */
export class Jarvis {
  private historial: Anthropic.Beta.BetaMessageParam[] = [];
  constructor(private acciones: Acciones) {}

  reiniciar() {
    this.historial = [];
  }

  async preguntar(texto: string, alEvento: (e: Evento) => void): Promise<void> {
    const clave = leerClave();
    if (!clave) throw new Error("Falta tu clave de la API de Claude");
    // La clave es del usuario y se queda en su navegador; el SDK la envía directo a Anthropic.
    const cliente = new Anthropic({ apiKey: clave, dangerouslyAllowBrowser: true });
    const tools = herramientas(this.acciones.catalogo());
    this.historial.push({ role: "user", content: texto });

    for (let vuelta = 0; vuelta < 12; vuelta++) {
      let r: Anthropic.Beta.BetaMessage;
      try {
        r = await cliente.beta.messages.create({
          model: MODELO,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default", // si el modelo declina por política, la API reintenta con otro modelo
          output_config: { effort: "low" }, // respuestas rápidas para un chat de mapa
          system: SISTEMA,
          tools,
          messages: this.historial,
          cache_control: { type: "ephemeral" },
        });
      } catch (e) {
        this.historial.pop(); // no dejar la pregunta colgada si el pedido falló
        if (e instanceof Anthropic.AuthenticationError) throw new Error("La clave no es válida (revisa que empiece por sk-ant-)");
        if (e instanceof Anthropic.RateLimitError) throw new Error("Demasiadas consultas seguidas; espera un momento");
        if (e instanceof Anthropic.APIConnectionError) throw new Error("Sin conexión con la API de Claude");
        if (e instanceof Anthropic.APIError) throw new Error(`API de Claude: ${e.status} ${e.message}`);
        throw e;
      }
      this.historial.push({ role: "assistant", content: r.content });
      for (const b of r.content) if (b.type === "text" && b.text.trim()) alEvento({ tipo: "texto", texto: b.text });

      if (r.stop_reason === "refusal") return alEvento({ tipo: "error", texto: "No puedo ayudar con eso." });
      if (r.stop_reason === "pause_turn") continue;
      if (r.stop_reason !== "tool_use") return; // end_turn, max_tokens…

      const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const b of r.content) {
        if (b.type !== "tool_use") continue;
        alEvento({ tipo: "herramienta", nombre: b.name, entrada: b.input });
        let contenido: string;
        let error = false;
        try {
          contenido = await ejecutar(this.acciones, b.name, b.input as Record<string, unknown>);
        } catch (e) {
          contenido = `Error: ${e instanceof Error ? e.message : String(e)}`;
          error = true;
        }
        resultados.push({ type: "tool_result", tool_use_id: b.id, content: contenido, is_error: error });
      }
      this.historial.push({ role: "user", content: resultados });
    }
  }
}

export function ejecutar(a: Acciones, nombre: string, x: Record<string, unknown>): Promise<string> {
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  switch (nombre) {
    case "volar_a":
      return a.volarA(String(x.lugar ?? ""));
    case "leer_zona":
      return a.leerZona(x.lugar as string | undefined, num(x.lat), num(x.lng));
    case "buscar_gusto":
      return a.buscarGusto(String(x.gusto), x.solo_gratis === true);
    case "capa":
      return a.capa(String(x.capa), x.encendida !== false);
    case "vista":
      return a.vista(String(x.tipo));
    case "mis_datos":
      return a.misDatos();
    case "ruta":
      return a.ruta(String(x.destino ?? ""), String(x.modo ?? "carro"));
    case "hoy":
      return a.hoy();
    case "planeta":
      return a.planeta(num(x.lat), num(x.lng));
    default:
      return Promise.reject(new Error(`Herramienta desconocida: ${nombre}`));
  }
}
