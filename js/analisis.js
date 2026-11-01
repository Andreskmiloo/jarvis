// ===== ANÁLISIS: proyección de caja, gráfico y lecturas de Jarvis =====
// Todo se calcula con reglas simples sobre lo que ya registraste; no se envía nada a ningún sitio.

// Saldo día a día (hoy + N días), partiendo de lo que hay en las cuentas.
//   - pagos pendientes: en su fecha (los vencidos, hoy)
//   - quincena: los días 15 y 30, desde mañana
//   - gastos diarios: desde mañana
//   - cobros pendientes: solo en la línea punteada ("si te pagan")
function proyeccion(dias = 30) {
  const hoyS = hoy();
  const limite = sumarDias(hoyS, dias);
  const porDia = {};
  const del = f => porDia[f] || (porDia[f] = { pagos: [], cobros: [], ingresos: [], diarios: 0 });
  for (const p of datos.pagos) {
    if (p.pagado || !p.fecha || !p.monto) continue;
    const f = efectiva(p.fecha);
    if (f <= limite) del(f).pagos.push({ texto: p.nombre, monto: Number(p.monto) || 0 });
  }
  for (const o of porCobrar()) {
    if (!o.fechaCobro) continue;
    const f = efectiva(o.fechaCobro);
    if (f <= limite) del(f).cobros.push({ texto: 'Cobro ' + o.cliente, monto: Number(o.precio) || 0 });
  }
  const serie = [];
  let saldo = totalCuentas();
  let conCobros = saldo;
  for (let i = 0; i <= dias; i++) {
    const f = sumarDias(hoyS, i);
    const d = del(f);
    if (i > 0) {
      const [y, m, dd] = f.split('-').map(Number);
      if (dd === 15) d.ingresos.push({ texto: 'Quincena', monto: Number(datos.ingresos.q15) || 0 });
      if (dd === dia30(y, m)) d.ingresos.push({ texto: 'Quincena', monto: Number(datos.ingresos.q30) || 0 });
      const semana = aFecha(f).getDay();
      d.diarios = suma(datos.diarios.filter(g => !g.soloHabiles || (semana >= 1 && semana <= 5)), g => g.monto);
    }
    const salida = suma(d.pagos, e => e.monto) + d.diarios;
    const entrada = suma(d.ingresos, e => e.monto);
    saldo += entrada - salida;
    conCobros += entrada - salida + suma(d.cobros, e => e.monto);
    serie.push({ fecha: f, saldo, conCobros, entrada, salida, pagos: d.pagos, ingresos: d.ingresos, cobros: d.cobros, diarios: d.diarios });
  }
  return serie;
}

function resumenCaja(serie) {
  const menor = k => serie.reduce((a, p) => (p[k] < a[k] ? p : a), serie[0]);
  return {
    minimo: menor('saldo'), minimoCobros: menor('conCobros'),
    fin: serie[serie.length - 1].saldo, finCobros: serie[serie.length - 1].conCobros,
    primerNegativo: serie.find(p => p.saldo < 0) || null,
  };
}

// ---------- Gráfico de flujo de caja ----------
// Se dibuja con el ancho real de su contenedor, así se ve nítido en celular y en PC.
function pintarGraficos() {
  document.querySelectorAll('#vista [data-grafico="caja"]').forEach(dibujarCaja);
}
let temporizadorGrafico = 0;
window.addEventListener('resize', () => { clearTimeout(temporizadorGrafico); temporizadorGrafico = setTimeout(pintarGraficos, 150); });

