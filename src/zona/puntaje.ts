// "Cómo está tu zona hoy": un puntaje simple de 0 a 100 que junta lo que más pesa en el día.
export interface Senales {
  aqi?: number; // índice US de calidad del aire
  probLluvia?: number; // % próximas 3 h
  temperatura?: number; // °C
  uv?: number;
  rio?: "bajo" | "normal" | "alto" | "muy alto";
  incendioKm?: number;
  eventoKm?: number;
  fallasCerca?: number; // semáforos en falla a menos de 500 m
}

export interface Puntaje {
  valor: number;
  etiqueta: string;
  color: string;
  motivos: string[];
}

export function puntajeZona(s: Senales): Puntaje {
  let p = 100;
  const m: string[] = [];
  const restar = (n: number, motivo: string) => {
    p -= n;
    m.push(motivo);
  };
  if (s.aqi !== undefined) {
    if (s.aqi > 150) restar(30, "aire dañino");
    else if (s.aqi > 100) restar(18, "aire malo para sensibles");
    else if (s.aqi > 50) restar(7, "aire moderado");
  }
  if (s.probLluvia !== undefined) {
    if (s.probLluvia >= 70) restar(15, "lluvia muy probable");
    else if (s.probLluvia >= 40) restar(7, "puede llover");
  }
  if (s.temperatura !== undefined && (s.temperatura < 7 || s.temperatura > 26)) restar(6, s.temperatura < 7 ? "mucho frío" : "calor");
  if (s.uv !== undefined && s.uv >= 8) restar(6, "UV muy alto");
  if (s.rio === "muy alto") restar(20, "río muy por encima de lo normal");
  else if (s.rio === "alto") restar(9, "río alto");
  if (s.incendioKm !== undefined && s.incendioKm < 10) restar(15, `incendio a ${s.incendioKm.toFixed(0)} km`);
  if (s.eventoKm !== undefined && s.eventoKm < 50) restar(10, `evento natural a ${s.eventoKm.toFixed(0)} km`);
  if (s.fallasCerca) restar(Math.min(12, 4 * s.fallasCerca), `${s.fallasCerca} semáforo${s.fallasCerca > 1 ? "s" : ""} en falla cerca`);
  const valor = Math.max(0, Math.min(100, Math.round(p)));
  const [etiqueta, color] = valor >= 85 ? ["Excelente", "#2ecc71"] : valor >= 70 ? ["Bien", "#9ccc65"] : valor >= 50 ? ["Regular", "#ffb300"] : ["Complicado", "#ff5252"];
  return { valor, etiqueta, color, motivos: m };
}
