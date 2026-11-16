// Mis lugares: se guardan en el navegador (privado) y se pueden exportar/importar en JSON.

export interface MiLugar {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  categoria: string;
  visitado: boolean;
  fecha?: string;
  notas?: string;
  /** Id del gusto del perfil al que pertenece (p.ej. "helado"). */
  gusto?: string;
  /** Id OSM si vino de una búsqueda de intereses. */
  osm?: string;
}

const CLAVE = "ojo-de-dios:lugares:v1";

export interface Almacen {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

const memoria = new Map<string, string>();
const almacenSeguro: Almacen = {
  getItem(k) {
    try {
      return localStorage.getItem(k);
    } catch {
      return memoria.get(k) ?? null;
    }
  },
  setItem(k, v) {
    memoria.set(k, v);
    try {
      localStorage.setItem(k, v);
    } catch {
      /* navegador sin almacenamiento: queda en memoria */
    }
  },
};

export function esLugar(x: unknown): x is MiLugar {
  const l = x as MiLugar;
  return !!l && typeof l.nombre === "string" && Number.isFinite(l.lat) && Number.isFinite(l.lng);
}

export function nuevoId(): string {
  return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export class Lugares {
  private lista: MiLugar[] = [];
  private oyentes = new Set<() => void>();

  constructor(private almacen: Almacen = almacenSeguro, iniciales: MiLugar[] = []) {
    try {
      const raw = this.almacen.getItem(CLAVE);
      const d = raw ? JSON.parse(raw) : [];
      this.lista = Array.isArray(d) ? d.filter(esLugar) : [];
    } catch {
      this.lista = [];
    }
    if (iniciales.length) this.importar(iniciales);
  }

  todos(): MiLugar[] {
    return [...this.lista];
  }

  alCambiar(f: () => void): () => void {
    this.oyentes.add(f);
    return () => this.oyentes.delete(f);
  }

  private guardar() {
    this.almacen.setItem(CLAVE, JSON.stringify(this.lista));
    this.oyentes.forEach((f) => f());
  }

  agregar(l: Omit<MiLugar, "id"> & { id?: string }): MiLugar {
    const existente = l.osm ? this.lista.find((x) => x.osm === l.osm) : undefined;
    if (existente) return existente;
    const nuevo: MiLugar = { ...l, id: l.id ?? nuevoId() };
    this.lista.push(nuevo);
    this.guardar();
    return nuevo;
  }

  actualizar(id: string, cambios: Partial<MiLugar>) {
    const i = this.lista.findIndex((x) => x.id === id);
    if (i < 0) return;
    this.lista[i] = { ...this.lista[i], ...cambios, id };
    this.guardar();
  }

  marcarVisitado(id: string, visitado: boolean) {
    this.actualizar(id, { visitado, fecha: visitado ? new Date().toISOString().slice(0, 10) : undefined });
  }

  eliminar(id: string) {
    this.lista = this.lista.filter((x) => x.id !== id);
    this.guardar();
  }

  porOsm(osm: string): MiLugar | undefined {
    return this.lista.find((x) => x.osm === osm);
  }

  exportar(): string {
    return JSON.stringify(this.lista, null, 2);
  }

  /** Une sin duplicar (mismo id u osm). Devuelve cuántos entraron. */
  importar(datos: unknown): number {
    if (!Array.isArray(datos)) return 0;
    let n = 0;
    for (const d of datos) {
      if (!esLugar(d)) continue;
      if (this.lista.some((x) => x.id === d.id || (d.osm && x.osm === d.osm))) continue;
      this.lista.push({ ...d, id: d.id ?? nuevoId(), categoria: d.categoria ?? "otro", visitado: !!d.visitado });
      n++;
    }
    if (n) this.guardar();
    return n;
  }
}