function dibujarCaja(cont) {
  const serie = proyeccion(30);
  const n = serie.length;
  const w = Math.max(280, Math.floor(cont.clientWidth) || 320);
  const h = w < 520 ? 210 : 260;
  const m = { t: 18, r: 10, b: 28, l: 10 };
  const valores = serie.flatMap(p => [p.saldo, p.conCobros]);
  const maxReal = Math.max(0, ...valores);
  const minReal = Math.min(0, ...valores);
  const holgura = Math.max(1, (maxReal - minReal) * 0.12);
  const max = maxReal + holgura;
  const min = minReal - holgura;
  const x = i => m.l + (w - m.l - m.r) * i / (n - 1);
  const y = v => m.t + (h - m.t - m.b) * (1 - (v - min) / (max - min));
  const trazo = k => serie.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[k]).toFixed(1)).join('');
  const yCero = y(0);
  const fz = ((yCero - m.t) / (h - m.t - m.b)).toFixed(4); // dónde cae el cero dentro del degradado
  const area = trazo('saldo') + `L${x(n - 1).toFixed(1)} ${yCero.toFixed(1)}L${x(0).toFixed(1)} ${yCero.toFixed(1)}Z`;
  const hayCobros = serie.some(p => Math.abs(p.conCobros - p.saldo) > 0.5);
  const id = 'cj' + Math.floor(Math.random() * 1e6);

  // Etiquetas del eje Y: máximo, cero y mínimo (sin encimarse)
  const etiquetasY = [];
  for (const [valor, texto] of [[maxReal, peso(maxReal)], [0, '$0'], [minReal, peso(minReal)]]) {
    const py = y(valor);
    if (etiquetasY.every(e => Math.abs(e.py - py) > 16)) etiquetasY.push({ py, texto });
  }
  const ticks = [0, 10, 20, 30].filter(i => i < n);
  const puntos = serie.map((p, i) => {
    if (p.ingresos.length) return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.saldo).toFixed(1)}" r="3.6" class="pt pos"/>`;
    if (p.pagos.some(e => e.monto >= 50000)) return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.saldo).toFixed(1)}" r="3.2" class="pt neg"/>`;
    return '';
  }).join('');

  cont.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Flujo de caja proyectado a 30 días">
      <defs>
        <linearGradient id="${id}a" gradientUnits="userSpaceOnUse" x1="0" y1="${m.t}" x2="0" y2="${h - m.b}">
          <stop offset="0" stop-color="#38bdf8" stop-opacity=".40"/><stop offset="${fz}" stop-color="#38bdf8" stop-opacity="0"/>
          <stop offset="${fz}" stop-color="#fb7185" stop-opacity="0"/><stop offset="1" stop-color="#fb7185" stop-opacity=".40"/>
        </linearGradient>
        <linearGradient id="${id}l" gradientUnits="userSpaceOnUse" x1="0" y1="${m.t}" x2="0" y2="${h - m.b}">
          <stop offset="0" stop-color="#67e8f9"/><stop offset="${fz}" stop-color="#818cf8"/>
          <stop offset="${fz}" stop-color="#fb7185"/><stop offset="1" stop-color="#fb7185"/>
        </linearGradient>
      </defs>
      ${[0.25, 0.5, 0.75].map(f => `<line class="rejilla-y" x1="${m.l}" x2="${w - m.r}" y1="${(m.t + (h - m.t - m.b) * f).toFixed(1)}" y2="${(m.t + (h - m.t - m.b) * f).toFixed(1)}"/>`).join('')}
      <line class="cero" x1="${m.l}" x2="${w - m.r}" y1="${yCero.toFixed(1)}" y2="${yCero.toFixed(1)}"/>
      <path class="area-caja" d="${area}" fill="url(#${id}a)"/>
      ${hayCobros ? `<path class="linea-cobros" d="${trazo('conCobros')}"/>` : ''}
      <path class="linea-caja" d="${trazo('saldo')}" stroke="url(#${id}l)"/>
      ${puntos}
      ${etiquetasY.map(e => `<text class="eje" x="${m.l + 4}" y="${(e.py - 5).toFixed(1)}">${e.texto}</text>`).join('')}
      ${ticks.map(i => `<text class="eje" x="${x(i).toFixed(1)}" y="${h - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${fechaCorta(serie[i].fecha)}</text>`).join('')}
      <line class="guia" y1="${m.t}" y2="${h - m.b}" x1="0" x2="0"/>
      <circle class="punto-guia" r="5" cx="0" cy="0"/>
      <rect class="captura" x="0" y="0" width="${w}" height="${h}"/>
    </svg>
    <div class="tip" role="status"></div>`;

  const svg = cont.querySelector('svg');
  const linea = cont.querySelector('.linea-caja');
  const guia = cont.querySelector('.guia');
  const punto = cont.querySelector('.punto-guia');
  const tip = cont.querySelector('.tip');

  const ocultar = () => { guia.style.opacity = 0; punto.style.opacity = 0; tip.classList.remove('on'); };
  const mover = e => {
    const r = svg.getBoundingClientRect();
    const px = (e.clientX - r.left) * (w / (r.width || w));
    const i = Math.max(0, Math.min(n - 1, Math.round((px - m.l) / (w - m.l - m.r) * (n - 1))));
    const p = serie[i];
    guia.setAttribute('x1', x(i)); guia.setAttribute('x2', x(i)); guia.style.opacity = 1;
    punto.setAttribute('cx', x(i)); punto.setAttribute('cy', y(p.saldo)); punto.style.opacity = 1;
    punto.setAttribute('class', 'punto-guia' + (p.saldo < 0 ? ' neg' : ''));
    const eventos = [
      ...p.ingresos.map(e => `<li class="pos">+ ${esc(e.texto)} ${peso(e.monto)}</li>`),
      ...p.pagos.map(e => `<li>− ${esc(e.texto)} ${peso(e.monto)}</li>`),
      ...(p.diarios ? [`<li>− Gastos diarios ${peso(p.diarios)}</li>`] : []),
      ...p.cobros.map(e => `<li class="pos">+ ${esc(e.texto)} ${peso(e.monto)} (si te pagan)</li>`),
    ].slice(0, 6);
    tip.innerHTML = `<b>${fechaConDia(p.fecha)}</b>
      <div class="fila-tip"><span>Saldo</span><b class="${p.saldo < 0 ? 'rojo' : ''}">${peso(p.saldo)}</b></div>
      ${hayCobros ? `<div class="fila-tip"><span>Con cobros</span><b>${peso(p.conCobros)}</b></div>` : ''}
      ${eventos.length ? `<ul>${eventos.join('')}</ul>` : ''}`;
    tip.classList.add('on');
    const ancho = tip.offsetWidth;
    const izquierda = x(i) + 14 + ancho > w ? x(i) - ancho - 14 : x(i) + 14;
    tip.style.left = Math.max(0, izquierda) + 'px';
  };
  svg.addEventListener('pointermove', mover);
  svg.addEventListener('pointerdown', mover);
  svg.addEventListener('pointerleave', ocultar);

  // La línea se dibuja sola la primera vez que se ve la pantalla
  if (!reducirMovimiento() && !previos.has('caja')) {
    previos.set('caja', 1);
    const largo = linea.getTotalLength();
    linea.style.strokeDasharray = largo;
    linea.style.strokeDashoffset = largo;
    void linea.getBoundingClientRect();
    linea.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.3,.7,.2,1)';
    linea.style.strokeDashoffset = 0;
  }
}

function tarjetaCaja(area) {
  const serie = proyeccion(30);
  const c = resumenCaja(serie);
  const sinSaldos = datos.cuentas.every(x => !x.saldo);
  const color = v => (v < 0 ? 'rojo' : '');
  return `<article class="tarjeta ${area}">
    ${cab('Flujo de caja', 'próximos 30 días', 'tendencia')}
    <div class="leyenda-caja"><span class="l-saldo">Saldo proyectado</span><span class="l-cobros">Si cobras lo pendiente</span></div>
    <div class="grafico" data-grafico="caja"></div>
    <div class="stats tres">
      <div><span>Disponible ahora</span><b class="num ${color(totalCuentas())}" data-k="caja-ahora">${contador(totalCuentas())}</b></div>
      <div><span>Mínimo · ${fechaCorta(c.minimo.fecha)}</span><b class="num ${color(c.minimo.saldo)}" data-k="caja-minimo">${contador(c.minimo.saldo)}</b></div>
      <div><span>En 30 días</span><b class="num ${color(c.fin)}" data-k="caja-fin">${contador(c.fin)}</b></div>
    </div>
    ${sinSaldos ? `<p class="aviso">${ic('info')}<span>Registra lo que tienes en <a href="#cuentas">Cuentas</a> para que la proyección parta de tu saldo real.</span></p>` : ''}
  </article>`;
}

// ---------- Lecturas de Jarvis ----------
const NIVELES = { hoy: -1, alto: 0, medio: 1, info: 2, ok: 3 }; // 'hoy' = lo más accionable del día, va primero
const CLASE_NIVEL = { hoy: 'acc', alto: 'neg', medio: 'warn', info: 'acc', ok: 'pos' };
const enlace = (href, texto) => `<a class="enlace" href="${href}">${texto}${ic('flecha')}</a>`;

function lecturas() {
  const L = [];
  const add = (nivel, icono, titulo, texto, extra = '') => L.push({ nivel, icono, titulo, texto, extra });
  const h = hoy();
  const [actual, siguiente] = quincenasVisibles();
  const qa = resumenQuincena(actual);
  const qs = resumenQuincena(siguiente);
  const disponible = totalCuentas();
  const sinSaldos = datos.cuentas.every(c => !c.saldo);
  const caja = resumenCaja(proyeccion(30));

  // Pagos vencidos
  const vencidos = datos.pagos.filter(p => !p.pagado && p.fecha && p.fecha < h);
  if (vencidos.length) {
    const masViejo = vencidos.reduce((a, p) => (p.fecha < a ? p.fecha : a), vencidos[0].fecha);
    add('alto', 'alerta', vencidos.length === 1 ? '1 pago vencido' : `${vencidos.length} pagos vencidos`,
      `Suman ${peso(suma(vencidos, p => p.monto))}; el más antiguo lleva ${-diasHasta(masViejo)} días.`, enlace('#finanzas', 'Ver pagos'));
  }

  // Dinero disponible frente a lo que viene
  if (sinSaldos) {
    add('info', 'cuentas', 'Registra tus saldos', 'Anota lo que tienes en la billetera y en tus bancos para activar la proyección de caja.', enlace('#cuentas', 'Ir a cuentas'));
  } else {
    const limite = sumarDias(h, 7);
    const debe7 = suma(datos.pagos.filter(p => !p.pagado && p.fecha && p.fecha <= limite), p => p.monto);
    if (debe7 > 0 && disponible >= debe7) add('ok', 'escudo', 'Semana cubierta', `Tu disponible cubre lo que vence en 7 días (${peso(debe7)}) y sobran ${peso(disponible - debe7)}.`);
    if (debe7 > 0 && disponible < debe7) add('alto', 'alerta', 'Falta dinero esta semana', `Vencen ${peso(debe7)} en 7 días y tienes ${peso(disponible)}: te faltan ${peso(debe7 - disponible)}.`);
    if (caja.primerNegativo) {
      add('alto', 'tendencia', 'Tu caja se queda sin fondos',
        `Sin contar cobros llegarías a ${peso(caja.minimo.saldo)} el ${fechaCorta(caja.minimo.fecha)}. Si cobras lo pendiente: ${peso(caja.minimoCobros.conCobros)}.`);
    } else {
      add('ok', 'tendencia', 'Caja positiva a 30 días', `Tu mínimo proyectado es ${peso(caja.minimo.saldo)} el ${fechaCorta(caja.minimo.fecha)}.`);
    }
  }

  // Quincenas que cierran en negativo
  if (qa.libre < 0) add('medio', 'calendario', 'La quincena actual cierra en negativo', `Libre: ${peso(qa.libre)}. Revisa pagos o adelanta cobros.`, enlace('#finanzas', 'Ver finanzas'));
  if (qs.libre < 0) add('medio', 'calendario', 'La próxima quincena cierra en negativo', `Libre: ${peso(qs.libre)}. Revisa fijos y gastos diarios, o adelanta cobros.`, enlace('#finanzas', 'Ver finanzas'));

  // Cobros vencidos
  const cobrosVencidos = porCobrar().filter(o => o.fechaCobro && o.fechaCobro < h);
  if (cobrosVencidos.length === 1) {
    const o = cobrosVencidos[0];
    add('medio', 'cobro', `${esc(o.cliente)} te debe ${peso(o.precio)}`, `Debía pagar hace ${-diasHasta(o.fechaCobro)} días.`);
  } else if (cobrosVencidos.length > 1) {
    add('medio', 'cobro', `${cobrosVencidos.length} cobros vencidos`, `Suman ${peso(suma(cobrosVencidos, o => o.precio))}.`, enlace('#finanzas', 'Ver por cobrar'));
  }

  // Mínimo de tarjeta sin confirmar
  const sinMinimo = [...new Set([...qa.sinDescontar, ...qs.sinDescontar].map(p => p.nombre))];
  if (sinMinimo.length) add('medio', 'tarjeta', `Confirma el mínimo de ${sinMinimo.map(esc).join(', ')}`, 'Mientras no lo escribas, no se descuenta de tu libre.', enlace('#finanzas', 'Ir a deudas'));

  // Día de pago
  if (inicioQuincena(h) === h && !datos.movimientos.some(mv => mv.categoria === 'Quincena' && mv.fecha === h)) {
    const monto = Number(datos.ingresos[esQuincena15(h) ? 'q15' : 'q30']) || 0;
    add('hoy', 'ingreso', 'Hoy es día de pago', `Registra tu ingreso de ${peso(monto)} para actualizar tus saldos.`,
      `<button type="button" class="btn mini" data-accion="registrarQuincena">${ic('mas')}<span>Registrar ingreso</span></button>`);
  }

  // Metas cercanas y ritmo del negocio
  const cercanas = datos.metas.filter(m => !m.hecha && m.fecha && m.fecha >= h && diasHasta(m.fecha) <= 21 && Number(m.objetivo) > 0 && !m.auto)
    .sort(porFecha);
  if (cercanas[0]) {
    const m = cercanas[0], i = infoMeta(m);
    if (i.actual < i.objetivo) add('info', 'meta', esc(m.nombre), `Faltan ${peso(i.objetivo - i.actual)} en ${diasHasta(m.fecha)} días.`, enlace('#pendientes', 'Ver metas'));
  }
  const metaVentas = datos.metas.find(m => m.auto === 'ventas' && !m.hecha && m.fecha && diasHasta(m.fecha) > 0);
  if (metaVentas) {
    const i = infoMeta(metaVentas);
    const faltante = i.objetivo - i.actual;
    if (faltante > 0) {
      const semanas = Math.max(1, Math.ceil(diasHasta(metaVentas.fecha) / 7));
      add('info', 'negocio', 'Ritmo de ventas', `Para llegar a ${peso(i.objetivo)} necesitas vender ${peso(faltante / semanas)} por semana.`, enlace('#negocio', 'Ver negocio'));
    }
  }

  // Orden en los datos
  if (!sinSaldos) {
    const ultima = datos.cuentas.map(c => c.actualizado).filter(Boolean).sort().pop();
    if (ultima && -diasHasta(ultima) > 4) add('info', 'reloj', 'Actualiza tus saldos', `Llevan ${-diasHasta(ultima)} días sin actualizarse.`, enlace('#cuentas', 'Ir a cuentas'));
    if (datos.pagos.some(p => !p.pagado) && !datos.pagos.some(p => p.cuenta)) {
      add('info', 'cuentas', 'Saldos en automático', 'Asigna una cuenta a tus pagos y cobros: al marcarlos, el saldo se actualiza solo.', enlace('#finanzas', 'Editar un pago'));
    }
  }
  const mejorRacha = datos.habitos.map(hb => ({ hb, n: racha(hb) })).sort((a, b) => b.n - a.n)[0];
  if (mejorRacha && mejorRacha.n >= 3) add('ok', 'llama', `Racha de ${mejorRacha.n} días`, `Vas ${mejorRacha.n} días seguidos con "${esc(mejorRacha.hb.nombre)}".`);
  if (!datos.ultimoRespaldo || -diasHasta(datos.ultimoRespaldo) > 7) {
    add('info', 'escudo', 'Haz un respaldo', datos.ultimoRespaldo ? `Tu último respaldo fue ${hace(datos.ultimoRespaldo)}.` : 'Aún no has descargado ningún respaldo.',
      `<button type="button" class="btn mini" data-accion="exportar">${ic('descargar')}<span>Descargar respaldo</span></button>`);
  }

  return L.sort((a, b) => NIVELES[a.nivel] - NIVELES[b.nivel]);
}

// Las más importantes a la vista; el resto, a un clic ("Ver N más").
function listaLecturas(max = 5) {
  const L = lecturas();
  if (!L.length) return '<p class="vacio">Todo en orden. Jarvis no ve nada que requiera tu atención.</p>';
  const fila = l => `<li class="lectura ${l.nivel}">
      ${ico(l.icono, CLASE_NIVEL[l.nivel])}
      <div><b>${l.titulo}</b><p>${l.texto}</p>${l.extra}</div>
    </li>`;
  const resto = L.slice(max);
  return `<ul class="lecturas">${L.slice(0, max).map(fila).join('')}</ul>
    ${resto.length ? `<details class="mas"><summary>Ver ${resto.length} más ${ic('chevron')}</summary><ul class="lecturas">${resto.map(fila).join('')}</ul></details>` : ''}`;
}
