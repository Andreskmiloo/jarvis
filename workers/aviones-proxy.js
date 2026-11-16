// Puente para Ojo de Dios: reenvía la consulta de aviones a OpenSky Network y
// agrega los permisos CORS que OpenSky no da. Despliegue gratis en Cloudflare Workers:
// dash.cloudflare.com → Workers & Pages → Create → Hello World → Edit code → pega esto → Deploy.
const PERMITIDOS = ["https://andreskmiloo.github.io", "http://localhost:5173"];
const CAJA = { lamin: 3.9, lomin: -75.0, lamax: 5.5, lomax: -73.2 }; // Bogotá y alrededores

export default {
  async fetch(req, env, ctx) {
    const origen = req.headers.get("Origin") ?? "";
    const cors = {
      "Access-Control-Allow-Origin": PERMITIDOS.includes(origen) ? origen : PERMITIDOS[0],
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      Vary: "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });

    // Solo la caja de Bogotá: el puente no sirve como proxy abierto.
    const url = `https://opensky-network.org/api/states/all?${new URLSearchParams(Object.entries(CAJA))}`;
    const cache = caches.default;
    const clave = new Request(url);
    let r = await cache.match(clave);
    if (!r) {
      const auth = env.OPENSKY_USER ? { Authorization: "Basic " + btoa(`${env.OPENSKY_USER}:${env.OPENSKY_PASS}`) } : {};
      r = await fetch(url, { headers: auth });
      if (r.ok) {
        r = new Response(r.body, r);
        r.headers.set("Cache-Control", "max-age=10"); // todos comparten la misma lectura por 10 s
        ctx.waitUntil(cache.put(clave, r.clone()));
      }
    }
    const out = new Response(r.body, r);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
