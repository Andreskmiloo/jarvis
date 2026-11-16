import type { ExpressionSpecification } from "maplibre-gl";

/** Peso interpolado entre dos cuadros consecutivos (0..1 según el tope). */
export function expresionPeso(cuadro: number, total: number): ExpressionSpecification {
  const a = Math.floor(cuadro) % total;
  const b = (a + 1) % total;
  const t = +(cuadro - Math.floor(cuadro)).toFixed(3);
  return ["+", ["*", ["get", `v${a}`], 1 - t], ["*", ["get", `v${b}`], t]];
}

/** Radio en píxeles que equivale a `metros` en cualquier zoom (teselas de 512). */
export function expresionRadio(metros: number): ExpressionSpecification {
  const px0 = metros / 78271.5;
  return ["interpolate", ["exponential", 2], ["zoom"], 0, px0, 22, px0 * 2 ** 22];
}
