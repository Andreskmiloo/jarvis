#!/usr/bin/env node
// Valida data/perfil-gustos.json contra el formato acordado (sin dependencias).
// Uso: node scripts/validar-perfil.mjs [ruta]
import { readFileSync } from "node:fs";

const ruta = process.argv[2] ?? new URL("../data/perfil-gustos.json", import.meta.url);
const errores = [];
const err = (p, m) => errores.push(`${p}: ${m}`);
const esObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const esStr = (v) => typeof v === "string";
const soloClaves = (o, permitidas, p) => {
  for (const k of Object.keys(o)) if (!permitidas.includes(k)) err(p, `clave no permitida "${k}"`);
};
const requiere = (o, claves, p) => {
  for (const k of claves) if (!(k in o)) err(p, `falta "${k}"`);
};

let datos;
try {
  datos = JSON.parse(readFileSync(ruta, "utf8"));
} catch (e) {
  console.error(`No se pudo leer/parsear ${ruta}: ${e.message}`);
  process.exit(1);
}

if (!esObj(datos)) err("$", "debe ser un objeto");
else {
  requiere(datos, ["version", "actualizado", "areas"], "$");
  soloClaves(datos, ["version", "actualizado", "areas"], "$");
  if (datos.version !== 1) err("$.version", "debe ser 1");
  if (!esStr(datos.actualizado) || !/^\d{4}-\d{2}-\d{2}$/.test(datos.actualizado) || isNaN(Date.parse(datos.actualizado)))
    err("$.actualizado", "debe ser fecha YYYY-MM-DD");
  if (!Array.isArray(datos.areas)) err("$.areas", "debe ser lista");
  else {
    const ids = new Set();
    datos.areas.forEach((a, i) => {
      const pa = `$.areas[${i}]`;
      if (!esObj(a)) return err(pa, "debe ser objeto");
      requiere(a, ["area", "gustos"], pa);
      soloClaves(a, ["area", "gustos"], pa);
      if (!esStr(a.area) || !a.area) err(`${pa}.area`, "texto no vacío");
      if (!Array.isArray(a.gustos)) return err(`${pa}.gustos`, "debe ser lista");
      a.gustos.forEach((g, j) => {
        const pg = `${pa}.gustos[${j}]`;
        if (!esObj(g)) return err(pg, "debe ser objeto");
        const claves = ["id", "nombre", "nivel", "preferencias", "osm", "palabras_clave", "lugares_conocidos", "notas"];
        requiere(g, claves, pg);
        soloClaves(g, claves, pg);
        if (!esStr(g.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.id)) err(`${pg}.id`, "slug en minúsculas sin tildes");
        else if (ids.has(g.id)) err(`${pg}.id`, `id duplicado "${g.id}"`);
        else ids.add(g.id);
        if (!esStr(g.nombre) || !g.nombre) err(`${pg}.nombre`, "texto no vacío");
        if (!Number.isInteger(g.nivel) || g.nivel < 1 || g.nivel > 5) err(`${pg}.nivel`, "entero 1-5");
        if (!esObj(g.preferencias)) err(`${pg}.preferencias`, "debe ser objeto");
        else for (const [k, v] of Object.entries(g.preferencias)) {
          const ok = ["string", "number", "boolean"].includes(typeof v) || (Array.isArray(v) && v.every(esStr));
          if (!ok) err(`${pg}.preferencias.${k}`, "texto, número, booleano o lista de textos");
        }
        if (!Array.isArray(g.osm)) err(`${pg}.osm`, "debe ser lista");
        else g.osm.forEach((t, k) => {
          if (!esObj(t) || !Object.keys(t).length || !Object.values(t).every(esStr))
            err(`${pg}.osm[${k}]`, "objeto no vacío de etiquetas texto→texto");
        });
        if (!Array.isArray(g.palabras_clave) || !g.palabras_clave.every(esStr)) err(`${pg}.palabras_clave`, "lista de textos");
        if (Array.isArray(g.osm) && !g.osm.length && Array.isArray(g.palabras_clave) && !g.palabras_clave.length)
          err(pg, "si osm está vacío, llena palabras_clave");
        if (!Array.isArray(g.lugares_conocidos)) err(`${pg}.lugares_conocidos`, "debe ser lista");
        else g.lugares_conocidos.forEach((l, k) => {
          const pl = `${pg}.lugares_conocidos[${k}]`;
          if (!esObj(l)) return err(pl, "debe ser objeto");
          const cl = ["nombre", "direccion_o_link", "visitado", "nota"];
          requiere(l, cl, pl);
          soloClaves(l, cl, pl);
          if (!esStr(l.nombre) || !l.nombre) err(`${pl}.nombre`, "texto no vacío");
          if (!esStr(l.direccion_o_link)) err(`${pl}.direccion_o_link`, "texto");
          if (typeof l.visitado !== "boolean") err(`${pl}.visitado`, "booleano");
          if (!esStr(l.nota)) err(`${pl}.nota`, "texto");
        });
        if (!esStr(g.notas)) err(`${pg}.notas`, "texto");
      });
    });
  }
}

if (errores.length) {
  console.error(`✗ ${errores.length} error(es):\n` + errores.map((e) => "  - " + e).join("\n"));
  process.exit(1);
}
const n = datos.areas.reduce((s, a) => s + a.gustos.length, 0);
console.log(`✓ perfil válido: ${datos.areas.length} área(s), ${n} gusto(s)`);
