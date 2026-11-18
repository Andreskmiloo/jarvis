#!/usr/bin/env node
// Barrido rápido y profundo: varias consultas en paralelo + caché + fichas técnicas de los mejores candidatos.
//
// Uso:
//   node ofertas/barrido.js "patineta electrica segway" "patineta electrica kaabo" "patineta niu" \
//        --categoria movilidad --max 10 --excluir "niñ|kids|llanta|repuesto|cargador" \
//        --incluir "patineta|scooter" --fichas 12 --specs "Ah|Wh|W\b|km/h"
//
// Opciones:
//   --categoria   igual que buscar.js (tecnologia, ropa, movilidad, …)
//   --max         resultados por consulta y por tienda (por defecto 8)
//   --incluir     regex: el nombre del producto debe coincidir (opcional)
//   --excluir     regex: descarta accesorios, repuestos, juguetes… (opcional)
//   --min         precio mínimo en COP para descartar accesorios baratos (opcional)
//   --fichas N    abre la ficha de los N candidatos más baratos de tiendas nacionales y extrae especificaciones
//   --specs       regex de las especificaciones a extraer de las fichas (por defecto capacidad/potencia/memoria)
//   --sin-cache   ignora la caché de 6 horas
//
// Salida (stdout): JSON { consultas, trm, total, resultados[], fichas{url: {...}}, tiempos }
// resultados va ordenado por precio final; cada uno trae `consulta` (la que lo encontró).

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const args = process.argv.slice(2);
const CON_VALOR = ['--categoria', '--max', '--incluir', '--excluir', '--min', '--fichas', '--specs'];
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = (n) => args.includes('--' + n);
const consultas = args.filter((a, i) => !a.startsWith('--') && !CON_VALOR.includes(args[i - 1]));
if (!consultas.length) { console.error('Uso: node ofertas/barrido.js "consulta 1" "consulta 2" … [--categoria X] [--fichas N]'); process.exit(1); }

const CAT = opt('categoria', 'todas');
const MAX = opt('max', '8');
const INCLUIR = opt('incluir') ? new RegExp(opt('incluir'), 'i') : null;
const EXCLUIR = opt('excluir') ? new RegExp(opt('excluir'), 'i') : null;
const MIN = parseInt(opt('min', '0'), 10) || 0;
const FICHAS = parseInt(opt('fichas', '0'), 10) || 0;
const SPECS = new RegExp(`[^.|]{0,40}\\d+(?:[.,]\\d+)?\\s?(?:${opt('specs', 'Ah|Wh|mAh|W|GB|MHz|km/h|pulgadas')})\\b[^.|]{0,30}`, 'gi');
const CACHE_DIR = path.join(__dirname, '.cache');
const TTL = 6 * 3600 * 1000;
const t0 = Date.now();
const tiempos = {};

function cacheKey(q) { return crypto.createHash('sha1').update([q, CAT, MAX].join('|')).digest('hex').slice(0, 16); }
function leerCache(q) {
  if (flag('sin-cache')) return null;
  try {
    const f = path.join(CACHE_DIR, cacheKey(q) + '.json');
    if (Date.now() - fs.statSync(f).mtimeMs > TTL) return null;
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch { return null; }
}
function guardarCache(q, d) {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.writeFileSync(path.join(CACHE_DIR, cacheKey(q) + '.json'), JSON.stringify(d)); } catch {}
}

function correr(q) {
  const enCache = leerCache(q);
  if (enCache) { tiempos[q] = 'caché'; return Promise.resolve(enCache); }
  const ini = Date.now();
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(__dirname, 'buscar.js'), q, '--categoria', CAT, '--max', MAX],
      { timeout: 90000, maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => {
        tiempos[q] = ((Date.now() - ini) / 1000).toFixed(1) + ' s';
        try { const d = JSON.parse(stdout); guardarCache(q, d); resolve(d); }
        catch { resolve({ resultados: [], errores: [`${q}: ${err ? err.message.split('\n')[0] : 'sin salida'}`] }); }
      });
  });
}

async function fichas(candidatos) {
  if (!candidatos.length) return {};
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { return {}; }
  const b = await chromium.launch();
  const ctx = await b.newContext({ locale: 'es-CO', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' });
  const out = {};
  const cola = [...candidatos];
  await Promise.all(Array.from({ length: 5 }, async () => {
    while (cola.length) {
      const r = cola.shift();
      const p = await ctx.newPage();
      try {
        await p.goto(r.url, { timeout: 30000, waitUntil: 'domcontentloaded' });
        await p.waitForTimeout(2500);
        const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
        const specs = [...new Set((t.match(SPECS) || []).map((x) => x.trim()))].slice(0, 8);
        const precios = (t.match(/\$\s?[\d.]{6,}/g) || []).slice(0, 3);
        const img = await p.evaluate(() => {
          const og = document.querySelector('meta[property="og:image"]');
          const big = [...document.images].filter((i) => i.naturalWidth >= 300 && !/logo|icon|sprite|\.svg/i.test(i.src))[0];
          return (og && !/logo|\.svg/i.test(og.content) ? og.content : null) || (big ? big.currentSrc || big.src : null);
        });
        out[r.url] = { specs, precios, img };
      } catch (e) { out[r.url] = { error: e.message.split('\n')[0].slice(0, 80) }; }
      await p.close();
    }
  }));
  await b.close();
  return out;
}

(async () => {
  const datos = await Promise.all(consultas.map(correr));
  const vistos = new Set();
  const resultados = [];
  let trm = null;
  const errores = [];
  datos.forEach((d, i) => {
    trm = trm || d.trm;
    errores.push(...(d.errores || []));
    for (const r of d.resultados || []) {
      if (vistos.has(r.url)) continue;
      if (INCLUIR && !INCLUIR.test(r.producto)) continue;
      if (EXCLUIR && EXCLUIR.test(r.producto)) continue;
      if (MIN && r.precio_final_estimado_cop < MIN) continue;
      vistos.add(r.url);
      resultados.push({ ...r, consulta: consultas[i] });
    }
  });
  resultados.sort((a, b) => a.precio_final_estimado_cop - b.precio_final_estimado_cop);
  const t1 = Date.now();
  const candidatos = FICHAS ? resultados.filter((r) => r.origen !== 'internacional').slice(0, FICHAS) : [];
  const fch = await fichas(candidatos);
  tiempos.fichas = FICHAS ? ((Date.now() - t1) / 1000).toFixed(1) + ' s' : 'no';
  tiempos.total = ((Date.now() - t0) / 1000).toFixed(1) + ' s';
  console.log(JSON.stringify({ consultas, categoria: CAT, fecha: new Date().toISOString(), trm, total: resultados.length, resultados, fichas: fch, errores: [...new Set(errores)], tiempos }, null, 2));
})();
