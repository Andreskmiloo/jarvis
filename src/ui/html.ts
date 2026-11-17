export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function metros(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

let temporizador: number | undefined;
export function aviso(texto: string, ms = 2600) {
  const el = document.getElementById("aviso")!;
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(temporizador);
  temporizador = window.setTimeout(() => (el.hidden = true), ms);
}

export function descargar(nombre: string, contenido: string, tipo = "application/json") {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Convierte cada <h3> y lo que le sigue (hasta el siguiente <h3>/<h2>) en una tarjeta
 * plegable <details>. Solo quedan abiertas las que coinciden con `abiertas`.
 */
export function plegar(cont: HTMLElement, abiertas: RegExp = /^$/) {
  for (const h of [...cont.querySelectorAll<HTMLHeadingElement>(":scope > h3")]) {
    const d = document.createElement("details");
    d.className = "pliegue";
    const titulo = h.textContent?.trim() ?? "";
    d.open = abiertas.test(titulo);
    const s = document.createElement("summary");
    s.innerHTML = h.innerHTML;
    d.appendChild(s);
    let sig = h.nextElementSibling;
    while (sig && !/^H[23]$/.test(sig.tagName) && !sig.classList.contains("pliegue")) {
      const siguiente = sig.nextElementSibling;
      d.appendChild(sig);
      sig = siguiente;
    }
    h.replaceWith(d);
  }
}
