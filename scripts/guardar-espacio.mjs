// Guarda con la página lo que el navegador no puede pedir directo (sin CORS):
//  - TLE de satélites (CelesTrak; si no responde, SatNOGS) → public/data/espacio/tle.txt
//  - Incendios activos 24 h de NASA FIRMS (VIIRS NOAA-20 y Suomi NPP) en Colombia → incendios.json
// Idea tomada de OSIRIS (simplifaisoul/osiris, MIT), que los sirve desde su backend;
// aquí GitHub Actions hace de backend cada pocas horas.
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const SALIDA = "public/data/espacio";
const COLOMBIA = [-79.5, -4.3, -66.8, 13.5]; // oeste, sur, este, norte

async function texto(url, tiempo = 60) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(tiempo * 1000), headers: { "User-Agent": "ojo-de-dios (GitHub Actions)" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } catch {
    // En redes con proxy, Node no lo usa: curl sí.
    return await new Promise((ok, mal) => execFile("curl", ["-s", "--fail", "--max-time", String(tiempo), url], { maxBuffer: 80e6 }, (e, so) => (e ? mal(e) : ok(so))));
  }
}

mkdirSync(SALIDA, { recursive: true });
const ahora = new Date().toISOString();

// ---------- TLE ----------
const GRUPOS = ["stations", "visual", "weather", "resource", "science", "gnss"];
let tles = "";
let fuenteTle = "";
for (const g of GRUPOS) {
  try {
    const t = await texto(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${g}&FORMAT=tle`, 40);
    if (t.includes("\n1 ")) tles += t.trim() + "\n";
  } catch {
    /* siguiente grupo */
  }
}
if (tles) fuenteTle = "CelesTrak";
else {
  try {
    const d = JSON.parse(await texto("https://db.satnogs.org/api/tle/?format=json", 90));
    tles = d.map((x) => `${x.tle0.replace(/^0 /, "")}\n${x.tle1}\n${x.tle2}`).join("\n") + "\n";
    fuenteTle = "SatNOGS";
  } catch (e) {
    console.log("TLE: sin fuente", e.message);
  }
}
if (tles) {
  // Sin duplicados (mismo número NORAD).
  const vistos = new Set();
  const l = tles.split(/\r?\n/).filter(Boolean);
  let out = "";
  for (let i = 0; i + 2 < l.length + 1; i++) {
    if (l[i + 1]?.startsWith("1 ") && l[i + 2]?.startsWith("2 ")) {
      const id = l[i + 1].slice(2, 7);
      if (!vistos.has(id)) out += `${l[i].trim()}\n${l[i + 1]}\n${l[i + 2]}\n`;
      vistos.add(id);
      i += 2;
    }
  }
  writeFileSync(`${SALIDA}/tle.txt`, out);
  console.log(`TLE: ${vistos.size} satélites · ${fuenteTle}`);
}

// ---------- Incendios (FIRMS) ----------
const FIRMS = [
  ["NOAA-20", "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_South_America_24h.csv"],
  ["Suomi NPP", "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_South_America_24h.csv"],
];
const focos = [];
for (const [sat, url] of FIRMS) {
  try {
    const [cab, ...filas] = (await texto(url, 90)).trim().split(/\r?\n/);
    const c = cab.split(",");
    const i = (n) => c.indexOf(n);
    for (const f of filas) {
      const v = f.split(",");
      const lat = +v[i("latitude")], lng = +v[i("longitude")];
      const [o, s, e, n] = COLOMBIA;
      if (!(lng >= o && lng <= e && lat >= s && lat <= n)) continue;
      const hhmm = v[i("acq_time")].padStart(4, "0");
      focos.push({
        lat: +lat.toFixed(4),
        lng: +lng.toFixed(4),
        cuando: `${v[i("acq_date")]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`,
        frp: +v[i("frp")] || 0, // potencia radiativa (MW)
        confianza: v[i("confidence")],
        satelite: sat,
        dia: v[i("daynight")] === "D",
      });
    }
  } catch (e) {
    console.log(`FIRMS ${sat}: ${e.message}`);
  }
}
writeFileSync(`${SALIDA}/incendios.json`, JSON.stringify({ generado: ahora, fuente: "NASA FIRMS VIIRS 375 m · últimas 24 h", focos }));
console.log(`Incendios en Colombia: ${focos.length}`);
