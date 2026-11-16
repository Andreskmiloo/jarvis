#!/usr/bin/env node
// Buscador de ofertas multi-tienda para Colombia (Bogotá).
// Uso: node ofertas/buscar.js "patineta electrica xiaomi" [--categoria tecnologia] [--max 8] [--sin-navegador]
// Imprime JSON con resultados normalizados (precio en COP) en stdout.
//
// Fuentes directas (rápidas y confiables):
//   - Tiendas VTEX con API pública (Nike CO, Arturo Calle, Vélez, Olímpica, Jumbo, ...)
//   - Falabella / Amazon / AliExpress vía navegador headless (Playwright)
//   - Mercado Libre vía API oficial SOLO si existe ML_ACCESS_TOKEN (ver README)
//   - TRM oficial del día (datos.gov.co) para convertir USD -> COP
// Todo lo demás (Alkosto, Ktronix, Shein, Temu, Marketplace, vehículos, cupones) lo cubre
// el agente con búsqueda web siguiendo ofertas/tiendas.yaml.

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes(`--${name}`);
const CON_VALOR = ['--categoria', '--max'];
const query = args.filter((a, i) => !a.startsWith('--') && !CON_VALOR.includes(args[i - 1])).join(' ').trim();
const MAX = parseInt(opt('max', '6'), 10);
const CATEGORIA = opt('categoria', 'todas');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

if (!query) {
  console.error('Uso: node ofertas/buscar.js "<producto>" [--categoria ropa|tecnologia|deportes|hogar|mercado|movilidad] [--max N] [--sin-navegador]');
  process.exit(1);
}

// Tiendas VTEX verificadas (responden sin login). api: 'is' = intelligent-search, 'legacy' = catalog_system
const VTEX = [
  { tienda: 'Nike Colombia', host: 'www.nike.com.co', api: 'is', cats: ['ropa', 'deportes'] },
  { tienda: 'Arturo Calle', host: 'www.arturocalle.com', api: 'is', cats: ['ropa'] },
  { tienda: 'Studio F', host: 'www.studiof.com.co', api: 'is', cats: ['ropa'] },
  { tienda: 'Vélez', host: 'www.velez.com.co', api: 'is', cats: ['ropa'] },
  { tienda: 'Offcorss', host: 'www.offcorss.com', api: 'is', cats: ['ropa'] },
  { tienda: 'Olímpica', host: 'www.olimpica.com', api: 'legacy', cats: ['tecnologia', 'hogar', 'mercado', 'movilidad', 'deportes'] },
  { tienda: 'Jumbo', host: 'www.jumbocolombia.com', api: 'legacy', cats: ['tecnologia', 'hogar', 'mercado', 'movilidad', 'deportes'] },
  { tienda: 'Pepe Ganga', host: 'www.pepeganga.com', api: 'legacy', cats: ['hogar', 'deportes', 'movilidad'] },
  { tienda: 'Panamericana', host: 'www.panamericana.com.co', api: 'legacy', cats: ['tecnologia'] },
];

const usaCat = (cats) => CATEGORIA === 'todas' || cats.includes(CATEGORIA);

async function getJSON(url, headers = {}, timeoutMs = 15000) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function trm() {
  try {
    const d = await getJSON('https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC');
    return { valor: parseFloat(d[0].valor), vigencia: d[0].vigenciadesde.slice(0, 10), fuente: 'Superfinanciera (datos.gov.co)' };
  } catch {
    return { valor: 4000, vigencia: null, fuente: 'estimada (no se pudo consultar)' };
  }
}

function vtexItem(t, p) {
  const offer = p.items?.[0]?.sellers?.[0]?.commertialOffer || {};
  const precio = offer.Price;
  const antes = offer.ListPrice && offer.ListPrice > precio ? offer.ListPrice : null;
  if (!precio) return null;
  const link = p.link?.startsWith('http') ? p.link : `https://${t.host}${p.link || `/${p.linkText}/p`}`;
  return {
    tienda: t.tienda, origen: 'nacional', producto: p.productName, marca: p.brand || null,
    precio_cop: Math.round(precio), precio_antes_cop: antes ? Math.round(antes) : null,
    descuento_pct: antes ? Math.round((1 - precio / antes) * 100) : null,
    disponible: (offer.AvailableQuantity ?? 1) > 0, url: link,
    imagen: p.items?.[0]?.images?.[0]?.imageUrl || null, condicion: 'nuevo',
  };
}

async function buscarVTEX(t) {
  const q = encodeURIComponent(query);
  const url = t.api === 'is'
    ? `https://${t.host}/api/io/_v/api/intelligent-search/product_search/?query=${q}&count=${MAX}&locale=es-CO`
    : `https://${t.host}/api/catalog_system/pub/products/search/?ft=${q}&_from=0&_to=${MAX - 1}`;
  const d = await getJSON(url);
  const prods = t.api === 'is' ? d.products || [] : d;
  return prods.map((p) => vtexItem(t, p)).filter(Boolean);
}

