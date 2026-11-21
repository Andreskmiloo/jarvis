// Animaciones cortas y funcionales: confirman que algo cambió, sin tapar datos.
const reducido = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const GLIFOS = "アイウエオカキクケコ01ｦｧｨ#<>/\\[]{}=+*";

/** Cuenta desde 0 hasta el número del elemento ([data-contar]). */
export function contar(el: HTMLElement, ms = 420) {
  const fin = Number(el.dataset.contar);
  if (!Number.isFinite(fin) || reducido()) return;
  const sufijo = el.dataset.sufijo ?? "";
  const t0 = performance.now();
  const paso = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = Math.round(fin * (1 - (1 - k) ** 3)).toLocaleString("es-CO") + sufijo;
    if (k < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
}

/** Efecto "descifrado": el texto final aparece de izquierda a derecha ([data-descifrar]). */
export function descifrar(el: HTMLElement, ms = 380) {
  const final = el.textContent ?? "";
  if (!final || reducido()) return;
  const t0 = performance.now();
  const paso = (t: number) => {
    const k = Math.min(1, (t - t0) / ms);
    const listos = Math.floor(final.length * k);
    let s = final.slice(0, listos);
    for (let i = listos; i < final.length; i++) s += final[i] === " " ? " " : GLIFOS[(Math.random() * GLIFOS.length) | 0];
    el.textContent = s;
    if (k < 1) requestAnimationFrame(paso);
    else el.textContent = final;
  };
  requestAnimationFrame(paso);
}

/** Aplica las animaciones declaradas dentro de un contenedor recién pintado. */
export function animar(cont: HTMLElement) {
  cont.querySelectorAll<HTMLElement>("[data-contar]").forEach((e) => contar(e));
  cont.querySelectorAll<HTMLElement>("[data-descifrar]").forEach((e) => descifrar(e));
  cont.classList.remove("entra");
  void cont.offsetWidth; // reinicia la animación de entrada
  cont.classList.add("entra");
}
