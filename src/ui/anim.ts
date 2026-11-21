// Animaciones cortas y funcionales: confirman que algo cambió, sin tapar datos.
const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Cuenta desde 0 hasta el número del elemento ([data-contar]). */
export function contar(el: HTMLElement, ms = 420) {
  const fin = Number(el.dataset.contar);
  if (!Number.isFinite(fin) || reducido()) return;
  const sufijo = el.dataset.sufijo ?? "";
  const t0 = performance.now();
  const paso = (t: number) => {
    if (!el.isConnected) return;
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(fin * (1 - (1 - k) ** 3)).toLocaleString("es-CO") + sufijo;
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/** Revela los títulos sin alterar su texto accesible. */
export function descifrar(el: HTMLElement, ms = 220) {
  if (reducido()) return;
  el.animate([{ opacity: 0.5, transform: "translateY(3px)" }, { opacity: 1, transform: "none" }], { duration: ms, easing: "ease-out" });
}

/** Aplica las animaciones declaradas dentro de un contenedor recién pintado. */
export function animar(cont: HTMLElement) {
  cont.querySelectorAll<HTMLElement>("[data-contar]").forEach((e) => contar(e));
  cont.querySelectorAll<HTMLElement>("[data-descifrar]").forEach((e) => descifrar(e));
  cont.classList.remove("entra");
  void cont.offsetWidth; // reinicia la animación de entrada
  cont.classList.add("entra");
}
