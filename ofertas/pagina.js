#!/usr/bin/env node
// Convierte un reporte JSON del agente en una página HTML (para publicar como Artifact).
// Uso: node ofertas/pagina.js ofertas/resultados/<archivo>.json [salida.html]
// También: node ofertas/pagina.js --deseos   (genera la página de la lista de deseos desde historial.json)
const fs = require('fs');
const path = require('path');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cop = (n) => (n == null || isNaN(n) ? '—' : '$ ' + Math.round(n).toLocaleString('es-CO'));
const fechaCO = (iso) => new Date(iso).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });

const CSS = `
<style>
/* Layout: etiqueta de precio — resumen arriba, luego secciones por origen con tablas desplazables */
:root{
  --bg:#f6f7f4; --surface:#ffffff; --fg:#1d2321; --muted:#5d6763; --line:#dde2de;
  --accent:#0d6e5a; --accent-soft:#e3f1ec; --tag:#f2c230; --tag-fg:#2a2200;
  --good:#1f7a3a; --warn:#a45d00; --bad:#b42318;
  --display:'Space Grotesk',system-ui,sans-serif; --body:'Inter',system-ui,sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){
  --bg:#121614; --surface:#1a201d; --fg:#e7ece9; --muted:#9aa5a0; --line:#2c3531;
  --accent:#4cc3a3; --accent-soft:#1c2f29; --tag:#f2c230; --tag-fg:#2a2200;
  --good:#5bd17e; --warn:#f0a447; --bad:#ff7a6e; color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:#121614; --surface:#1a201d; --fg:#e7ece9; --muted:#9aa5a0; --line:#2c3531;
  --accent:#4cc3a3; --accent-soft:#1c2f29; --tag:#f2c230; --tag-fg:#2a2200;
  --good:#5bd17e; --warn:#f0a447; --bad:#ff7a6e; color-scheme:dark}
body{background:var(--bg);color:var(--fg);font-family:var(--body);line-height:1.5}
.wrap{max-width:1080px;margin:0 auto;padding-block:28px 56px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));display:grid;gap:28px}
h1,h2,h3{font-family:var(--display);text-wrap:balance;margin:0;line-height:1.15}
h1{font-size:clamp(1.6rem,4vw,2.3rem)} h2{font-size:1.25rem} h3{font-size:1rem}
.eyebrow{font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.meta{color:var(--muted);font-size:.9rem;display:flex;flex-wrap:wrap;gap:6px 16px}
.best{display:grid;grid-template-columns:auto 1fr;gap:18px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px}
.price-tag{background:var(--tag);color:var(--tag-fg);font-family:var(--display);font-weight:700;font-size:clamp(1.3rem,4vw,1.9rem);padding:12px 18px 12px 26px;border-radius:6px 10px 10px 6px;position:relative;font-variant-numeric:tabular-nums;white-space:nowrap}
.price-tag::before{content:"";position:absolute;left:9px;top:50%;width:9px;height:9px;margin-top:-4.5px;border-radius:50%;background:var(--surface)}
.best p{margin:4px 0 0;color:var(--muted)} .best .t{min-width:0}
@media (max-width:560px){.best{grid-template-columns:1fr}}
section{display:grid;gap:12px;min-width:0}
.sec-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px}
.count{color:var(--muted);font-size:.85rem}
.table-box{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px}
table{border-collapse:collapse;width:100%;min-width:720px;font-size:.9rem}
th{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);text-align:left;font-weight:600;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
th.num{text-align:right}
td.final{font-weight:700;color:var(--accent)}
.prod{display:flex;gap:10px;align-items:flex-start;min-width:240px}
.prod img{width:44px;height:44px;object-fit:contain;border-radius:6px;background:#fff;flex:none}
a{color:var(--accent)} a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.store{font-weight:600;white-space:nowrap}
.chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.chip{font-size:.72rem;padding:1px 8px;border-radius:999px;background:var(--accent-soft);color:var(--accent);white-space:nowrap}
.chip.warn{background:transparent;border:1px solid var(--warn);color:var(--warn)}
.chip.bad{background:transparent;border:1px solid var(--bad);color:var(--bad)}
.chip.good{background:transparent;border:1px solid var(--good);color:var(--good)}
.old{color:var(--muted);text-decoration:line-through;font-size:.8rem;display:block}
.coupons{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.coupon{background:var(--surface);border:1px dashed var(--accent);border-radius:12px;padding:14px;display:grid;gap:6px;align-content:start;min-width:0}
.code{font-family:ui-monospace,Menlo,monospace;font-weight:700;background:var(--accent-soft);color:var(--accent);padding:2px 8px;border-radius:6px;border:0;cursor:pointer;font-size:.95rem;justify-self:start}
.coupon small{color:var(--muted)}
ul.tips{margin:0;padding-left:20px;display:grid;gap:6px;max-width:72ch}
.note{color:var(--muted);font-size:.82rem;max-width:80ch}
.spark{display:block}
</style>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Space+Grotesk:wght@500;700&display=swap">`;

