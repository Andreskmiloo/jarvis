// Solo la parte JavaScript de satellite.js (SGP4/SDP4 y transformaciones). Su índice también
// exporta una versión WebAssembly con hilos que el empaquetado web no necesita ni soporta.
export { twoline2satrec } from "../../node_modules/satellite.js/dist/io.js";
export { propagate, gstime } from "../../node_modules/satellite.js/dist/propagation.js";
export { degreesLat, degreesLong, ecfToLookAngles, eciToEcf, eciToGeodetic } from "../../node_modules/satellite.js/dist/transforms.js";
export type { SatRec } from "../../node_modules/satellite.js/dist/propagation/SatRec.js";
