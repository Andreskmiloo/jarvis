// ===== MERCADOS: cripto y dólar en vivo, tus inversiones, tu plan y una calculadora =====
// Precios en vivo de fuentes públicas y gratuitas (sin llaves): CoinGecko (cripto) y datos.gov.co (TRM).
// Se guardan aparte (no van en el respaldo) y se piden como mucho cada 10 minutos. Sin conexión se ve
// el último dato con su hora. Cada cifra trae una explicación corta. Es educativo, no asesoría financiera.

const MERCADO_CLAVE = 'jarvis_mercado';
const URL_CRIPTO = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,tether&vs_currencies=cop,usd&include_24hr_change=true';
const URL_TRM = 'https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=2';
const CRIPTOS = [
  ['bitcoin', 'Bitcoin', 'BTC', 'La cripto más grande. Sube y baja mucho: moverse 5% en un día es normal.'],
  ['ethereum', 'Ethereum', 'ETH', 'La segunda más grande; sobre ella funcionan muchas aplicaciones. Aún más volátil que Bitcoin.'],
  ['solana', 'Solana', 'SOL', 'Más pequeña y rápida; también más riesgosa: puede caer 20% en pocos días.'],
  ['tether', 'Tether', 'USDT', 'Un "dólar digital": busca valer siempre 1 dólar. No es para ganar, es para guardar en dólares.'],
];
const TIPOS_INV = [['cripto', 'Cripto'], ['accion', 'Acción o ETF'], ['ahorro', 'Cuenta que rinde o CDT'], ['otro', 'Otro']];
const numero = v => (typeof v === 'number' && isFinite(v) ? v : null);

let mercado = leerMercado();
let pidiendoMercado = false;

function leerMercado() {
  try { const m = JSON.parse(localStorage.getItem(MERCADO_CLAVE)); return registro(m) ? m : {}; } catch (e) { return {}; }
}

function pedir(url) {
  const control = typeof AbortController === 'function' ? new AbortController() : null;
  const t = setTimeout(() => control && control.abort(), 8000);
  return fetch(url, control ? { signal: control.signal } : {}).then(r => { clearTimeout(t); if (!r.ok) throw new Error(r.status); return r.json(); });
}

async function actualizarMercado(forzar = false) {
  if (pidiendoMercado || typeof fetch !== 'function') return;
  if (!forzar && mercado.hora && Date.now() - mercado.hora < 10 * 60 * 1000) return;
  pidiendoMercado = true;
  const nuevo = { ...leerMercado(), ...mercado, hora: Date.now() }; // otra pestaña pudo guardar datos más nuevos
  const [cripto, trm] = await Promise.allSettled([pedir(URL_CRIPTO), pedir(URL_TRM)]);
  if (cripto.status === 'fulfilled' && registro(cripto.value)) nuevo.cripto = cripto.value;
  if (trm.status === 'fulfilled' && Array.isArray(trm.value) && trm.value.length) {
    const [a, b] = trm.value;
    nuevo.trm = { valor: Number(a.valor) || 0, fecha: String(a.vigenciadesde || '').slice(0, 10), anterior: b ? Number(b.valor) || 0 : 0 };
  }
  nuevo.enVivo = cripto.status === 'fulfilled' || trm.status === 'fulfilled';
  if (nuevo.enVivo) nuevo.ultimoOk = nuevo.hora;
  mercado = nuevo;
  try { localStorage.setItem(MERCADO_CLAVE, JSON.stringify(mercado)); } catch (e) { /* sin almacenamiento */ }
  pidiendoMercado = false;
  // Repinta solo si sigues en Mercados y no estás escribiendo ni con una ventana abierta.
  const escribiendo = document.activeElement && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (vistaActual() === 'mercados' && !document.querySelector('#hoja.abierta') && !escribiendo) render();
}
acciones.actualizarMercado = () => { actualizarMercado(true); avisar('Actualizando precios…'); };

const precioCripto = (id, moneda = 'cop') => { const c = mercado.cripto && mercado.cripto[id]; return c ? numero(c[moneda]) : null; };