const COPY_JS = `<script>
document.addEventListener('click',e=>{const b=e.target.closest('.code');if(!b)return;
const t=b.dataset.code;const ok=()=>{const o=b.textContent;b.textContent='Copiado';setTimeout(()=>b.textContent=o,1200)};
try{navigator.clipboard.writeText(t).then(ok,()=>{const r=document.createRange();r.selectNodeContents(b);getSelection().removeAllRanges();getSelection().addRange(r)})}catch(_){}});
</script>`;

const ORIGEN = {
  nacional: ['Tiendas en Colombia', 'Envío nacional, garantía local y devolución fácil.'],
  internacional: ['Compras internacionales', 'Precio convertido con la TRM del día. Incluye impuestos estimados cuando aplican.'],
  local: ['Usados y vendedores en Bogotá', 'Marketplace y particulares: revisa en persona y pide factura.'],
};

function fila(r) {
  const chips = [];
  if (r.descuento_pct) chips.push(`<span class="chip">-${r.descuento_pct}%</span>`);
  if (r.cupon) chips.push(`<span class="chip good">Cupón ${esc(r.cupon)}</span>`);
  if (r.envio_gratis) chips.push('<span class="chip">Envío gratis</span>');
  if (r.condicion && r.condicion !== 'nuevo') chips.push(`<span class="chip warn">${esc(r.condicion)}</span>`);
  if (r.fuente === 'web') chips.push('<span class="chip warn">Precio de búsqueda web</span>');
  for (const a of r.alertas || []) chips.push(`<span class="chip bad">${esc(a)}</span>`);
  const extra = [r.vendedor && `Vendedor: ${esc(r.vendedor)}`, r.calificacion && `${r.calificacion}★`, r.vendidos && `${esc(r.vendidos)} vendidos`, r.ubicacion && esc(r.ubicacion)].filter(Boolean).join(' · ');
  return `<tr>
<td class="store">${esc(r.tienda)}</td>
<td><div class="prod">${r.imagen ? `<img src="${esc(r.imagen)}" alt="" loading="lazy">` : ''}<div><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.producto)}</a>${extra ? `<div class="note">${extra}</div>` : ''}<div class="chips">${chips.join('')}</div></div></div></td>
<td class="num">${r.precio_antes_cop ? `<span class="old">${cop(r.precio_antes_cop)}</span>` : ''}${cop(r.precio_cop)}${r.precio_usd ? `<div class="note">US$${r.precio_usd}</div>` : ''}</td>
<td class="num">${r.envio_cop ? cop(r.envio_cop) : r.envio_gratis ? 'Gratis' : '—'}${r.impuestos_estimados_cop ? `<div class="note">+${cop(r.impuestos_estimados_cop)} imp.</div>` : ''}</td>
<td class="num final">${cop(r.precio_final_estimado_cop ?? r.precio_cop)}</td>
<td>${esc(r.entrega || '')}</td></tr>`;
}

