// Descarga y guarda los lugares de cada gusto para que la app no dependa de servidores en vivo.
// 1) Overpass (OpenStreetMap con etiquetas: deporte, horario, cobro). 2) Si falla, Photon por cuadrantes.
// 3) Centros comerciales: además el nomenclátor oficial de Bogotá (Catastro/IDECA).
// Uso: node scripts/guardar-lugares.mjs [--solo=id1,id2] [--conservar]
//   --solo       solo esos gustos;  --conservar  no repite los que ya tienen datos de Overpass.
//   Vóley, fútbol y baloncesto se sacan de "canchas" (mismas canchas con su etiqueta sport).
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const CAJA = [-74.23, 4.47, -73.99, 4.84]; // oeste, sur, este, norte
const SALIDA = "public/data/lugares";
const catalogo = JSON.parse(readFileSync("src/intereses/catalogo.json", "utf8"));
const ESPEJOS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.osm.jp/api/interpreter"];
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}`));
const SOLO = arg("solo")?.split("=")[1]?.split(",");
const CONSERVAR = !!arg("conservar");
/** Gustos que se derivan de las canchas por su etiqueta sport (una sola consulta para todos). */
const DE_CANCHAS = { voley: ["volleyball", "beachvolleyball"], futbol: ["soccer", "futsal", "micro"], baloncesto: ["basketball"] };
const espera = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** fetch normal; si la red exige proxy (Node no lo usa), se cae a curl. */
async function pedir(url, { cuerpo, tiempo = 60 } = {}) {
  try {
    const r = await fetch(url, { method: cuerpo ? "POST" : "GET", body: cuerpo, signal: AbortSignal.timeout(tiempo * 1000), headers: cuerpo ? { "Content-Type": "application/x-www-form-urlencoded" } : {} });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    const args = ["-s", "--fail", "--max-time", String(tiempo), url];
    if (cuerpo) args.push("--data", cuerpo);
    const out = await new Promise((ok, mal) => execFile("curl", args, { maxBuffer: 50e6 }, (err, so) => (err ? mal(err) : ok(so))));
    return JSON.parse(out);
  }
}

const filtro = (et) => Object.entries(et).map(([k, v]) => `["${k}"="${v}"]`).join("");

function normalizarOSM(el) {
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
  if (lat == null || lng == null) return null;
  const t = el.tags ?? {};
  const fee = (t.fee ?? "").toLowerCase();
  return limpiar({
    id: `${el.type}/${el.id}`,
    nombre: t.name ?? t.brand ?? t.operator ?? "",
    lat: +lat.toFixed(6),
    lng: +lng.toFixed(6),
    deporte: t.sport,
    horario: t.opening_hours,
    cobra: fee === "yes" ? "sí" : fee === "no" ? "no" : undefined,
    acceso: t.access,
    web: t.website ?? t["contact:website"] ?? t["contact:instagram"],
    telefono: t.phone ?? t["contact:phone"],
    direccion: [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(" ") || undefined,
  });
}

function limpiar(o) {
  for (const k of Object.keys(o)) if (o[k] === undefined || o[k] === "") delete o[k];
  return o;
}

async function overpass(combos) {
  const [o, s, e, n] = CAJA;
  const bbox = `(${s},${o},${n},${e})`;
  const q = `[out:json][timeout:90];(${combos.flatMap((c) => [`node${filtro(c)}${bbox};`, `way${filtro(c)}${bbox};`]).join("")});out center tags;`;
  for (const url of ESPEJOS) {
    try {
      const d = await pedir(url, { cuerpo: `data=${encodeURIComponent(q)}`, tiempo: 90 });
      return d.elements.map(normalizarOSM).filter(Boolean);
    } catch {
      /* siguiente espejo */
    }
  }
  return null;
}

/** Photon devuelve máximo 50 por consulta: se parte la ciudad en cuadrantes y se subdivide si se llenan. */
async function photon(include) {
  const vistos = new Map();
  const consultar = async ([o, s, e, n], prof) => {
    const p = new URLSearchParams({ bbox: `${o},${s},${e},${n}`, limit: "50" });
    include.forEach((i) => p.append("include", i));
    let d;
    try {
      d = await pedir(`https://photon.komoot.io/api/?${p}`, { tiempo: 30 });
    } catch {
      return;
    }
    await espera(120); // uso amable del servicio
    for (const f of d.features ?? []) {
      const pr = f.properties;
      const id = `${pr.osm_type === "N" ? "node" : pr.osm_type === "W" ? "way" : "relation"}/${pr.osm_id}`;
      if (!vistos.has(id))
        vistos.set(id, limpiar({ id, nombre: pr.name ?? "", lat: +f.geometry.coordinates[1].toFixed(6), lng: +f.geometry.coordinates[0].toFixed(6), direccion: [pr.street, pr.housenumber].filter(Boolean).join(" ") || undefined }));
    }
    if ((d.features?.length ?? 0) >= 50 && prof < 3) {
      const mx = (o + e) / 2, my = (s + n) / 2;
      for (const c of [[o, s, mx, my], [mx, s, e, my], [o, my, mx, n], [mx, my, e, n]]) await consultar(c, prof + 1);
    }
  };
  const [O, S, E, N] = CAJA, paso = 0.06;
  for (let x = O; x < E; x += paso) for (let y = S; y < N; y += paso) await consultar([x, y, Math.min(E, x + paso), Math.min(N, y + paso)], 0);
  return [...vistos.values()];
}