// ---------- Inversiones ----------
function valorInversion(x) {
  const cantidad = Number(x.cantidad) || 0, costo = Number(x.costo) || 0;
  if (x.tipo === 'cripto') { const p = precioCripto(x.simbolo); if (p !== null && cantidad) return Math.round(p * cantidad); }
  if (x.tipo === 'ahorro' && x.tasa && x.fecha) { // interés compuesto desde que lo abriste
    const anos = Math.max(0, (aFecha(hoy()) - aFecha(x.fecha)) / (365 * 86400000));
    return Math.round(costo * Math.pow(1 + Number(x.tasa) / 100, anos));
  }
  if (x.precio && cantidad) return Math.round(Number(x.precio) * cantidad);
  return Number(x.precio) || costo;
}

// ---------- Pantalla ----------
function vistaMercados() {
  actualizarMercado();
  const m = momentoEconomico();
  return `${encabezado('Inversión y aprendizaje', 'Mercados', 'Lo que pasa en el mercado explicado simple, tus inversiones y tu plan para empezar.',
      `<button type="button" class="btn suave" data-accion="actualizarMercado">${ic('repetir')}<span>Actualizar precios</span></button>` + btnNuevo('inversion', 'Agregar inversión', {}, 'btn primario'))}
    <section class="rejilla mercados">
      <article class="tarjeta a-vivo">${tarjetaVivo()}</article>
      <article class="tarjeta a-plan">${tarjetaPlan(m)}</article>
      <article class="tarjeta a-inversiones">${tarjetaInversiones()}</article>
      <article class="tarjeta a-calculadora">${tarjetaCalculadora()}</article>
      <article class="tarjeta a-fuentes">${tarjetaFuentes(m)}</article>
      <article class="tarjeta a-aprender">${tarjetaAprender()}</article>
    </section>`;
}

function cambio24(pct) {
  if (pct === null) return '';
  return `<span class="cambio ${pct >= 0 ? 'verde' : 'rojo'}">${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(1).replace('.', ',')}% en 24 h</span>`;
}

function tarjetaVivo() {
  const hora = mercado.ultimoOk ? new Date(mercado.ultimoOk) : null;
  const estado = !hora ? 'Sin datos en vivo todavía (necesita internet).'
    : (mercado.enVivo ? 'En vivo · ' : 'Sin conexión · último dato ') + fechaCorta(deFecha(hora)) + ' ' + String(hora.getHours()).padStart(2, '0') + ':' + String(hora.getMinutes()).padStart(2, '0');
  const t = mercado.trm || {};
  const trm = numero(t.valor) || 0, trmAntes = numero(t.anterior) || 0;
  const filas = CRIPTOS.map(([id, nombre, sim, explica]) => {
    const cop = precioCripto(id), usd = precioCripto(id, 'usd');
    const pct = mercado.cripto && mercado.cripto[id] ? numero(mercado.cripto[id].cop_24h_change) : null;
    return `<li class="activo-vivo">
        <div class="linea"><span class="nombre"><b>${sim}</b> ${nombre}</span><span class="derecha">${cop !== null ? peso(cop) : '—'}</span></div>
        <div class="linea detalle"><span>${usd !== null ? 'US$ ' + (usd >= 100 ? miles(Math.round(usd)) : usd.toFixed(2).replace('.', ',')) : ''}</span>${cambio24(pct)}</div>
        <p class="explica">${explica}${pct !== null && Math.abs(pct) >= 5 ? ` <b>Hoy se movió fuerte: ${pct >= 0 ? 'sube' : 'cae'} ${Math.abs(pct).toFixed(1).replace('.', ',')}%.</b>` : ''}</p>
      </li>`;
  }).join('');
  const difTrm = trm && trmAntes ? trm - trmAntes : 0;
  return `${cab('El mercado hoy', esc(estado), 'tendencia')}
    <div class="trm">
      <div><span class="etiqueta">Dólar (TRM oficial)</span><b class="num">${trm ? peso(Math.round(trm)) : '—'}</b>
        ${difTrm ? `<span class="cambio ${difTrm > 0 ? 'rojo' : 'verde'}">${difTrm > 0 ? '+' : '−'}${peso(Math.abs(Math.round(difTrm)))} vs. el día anterior</span>` : ''}</div>
      <p class="explica">Es el precio oficial del dólar en Colombia${t.fecha ? ' (' + esc(fechaCorta(t.fecha)) + ')' : ''}. Si sube, lo importado (Amazon, AliExpress, celulares) se encarece y lo que tengas en dólares vale más en pesos.</p>
    </div>
    <ul class="lista-vivo">${filas}</ul>
    <p class="detalle">Fuentes públicas: CoinGecko y datos.gov.co (Superfinanciera). Es información, no una recomendación de compra.</p>`;
}