function reporte(d) {
  const res = (d.resultados || []).filter((r) => r.precio_cop);
  for (const r of res) r.precio_final_estimado_cop ??= r.precio_cop + (r.envio_cop || 0) + (r.impuestos_estimados_cop || 0) - (r.descuento_cupon_cop || 0);
  res.sort((a, b) => a.precio_final_estimado_cop - b.precio_final_estimado_cop);
  const mejor = d.recomendacion?.url ? res.find((r) => r.url === d.recomendacion.url) || res[0] : res[0];
  const tiendas = new Set(res.map((r) => r.tienda)).size;
  const grupos = ['nacional', 'internacional', 'local'].map((o) => [o, res.filter((r) => (r.origen || 'nacional') === o)]).filter(([, l]) => l.length);

  return `<title>Ofertas: ${esc(d.consulta)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
${CSS}
<div class="wrap">
<header style="display:grid;gap:8px">
  <span class="eyebrow">Cazador de ofertas · Bogotá</span>
  <h1>${esc(d.consulta)}</h1>
  <div class="meta"><span>${fechaCO(d.fecha)}</span><span>${res.length} ofertas en ${tiendas} tiendas</span>${d.trm ? `<span>TRM ${cop(d.trm.valor)} (${esc(d.trm.vigencia || '')})</span>` : ''}${d.categoria ? `<span>Categoría: ${esc(d.categoria)}</span>` : ''}</div>
</header>
${mejor ? `<div class="best"><div class="price-tag">${cop(mejor.precio_final_estimado_cop)}</div><div class="t"><span class="eyebrow">Mejor opción</span><h2><a href="${esc(mejor.url)}" target="_blank" rel="noopener">${esc(mejor.producto)}</a></h2><p>${esc(mejor.tienda)}${d.recomendacion?.texto ? ' — ' + esc(d.recomendacion.texto) : ''}</p></div></div>` : '<p>No se encontraron ofertas con precio.</p>'}
${(d.cupones || []).length ? `<section><div class="sec-head"><h2>Cupones y promociones</h2><span class="count">${d.cupones.length}</span></div><div class="coupons">${d.cupones.map((c) => `<div class="coupon"><strong>${esc(c.tienda)}</strong>${c.codigo ? `<button class="code" type="button" data-code="${esc(c.codigo)}" title="Copiar código">${esc(c.codigo)}</button>` : ''}<span>${esc(c.descripcion)}</span><small>${esc(c.vigencia || 'Vigencia sin confirmar')}${c.url ? ` · <a href="${esc(c.url)}" target="_blank" rel="noopener">Fuente</a>` : ''}</small></div>`).join('')}</div></section>` : ''}
${grupos.map(([o, l]) => `<section><div class="sec-head"><div><h2>${ORIGEN[o][0]}</h2><span class="note">${ORIGEN[o][1]}</span></div><span class="count">${l.length} ofertas</span></div>
<div class="table-box"><table><thead><tr><th>Tienda</th><th>Producto</th><th class="num">Precio</th><th class="num">Envío / imp.</th><th class="num">Precio final</th><th>Entrega</th></tr></thead><tbody>${l.map(fila).join('')}</tbody></table></div></section>`).join('')}
${(d.consejos || []).length ? `<section><h2>Antes de comprar</h2><ul class="tips">${d.consejos.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>` : ''}
<p class="note">Precios consultados el ${fechaCO(d.fecha)}; pueden cambiar; confirma el valor final en la tienda. Impuestos de importación estimados: arancel 10% + IVA 19% para compras de US$200 o más.${(d.no_cubiertas || []).length ? ' No se pudo consultar: ' + esc(d.no_cubiertas.join(', ')) + '.' : ''}</p>
</div>${COPY_JS}`;
}

function spark(h) {
  const pts = h.filter((x) => x.precio_cop);
  if (pts.length < 2) return '';
  const w = 120, hgt = 32, min = Math.min(...pts.map((p) => p.precio_cop)), max = Math.max(...pts.map((p) => p.precio_cop));
  const xy = pts.map((p, i) => [4 + (i * (w - 8)) / (pts.length - 1), 4 + (max === min ? (hgt - 8) / 2 : ((max - p.precio_cop) * (hgt - 8)) / (max - min))]);
  const line = xy.map((p) => p.join(',')).join(' ');
  const last = xy[xy.length - 1];
  return `<svg class="spark" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}" role="img" aria-label="Historial de precio"><polygon points="4,${hgt} ${line} ${last[0]},${hgt}" fill="var(--accent-soft)"/><polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="1.6"/><circle cx="${last[0]}" cy="${last[1]}" r="2.6" fill="var(--accent)"/></svg>`;
}

function deseos() {
  const hist = JSON.parse(fs.readFileSync(path.join(__dirname, 'historial.json'), 'utf8'));
  const items = Object.entries(hist.productos || {});
  const rows = items.map(([nombre, p]) => {
    const h = p.historial || []; const ult = h[h.length - 1] || {}; const prev = h[h.length - 2];
    const min = Math.min(...h.map((x) => x.precio_cop).filter(Boolean));
    let estado = '<span class="chip">Sin cambios</span>';
    if (p.objetivo_cop && ult.precio_cop <= p.objetivo_cop) estado = '<span class="chip good">¡Llegó al objetivo!</span>';
    else if (prev && ult.precio_cop < prev.precio_cop) estado = `<span class="chip good">Bajó ${cop(prev.precio_cop - ult.precio_cop)}</span>`;
    else if (prev && ult.precio_cop > prev.precio_cop) estado = `<span class="chip warn">Subió ${cop(ult.precio_cop - prev.precio_cop)}</span>`;
    return `<tr><td><strong>${esc(nombre)}</strong>${ult.tienda ? `<div class="note">${esc(ult.tienda)}${ult.url ? ` · <a href="${esc(ult.url)}" target="_blank" rel="noopener">Ver oferta</a>` : ''}</div>` : ''}<div class="chips">${estado}</div></td>
<td class="num final">${cop(ult.precio_cop)}</td><td class="num">${cop(p.objetivo_cop)}</td><td class="num">${isFinite(min) ? cop(min) : '—'}</td><td>${spark(h)}</td><td class="note">${ult.fecha ? fechaCO(ult.fecha) : 'Pendiente'}</td></tr>`;
  }).join('');
  return `<title>Mi lista de deseos</title>
<meta name="claude:viewport-fit-sides" content="cover">
${CSS}
<div class="wrap"><header style="display:grid;gap:8px"><span class="eyebrow">Cazador de ofertas · Bogotá</span><h1>Mi lista de deseos</h1><div class="meta"><span>${items.length} productos vigilados</span><span>Actualizado ${hist.actualizado ? fechaCO(hist.actualizado) : '—'}</span></div></header>
<div class="table-box"><table><thead><tr><th>Producto</th><th class="num">Mejor precio hoy</th><th class="num">Objetivo</th><th class="num">Mínimo visto</th><th>Tendencia</th><th>Revisado</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Aún no hay productos. Agrega uno con /deseos agregar.</td></tr>'}</tbody></table></div>
<p class="note">Revisión automática diaria. El precio es el mejor encontrado entre todas las tiendas para ese producto.</p></div>`;
}

const a = process.argv.slice(2);
if (a[0] === '--deseos') {
  const out = a[1] || path.join(__dirname, 'resultados', 'lista-deseos.html');
  fs.writeFileSync(out, deseos());
  console.log(out);
} else {
  if (!a[0]) { console.error('Uso: node ofertas/pagina.js <reporte.json> [salida.html] | --deseos'); process.exit(1); }
  const d = JSON.parse(fs.readFileSync(a[0], 'utf8'));
  if (a.includes('--solo-json')) {
    // Prepara el reporte para la base de datos del buscador: máx. 30 ofertas, imágenes pequeñas incrustadas, < 250 KB.
    d.resultados = (d.resultados || []).filter((r) => r.precio_cop)
      .sort((x, y) => (x.precio_final_estimado_cop ?? x.precio_cop) - (y.precio_final_estimado_cop ?? y.precio_cop)).slice(0, 30);
    const salida = a[a.indexOf('--solo-json') + 1] && !a[a.indexOf('--solo-json') + 1].startsWith('--') ? a[a.indexOf('--solo-json') + 1] : a[0].replace(/\.json$/, '.db.json');
    embedImagenes(d.resultados, 12000).then(() => {
      let txt = JSON.stringify(d);
      if (txt.length > 250000) { d.resultados.forEach((r) => { r.imagen = null; }); txt = JSON.stringify(d); }
      fs.writeFileSync(salida, txt);
      console.log(salida, txt.length, 'bytes');
    });
  } else {
    const out = a[1] && !a[1].startsWith('--') ? a[1] : a[0].replace(/\.json$/, '.html');
    embedImagenes(d.resultados || [], 60000).then(() => {
      fs.writeFileSync(out, vitrinaEstatica(d));
      console.log(out);
    });
  }
}

// Página individual con el mismo diseño de vitrina del buscador: copia su <style> y su <script id="vitrina">.
function vitrinaEstatica(d) {
  const b = fs.readFileSync(path.join(__dirname, 'buscador.html'), 'utf8');
  const fonts = (b.match(/<link[^>]+fonts[^>]*>/g) || []).join('\n');
  const style = b.match(/<style>[\s\S]*?<\/style>/)[0];
  const vit = b.match(/<script id="vitrina">[\s\S]*?<\/script>/)[0];
  const datos = JSON.stringify(d).replace(/</g, '\\u003c');
  return `<title>Ofertas: ${esc(d.consulta)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
${style}
<div class="wrap"><div class="brand"><span class="logo" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span><strong>Cazador</strong> de ofertas</span><span class="note brand-sub">Bogotá · nuevos y mejor calidad-precio</span></div><main id="view" style="display:grid;gap:24px"></main></div>
${vit}
<script>Vitrina.mount(document.getElementById('view'), ${datos});</script>`;
}

// El visor de Artifacts bloquea imágenes externas: se descargan y se incrustan como data: URI.
async function embedImagenes(lista, maxBytes = 200000) {
  await Promise.all(lista.map(async (r) => {
    if (!r.imagen || r.imagen.startsWith('data:')) return;
    try {
      const url = r.imagen.includes('alicdn.com') ? r.imagen.replace(/(\.(jpg|png|webp|avif))(_.*)?$/i, '$1_120x120.jpg') : r.imagen.includes('media-amazon.com') ? r.imagen.replace(/\._[^.]+_\./, '._AC_UL120_.') : r.imagen.includes('/arquivos/ids/') ? r.imagen.replace(/\/ids\/(\d+)(-\d+-\d+)?\//, '/ids/$1-120-120/') : r.imagen.includes('media.falabella') ? r.imagen.replace(/\/public$/, '/w=96,h=96,fit=pad') : r.imagen;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) });
      const tipo = res.headers.get('content-type') || '';
      const buf = Buffer.from(await res.arrayBuffer());
      r.imagen = res.ok && tipo.startsWith('image/') && buf.length < maxBytes ? `data:${tipo.split(';')[0]};base64,${buf.toString('base64')}` : null;
    } catch { r.imagen = null; }
  }));
}