async function buscarMercadoLibre() {
  const token = process.env.ML_ACCESS_TOKEN;
  if (!token) return { omitida: 'Mercado Libre: falta ML_ACCESS_TOKEN (la API exige token). El agente lo cubre por búsqueda web.' };
  const d = await getJSON(`https://api.mercadolibre.com/sites/MCO/search?q=${encodeURIComponent(query)}&limit=${MAX}`, { Authorization: `Bearer ${token}` });
  return (d.results || []).map((r) => ({
    tienda: 'Mercado Libre', origen: r.international_delivery_mode && r.international_delivery_mode !== 'none' ? 'internacional' : 'nacional',
    producto: r.title, precio_cop: Math.round(r.price), precio_antes_cop: r.original_price ? Math.round(r.original_price) : null,
    descuento_pct: r.original_price ? Math.round((1 - r.price / r.original_price) * 100) : null,
    disponible: true, url: r.permalink, imagen: r.thumbnail, condicion: r.condition === 'new' ? 'nuevo' : 'usado',
    envio_gratis: !!r.shipping?.free_shipping, vendedor: r.seller?.nickname || null,
    ubicacion: r.address ? `${r.address.city_name}, ${r.address.state_name}` : null,
  }));
}

const parseCOP = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10) || null;
const parseUSD = (s) => parseFloat(String(s).replace(/[^\d.]/g, '')) || null;