function tarjetaInversiones() {
  const lista = datos.inversiones;
  const total = suma(lista, valorInversion), costo = suma(lista, x => x.costo);
  const partes = TIPOS_INV.map(([k, t], i) => ({ t, valor: suma(lista.filter(x => x.tipo === k), valorInversion), clase: 'p' + i })).filter(p => p.valor > 0);
  return `${cab('Mis inversiones', lista.length ? peso(total) : '', 'meta', btnNuevo('inversion', 'Agregar'))}
    ${lista.length ? `<div class="stats tres">
        <div><span>Valen hoy</span><b class="num">${peso(total)}</b></div>
        <div><span>Pusiste</span><b class="num">${peso(costo)}</b></div>
        <div><span>Ganancia</span><b class="num ${total - costo < 0 ? 'rojo' : 'verde'}">${total - costo < 0 ? '−' : '+'}${peso(Math.abs(total - costo))}</b></div>
      </div>
      ${partes.length > 1 ? `<div class="reparto-inv">${donut(partes, `<b>${partes.length}</b><span>tipos</span>`)}<ul>${partes.map(p => `<li class="${p.clase}"><span>${esc(p.t)}</span><b>${Math.round(p.valor / total * 100)}%</b></li>`).join('')}</ul></div>` : ''}
      ${ul(lista.map(x => {
        const v = valorInversion(x), c = Number(x.costo) || 0;
        return fila({
          col: 'inversiones', id: x.id, izquierda: ico(x.tipo === 'ahorro' ? 'escudo' : 'tendencia', 'acc'), titulo: esc(x.nombre),
          derecha: peso(v),
          detalle: [(TIPOS_INV.find(t => t[0] === x.tipo) || TIPOS_INV[3])[1], c ? `pusiste ${peso(c)}` : '', c ? `<span class="${v - c < 0 ? 'rojo' : 'verde'}">${v - c < 0 ? '−' : '+'}${Math.abs(Math.round((v / c - 1) * 100))}%</span>` : '', x.tasa ? x.tasa + '% E.A.' : ''].filter(Boolean).join(' · '),
        });
      }))}`
      : '<p class="vacio">Aún no tienes inversiones, y está bien: primero mira tu plan. Cuando abras una cuenta que rinde, un CDT o compres algo, regístralo aquí y suma a tu patrimonio.</p>'}`;
}

// ---------- Mi plan: una escalera con datos reales ----------
function pasosPlan(m) {
  const deudas = deudasActivas(), atrasadas = m.atrasadas.length;
  const ahorro = suma(datos.inversiones.filter(x => x.tipo === 'ahorro'), valorInversion);
  const invertido = suma(datos.inversiones.filter(x => x.tipo !== 'ahorro'), valorInversion);
  const fuentes = fuentesIngreso();
  const mayor = fuentes.length ? fuentes[0].pct : 100;
  const gastoMes = m.gastoMes || m.ingresoMes || 1;
  return [
    { titulo: 'Deudas al día', hecho: !atrasadas, pct: atrasadas ? 0 : 100,
      texto: atrasadas ? `Tienes ${atrasadas} ${atrasadas === 1 ? 'pago atrasado' : 'pagos atrasados'}. Los intereses de mora cuestan más de lo que cualquier inversión te puede dar.` : 'Vas al día con tus pagos.' },
    { titulo: 'Colchón de 1 mes', hecho: m.colchon >= 1, pct: limitarPct(m.colchon * 100),
      texto: `Ten en tus cuentas lo que gastas en un mes (${peso(gastoMes)}) por si algo pasa. Hoy cubres ${m.colchon.toFixed(1).replace('.', ',')} meses.` },
    { titulo: 'Salir de las deudas caras', hecho: !deudas.some(p => Number(p.saldo) > 0 && !p.conCobros), pct: deudas.length ? limitarPct(100 - suma(deudas, montoDeuda) / Math.max(m.ingresoMes, 1) * 50) : 100,
      texto: deudas.length ? `Debes ${peso(suma(deudas, montoDeuda))}. Paga primero la de interés más alto (casi siempre la tarjeta).` : 'Sin deudas pendientes.' },
    { titulo: 'Fondo de emergencia de 3 meses', hecho: ahorro + m.disponible >= gastoMes * 3, pct: limitarPct((ahorro + m.disponible) / (gastoMes * 3) * 100),
      texto: `Junta ${peso(gastoMes * 3)} en una cuenta que rinda intereses y que puedas sacar rápido.` },
    { titulo: 'Primera inversión', hecho: invertido > 0, pct: invertido > 0 ? 100 : 0,
      texto: 'Empieza con poco y diversificado (por ejemplo, un fondo que sigue a muchas empresas). Nunca con plata que necesites pronto.' },
    { titulo: 'Más de una fuente de ingreso', hecho: mayor <= 70 && fuentes.length > 1, pct: limitarPct(fuentes.length > 1 ? (100 - mayor) / 30 * 100 : 0),
      texto: fuentes.length ? `Hoy el ${mayor}% de lo que entra viene de ${esc(fuentes[0].nombre)}. La meta: que ninguna fuente pase del 70%.` : 'Registra tus ingresos para medirlo.' },
  ];
}