async function centrosComercialesOficiales() {
  const p = new URLSearchParams({ where: "NGENOMBRE LIKE 'Centro Comercial%' OR NGENOMBRE LIKE 'C.C.%' OR NGENOMBRE LIKE 'Gran Estaci%'", outFields: "NGEIDENTIF,NGENOMBRE", returnGeometry: "true", outSR: "4326", resultRecordCount: "2000", f: "json" });
  const d = await pedir(`https://serviciosgis.catastrobogota.gov.co/arcgis/rest/services/sitiosinteres/nombregeografico/MapServer/0/query?${p}`);
  return d.features.map((f) => ({ id: `oficial/${f.attributes.NGEIDENTIF}`, nombre: f.attributes.NGENOMBRE, lat: +f.geometry.y.toFixed(6), lng: +f.geometry.x.toFixed(6), fuente: "oficial" }));
}

const distancia = (a, b) => Math.hypot((a.lat - b.lat) * 111320, (a.lng - b.lng) * 111000);
const clave = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/centro comercial|c\.c\.|\s+/g, "");

mkdirSync(SALIDA, { recursive: true });
const cachePhoton = new Map();
const indice = [];
const ahora = new Date().toISOString();
const leer = (id) => {
  try {
    return JSON.parse(readFileSync(`${SALIDA}/${id}.json`, "utf8"));
  } catch {
    return null;
  }
};
const gustos = catalogo.areas.flatMap((a) => a.gustos);
// Canchas primero: de ellas salen vóley, fútbol y baloncesto.
gustos.sort((a, b) => (a.id === "canchas" ? -1 : b.id === "canchas" ? 1 : 0));
for (const g of gustos) {
    const previo = leer(g.id);
    if ((SOLO && !SOLO.includes(g.id)) || (CONSERVAR && previo?.fuente?.includes("Overpass"))) {
      if (previo) indice.push({ id: g.id, n: previo.lugares.length, fuente: previo.fuente, generado: previo.generado });
      continue;
    }
    const canchas = leer("canchas");
    if (DE_CANCHAS[g.id] && canchas?.fuente?.includes("Overpass")) {
      const sports = DE_CANCHAS[g.id];
      const lugares = canchas.lugares.filter((l) => (l.deporte ?? "").split(";").some((d) => sports.includes(d.trim())));
      const fuente = "OpenStreetMap (Overpass, canchas con deporte)";
      writeFileSync(`${SALIDA}/${g.id}.json`, JSON.stringify({ id: g.id, generado: canchas.generado, fuente, lugares }));
      indice.push({ id: g.id, n: lugares.length, fuente, generado: canchas.generado });
      console.log(`${g.id}: ${lugares.length} · ${fuente}`);
      continue;
    }
    let lugares = await overpass(g.osm);
    let fuente = "OpenStreetMap (Overpass)";
    if (!lugares && previo?.fuente?.includes("Overpass")) {
      // Overpass no respondió: se conserva la copia buena anterior en vez de bajarla a Photon.
      indice.push({ id: g.id, n: previo.lugares.length, fuente: previo.fuente, generado: previo.generado });
      console.log(`${g.id}: se conserva la copia de ${previo.generado}`);
      continue;
    }
    if (!lugares) {
      const k = g.photon.include.join(",");
      if (!cachePhoton.has(k)) cachePhoton.set(k, await photon(g.photon.include));
      lugares = cachePhoton.get(k);
      if (g.photon.nombre) {
        const re = new RegExp(g.photon.nombre, "i");
        lugares = lugares.filter((l) => re.test(l.nombre));
      }
      fuente = "OpenStreetMap (Photon, sin etiquetas de deporte ni horario)";
    }
    if (g.oficial === "centros-comerciales") {
      try {
        const of = await centrosComercialesOficiales();
        const nuevos = of.filter((x) => !lugares.some((l) => distancia(l, x) < 250 || (l.nombre && clave(l.nombre) === clave(x.nombre))));
        lugares = [...lugares, ...nuevos];
        fuente += " + nomenclátor oficial de Bogotá";
      } catch {
        /* sin oficial */
      }
    }
    writeFileSync(`${SALIDA}/${g.id}.json`, JSON.stringify({ id: g.id, generado: ahora, fuente, lugares }));
    indice.push({ id: g.id, n: lugares.length, fuente, generado: ahora });
    console.log(`${g.id}: ${lugares.length} · ${fuente}`);
  }
writeFileSync(`${SALIDA}/indice.json`, JSON.stringify({ generado: ahora, gustos: indice }, null, 1));