async function navegador(trmValor) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { return { resultados: [], errores: ['Playwright no disponible'] }; }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ locale: 'es-CO', userAgent: UA });
  const q = encodeURIComponent(query);
  const out = []; const errores = [];

  const tareas = [];
  if (usaCat(['tecnologia', 'hogar', 'deportes', 'ropa', 'movilidad'])) tareas.push(['Falabella', async (p) => {
    await p.goto(`https://www.falabella.com.co/falabella-co/search?Ntt=${q}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    const nd = await p.evaluate(() => document.getElementById('__NEXT_DATA__')?.textContent);
    const res = nd ? JSON.parse(nd).props?.pageProps?.results || [] : [];
    return res.slice(0, MAX).map((r) => {
      const precios = r.prices || [];
      const actual = precios.find((x) => !x.crossed) || precios[0];
      const antes = precios.find((x) => x.crossed);
      const pc = actual ? parseCOP(actual.price?.[0]) : null;
      const pa = antes ? parseCOP(antes.price?.[0]) : null;
      return pc && {
        tienda: 'Falabella', origen: 'nacional', producto: r.displayName, marca: r.brand, precio_cop: pc, precio_antes_cop: pa,
        descuento_pct: pa ? Math.round((1 - pc / pa) * 100) : null, precio_tipo: actual.type, vendedor: r.sellerName,
        calificacion: r.rating ? parseFloat(r.rating) : null, url: r.url, imagen: r.mediaUrls?.[0] || null, condicion: 'nuevo', disponible: true,
      };
    }).filter(Boolean);
  }]);

  tareas.push(['Amazon (EE.UU., envío a Colombia)', async (p) => {
    await p.goto(`https://www.amazon.com/s?k=${q}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(2500);
    const items = await p.$$eval('[data-component-type="s-search-result"]', (els) => els.map((e) => ({
      titulo: e.querySelector('h2')?.innerText?.trim(),
      precio: e.querySelector('.a-price .a-offscreen')?.textContent,
      antes: e.querySelector('.a-price.a-text-price .a-offscreen')?.textContent,
      href: e.querySelector('a.a-link-normal[href*="/dp/"]')?.getAttribute('href') || e.querySelector('h2 a, a.a-link-normal')?.getAttribute('href'),
      img: e.querySelector('img.s-image')?.src,
      rating: e.querySelector('.a-icon-alt')?.textContent,
      patrocinado: !!e.querySelector('.puis-sponsored-label-text, .s-sponsored-label-text'),
    })));
    return items.filter((i) => i.titulo && i.precio && !i.patrocinado).slice(0, MAX).map((i) => {
      const usd = parseUSD(i.precio); const usdA = i.antes ? parseUSD(i.antes) : null;
      return {
        tienda: 'Amazon', origen: 'internacional', producto: i.titulo, precio_usd: usd, precio_cop: Math.round(usd * trmValor),
        precio_antes_cop: usdA && usdA > usd ? Math.round(usdA * trmValor) : null,
        descuento_pct: usdA && usdA > usd ? Math.round((1 - usd / usdA) * 100) : null,
        calificacion: i.rating ? parseFloat(i.rating) : null,
        url: i.href ? new URL(i.href, 'https://www.amazon.com').href.split('/ref=')[0] : null, imagen: i.img, condicion: 'nuevo', disponible: true,
      };
    });
  }]);

  tareas.push(['AliExpress', async (p) => {
    await p.goto(`https://www.aliexpress.com/w/wholesale-${q.replace(/%20/g, '-')}.html?shipCountry=CO`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await p.waitForTimeout(5000);
    const items = await p.$$eval('a[href*="/item/"]', (els) => els.map((a) => ({ txt: a.innerText.replace(/\s+/g, ' '), href: a.href, img: a.querySelector('img')?.src })));
    const vistos = new Set();
    return items.map((i) => {
      const m = i.txt.match(/^(.*?)(?:\s\d[\dK+,.]*\+? sold|\s\d\.\d\s|\s\$)/);
      const precios = (i.txt.match(/\$[\d,]+\.?\d*/g) || []).map(parseUSD);
      const id = (i.href.match(/item\/(\d+)/) || [])[1];
      if (!id || vistos.has(id) || !precios.length) return null; vistos.add(id);
      const usd = precios[0]; const usdA = precios.find((x) => x > usd) || null;
      const vendidos = (i.txt.match(/([\d,.K+]+)\s+sold/) || [])[1] || null;
      const rating = parseFloat((i.txt.match(/\s(\d\.\d)\s/) || [])[1]) || null;
      return {
        tienda: 'AliExpress', origen: 'internacional', producto: (m ? m[1] : i.txt).slice(0, 160), precio_usd: usd,
        precio_cop: Math.round(usd * trmValor), precio_antes_cop: usdA ? Math.round(usdA * trmValor) : null,
        descuento_pct: usdA ? Math.round((1 - usd / usdA) * 100) : null, vendidos, calificacion: rating,
        url: `https://es.aliexpress.com/item/${id}.html`, imagen: i.img, condicion: 'nuevo', disponible: true,
      };
    }).filter(Boolean).slice(0, MAX);
  }]);

  await Promise.all(tareas.map(async ([nombre, fn]) => {
    const p = await ctx.newPage();
    try { out.push(...(await fn(p))); } catch (e) { errores.push(`${nombre}: ${e.message.split('\n')[0]}`); }
    await p.close();
  }));
  await browser.close();
  return { resultados: out, errores };
}

// Impuestos estimados para compras internacionales (Colombia, régimen de tráfico postal):
// < US$200: sin arancel ni IVA (salvo ropa/calzado: arancel 10% + IVA 19% desde 2023 si aplica).
// >= US$200: arancel ~10% + IVA 19% sobre (valor + flete). Es una estimación, el agente la explica.
function estimarImpuestos(r) {
  if (r.origen !== 'internacional' || !r.precio_usd) return 0;
  const ropa = CATEGORIA === 'ropa';
  if (r.precio_usd < 200 && !ropa) return 0;
  return Math.round(r.precio_cop * (1.10 * 1.19 - 1));
}

(async () => {
  const t = await trm();
  const fuentes = VTEX.filter((v) => usaCat(v.cats));
  const resultados = []; const errores = []; const omitidas = [];

  const ml = buscarMercadoLibre().then((r) => (Array.isArray(r) ? resultados.push(...r) : omitidas.push(r.omitida))).catch((e) => errores.push(`Mercado Libre: ${e.message}`));
  const vtex = Promise.all(fuentes.map((f) => buscarVTEX(f).then((r) => resultados.push(...r)).catch((e) => errores.push(`${f.tienda}: ${e.message}`))));
  const nav = flag('sin-navegador') || ['vehiculos', 'mercado', 'belleza'].includes(CATEGORIA) ?Promise.resolve() : navegador(t.valor).then((r) => { resultados.push(...r.resultados); errores.push(...r.errores); });
  await Promise.all([ml, vtex, nav]);

  const vistos = new Set();
  for (let i = resultados.length - 1; i >= 0; i--) {
    const k = resultados[i].url;
    if (vistos.has(k)) resultados.splice(i, 1); else vistos.add(k);
  }
  for (const r of resultados) {
    r.impuestos_estimados_cop = estimarImpuestos(r);
    r.precio_final_estimado_cop = r.precio_cop + r.impuestos_estimados_cop;
  }
  resultados.sort((a, b) => a.precio_final_estimado_cop - b.precio_final_estimado_cop);

  console.log(JSON.stringify({
    consulta: query, categoria: CATEGORIA, fecha: new Date().toISOString(), trm: t,
    total: resultados.length, resultados, errores, omitidas,
    nota: 'Precios de tiendas consultadas directamente. Complementar con búsqueda web (ofertas/tiendas.yaml). Verificar precio final en el enlace antes de comprar.',
  }, null, 2));
})();