function tarjetaPlan(m) {
  const pasos = pasosPlan(m);
  const actual = pasos.findIndex(p => !p.hecho);
  return `${cab('Mi plan', actual < 0 ? 'completo' : `paso ${actual + 1} de ${pasos.length}`, 'escudo')}
    <p class="detalle">El orden importa: cada paso protege al siguiente. Se calcula solo con tus datos.</p>
    <ol class="escalera">${pasos.map((p, i) => `<li class="${p.hecho ? 'hecho' : i === actual ? 'actual' : ''}">
        <span class="num-paso">${p.hecho ? ic('check') : i + 1}</span>
        <div><b>${p.titulo}</b>${i === actual || !p.hecho ? `<p>${p.texto}</p>` : ''}${!p.hecho ? barraProg(p.pct) : ''}</div>
      </li>`).join('')}</ol>`;
}

// ---------- De dónde viene tu dinero (últimos 90 días) ----------
function fuentesIngreso() {
  const desde = sumarDias(hoy(), -90), r = Object.create(null);
  for (const mv of datos.movimientos) if (mv.tipo === 'ingreso' && mv.fecha >= desde) r[mv.categoria || 'Otros'] = (r[mv.categoria || 'Otros'] || 0) + (Number(mv.monto) || 0);
  for (const o of datos.pedidos) if (o.estado === 'pagado' && !o.movId && o.fechaCobro >= desde) r.Negocio = (r.Negocio || 0) + (Number(o.precio) || 0);
  if (!Object.keys(r).length) { // sin movimientos: usa las quincenas configuradas
    const q = (Number(datos.ingresos.q15) || 0) + (Number(datos.ingresos.q30) || 0);
    if (q) r.Quincena = q;
  }
  const total = suma(Object.values(r), v => v) || 1;
  return Object.entries(r).map(([nombre, valor]) => ({ nombre, valor, pct: Math.round(valor / total * 100) })).sort((a, b) => b.valor - a.valor);
}

function tarjetaFuentes() {
  const f = fuentesIngreso();
  return `${cab('De dónde viene tu dinero', 'últimos 90 días', 'ingreso')}
    ${f.length ? `<ul class="categorias">${f.map(x => `<li><div class="linea"><span class="nombre">${esc(x.nombre)}</span><span class="derecha">${x.pct}% · ${peso(x.valor)}</span></div>${barraProg(x.pct)}</li>`).join('')}</ul>
      <p class="detalle">${f[0].pct > 70 ? `Dependes mucho de <b>${esc(f[0].nombre)}</b>. Tu negocio, un trabajo por horas o vender algo que sabes hacer son formas de sumar otra fuente.` : 'Bien repartido: si una fuente falla, las otras te sostienen.'}</p>`
      : '<p class="vacio">Registra tus ingresos en Cuentas para ver de dónde viene tu dinero.</p>'}`;
}

// ---------- Calculadora de interés compuesto ----------
function tarjetaCalculadora() {
  const c = { aporte: 100000, tasa: 10, anos: 5, ...(registro(datos.config.calc) ? datos.config.calc : {}) };
  const aporte = Math.max(0, Number(c.aporte) || 0), tasa = Math.max(0, Math.min(60, Number(c.tasa) || 0)), anos = Math.max(1, Math.min(40, Math.round(Number(c.anos) || 1)));
  const tq = Math.pow(1 + tasa / 100, 1 / 24) - 1; // tasa por quincena equivalente a la efectiva anual
  let saldo = 0; const porAno = [];
  for (let q = 1; q <= anos * 24; q++) { saldo = saldo * (1 + tq) + aporte; if (q % 24 === 0) porAno.push(saldo); }
  const puesto = aporte * anos * 24, maximo = Math.max(...porAno, 1);
  const pasos = porAno.length > 12 ? porAno.filter((_, i) => (i + 1) % Math.ceil(porAno.length / 12) === 0 || i === porAno.length - 1) : porAno;
  return `${cab('Calculadora: si ahorras cada quincena', '', 'chispa')}
    <div class="calc">
      <label>Aporte por quincena<input data-cambio="calc" data-id="aporte" inputmode="numeric" value="${miles(aporte)}"></label>
      <label>Rentabilidad anual %<input data-cambio="calc" data-id="tasa" inputmode="decimal" value="${String(tasa).replace('.', ',')}"></label>
      <label>Años<input data-cambio="calc" data-id="anos" inputmode="numeric" value="${anos}"></label>
    </div>
    <div class="stats tres">
      <div><span>Tendrías</span><b class="num verde">${peso(Math.round(saldo))}</b></div>
      <div><span>Pusiste tú</span><b class="num">${peso(puesto)}</b></div>
      <div><span>Te dio el interés</span><b class="num acento">${peso(Math.round(saldo - puesto))}</b></div>
    </div>
    <div class="barras-anos" aria-hidden="true">${pasos.map(v => `<i style="--h:${Math.max(3, Math.round(v / maximo * 100))}%"></i>`).join('')}</div>
    <p class="detalle">Eso es el interés compuesto: los intereses también ganan intereses, por eso la curva se empina con el tiempo. Una cuenta que rinde o un CDT suelen pagar menos que la bolsa, pero con mucho menos riesgo.</p>`;
}
cambios.calc = (campo, valor) => {
  const c = registro(datos.config.calc) ? datos.config.calc : (datos.config.calc = {});
  c[campo] = campo === 'tasa' ? Number(String(valor).replace(',', '.')) || 0 : dinero(valor);
};

// ---------- Formulario ----------
FORMULARIOS.inversion = {
  col: 'inversiones', boton: 'Agregar inversión',
  titulo: x => x ? 'Editar inversión' : 'Nueva inversión',
  campos: x => {
    x = x || {};
    return campo('Nombre', 'nombre', x.nombre, 'required placeholder="Ej.: Bitcoin, CDT Bancolombia, fondo indexado"')
      + selector('Tipo', 'tipo', TIPOS_INV, x.tipo || 'ahorro')
      + selector('Si es cripto, cuál (precio en vivo)', 'simbolo', [['', 'No es cripto'], ...CRIPTOS.map(c => [c[0], c[1] + ' (' + c[2] + ')'])], x.simbolo || '')
      + campoDinero('Cuánto pusiste (pesos)', 'costo', x.costo)
      + campo('Cantidad (unidades, acciones o monedas)', 'cantidad', x.cantidad ? String(x.cantidad).replace('.', ',') : '', 'inputmode="decimal" placeholder="Ej.: 0,0025"')
      + campoDinero('Precio actual por unidad (si no es cripto)', 'precio', x.precio)
      + campo('Rentabilidad anual % (cuentas y CDT)', 'tasa', x.tasa ? String(x.tasa).replace('.', ',') : '', 'inputmode="decimal" placeholder="Ej.: 9,5"')
      + campoFecha('Desde cuándo', 'fecha', x.fecha);
  },
  guardar: (d, previo) => {
    const decimal = v => Number(String(v || '').replace(/\./g, '').replace(',', '.')) || 0;
    guardarItem('inversiones', {
      ...previo, id: previo.id || uid(), nombre: d.nombre, tipo: d.tipo, simbolo: d.tipo === 'cripto' ? d.simbolo : '',
      costo: d.costo || 0, cantidad: decimal(d.cantidad), precio: d.precio || 0, tasa: decimal(d.tasa), fecha: d.fecha,
    });
  },
};
