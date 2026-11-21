// ===== PATRIMONIO: lo que tienes, lo que debes, tu inventario y cómo va cambiando =====
// Balance (activos − pasivos), estado de resultados del mes (como una empresa), inventario de tus cosas
// con su valor y una línea de tiempo con todos tus movimientos. Cada vez que cambias algo se anota
// la foto del mes (historial) para ver tu patrimonio a lo largo del tiempo.

const CATEGORIAS_BIEN = [
  ['tecnologia', 'Tecnología'], ['movilidad', 'Movilidad'], ['ropa', 'Ropa y calzado'],
  ['hogar', 'Hogar'], ['estudio', 'Estudio y trabajo'], ['otro', 'Otro'],
];
const VIDA_UTIL = { tecnologia: 4, movilidad: 6, ropa: 3, hogar: 8, estudio: 5, otro: 0 }; // años; 0 = no se desvaloriza
const nombreCategoriaBien = k => (CATEGORIAS_BIEN.find(c => c[0] === k) || CATEGORIAS_BIEN[5])[1];

// Valor de hoy: el que escribiste tú o, si no, el de compra bajando parejo durante su vida útil
// (nunca por debajo del 10% de lo que costó).
function valorBien(b) {
  if (b.valorActual !== null && b.valorActual !== undefined && b.valorActual !== '') return Number(b.valorActual) || 0;
  const compra = Number(b.valorCompra) || 0;
  const vida = Number(b.vida ?? VIDA_UTIL[b.categoria] ?? 0);
  if (!vida || !b.fecha) return compra;
  const [y1, m1, d1] = b.fecha.split('-').map(Number), [y2, m2, d2] = hoy().split('-').map(Number);
  const meses = Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)); // meses completos desde la compra
  const anos = meses / 12;
  return Math.round(compra * Math.max(.1, 1 - anos / vida));
}

const deudasActivas = () => datos.pagos.filter(p => p.tipo === 'deuda' && !p.pagado);
const montoDeuda = p => Number(p.saldo) || Number(p.monto) || 0;

function balance() {
  const cuentas = totalCuentas();
  const bienes = suma(datos.bienes, valorBien);
  const cobrar = suma(porCobrar(), o => o.precio);
  const deudas = suma(deudasActivas(), montoDeuda);
  const activos = cuentas + bienes + cobrar;
  return { cuentas, bienes, cobrar, deudas, activos, pasivos: deudas, neto: activos - deudas };
}

// La foto del mes se actualiza con cada cambio (la llama cambiarDatos antes de guardar).
function anotarPatrimonio() {
  const mes = hoy().slice(0, 7);
  const b = balance();
  const foto = { activos: b.activos, pasivos: b.pasivos, neto: b.neto };
  const actual = datos.historial.find(h => h.mes === mes);
  if (actual) Object.assign(actual, foto);
  else datos.historial.push({ id: uid(), mes, ...foto });
}

// ---------- Estado de resultados de un mes ----------
// Se arma con lo que de verdad pasó: movimientos de tus cuentas, pagos marcados y pedidos cobrados.
function resultadosMes(mes) {
  const enMes = f => (f || '').startsWith(mes);
  const deDeuda = new Set(datos.pagos.filter(p => p.tipo === 'deuda' && p.movId).map(p => p.movId));
  const ingresos = Object.create(null), operativos = Object.create(null);
  let financieros = 0;
  const sumar = (obj, k, v) => { obj[k] = (obj[k] || 0) + (Number(v) || 0); };

  for (const m of datos.movimientos) {
    if (!enMes(m.fecha)) continue;
    if (m.tipo === 'ingreso') sumar(ingresos, m.categoria || 'Otros', m.monto);
    else if (m.tipo === 'gasto') {
      if (deDeuda.has(m.id)) financieros += Number(m.monto) || 0;
      else sumar(operativos, m.categoria || 'Otros', m.monto);
    }
  }
  for (const p of datos.pagos) { // pagos marcados sin cuenta (no dejaron movimiento)
    if (!p.pagado || p.movId || !enMes(p.fechaPago || p.fecha)) continue;
    if (p.tipo === 'deuda') financieros += Number(p.monto) || 0;
    else sumar(operativos, 'Fijos', p.monto);
  }
  const vendidos = datos.pedidos.filter(o => o.estado === 'pagado' && (o.movId
    ? enMes((buscar('movimientos', o.movId) || {}).fecha) : enMes(o.fechaCobro)));
  for (const o of vendidos) if (!o.movId) sumar(ingresos, 'Negocio', o.precio);
  const costoVentas = suma(vendidos, o => o.precio - gananciaPedido(o));

  const totalIngresos = suma(Object.values(ingresos), v => v);
  const bruta = totalIngresos - costoVentas;
  const totalOperativos = suma(Object.values(operativos), v => v);
  const operativa = bruta - totalOperativos;
  const neto = operativa - financieros;
  return {
    ingresos: Object.entries(ingresos).sort((a, b) => b[1] - a[1]), totalIngresos, costoVentas, bruta,
    operativos: Object.entries(operativos).sort((a, b) => b[1] - a[1]), totalOperativos, operativa, financieros, neto,
    ahorro: totalIngresos ? Math.round(neto / totalIngresos * 100) : 0,
  };
}

let mesResultados = '';
const mesTexto = mes => MESES_LARGOS[Number(mes.slice(5)) - 1] + ' ' + mes.slice(0, 4);
const mesVecino = (mes, n) => deFecha(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 1 + n, 1)).slice(0, 7);
acciones.mesResultados = (id, el) => { mesResultados = mesVecino(mesResultados || hoy().slice(0, 7), Number(el.dataset.paso)); render(); };

// ---------- Pantalla ----------
function vistaPatrimonio() {
  const b = balance();
  const fotos = [...datos.historial].sort((x, y) => x.mes.localeCompare(y.mes));
  const anterior = fotos.filter(f => f.mes < hoy().slice(0, 7)).pop();
  const cambio = anterior ? b.neto - anterior.neto : null;

  return `${encabezado('Tu economía', 'Patrimonio', 'Lo que tienes, lo que debes, tus cosas y cómo va cambiando.', btnNuevo('bien', 'Agregar al inventario', {}, 'btn primario'))}
    <section class="rejilla patrimonio">
      <article class="tarjeta a-neto">
        ${cab('Patrimonio neto', 'lo que tienes − lo que debes', 'escudo')}
        <b class="gigante num ${b.neto < 0 ? 'rojo' : ''}" data-k="neto">${contador(b.neto)}</b>
        ${cambio !== null ? `<p class="detalle"><span class="${cambio < 0 ? 'rojo' : 'verde'}">${cambio < 0 ? '−' : '+'}${peso(Math.abs(cambio))}</span> desde ${esc(mesTexto(anterior.mes))}</p>` : '<p class="detalle">Cada mes queda guardada la foto para ver cómo creces.</p>'}
        <div class="stats tres">
          <div><span>Tienes</span><b class="verde num">${contador(b.activos)}</b></div>
          <div><span>Debes</span><b class="num ${b.pasivos ? 'rojo' : ''}">${contador(b.pasivos)}</b></div>
          <div><span>En cosas</span><b class="num">${contador(b.bienes)}</b></div>
        </div>
        ${graficoHistorial(fotos)}
      </article>

      <article class="tarjeta a-tienes">
        ${cab('Lo que tienes', peso(b.activos), 'ingreso')}
        ${ul([
          ...datos.cuentas.map(c => fila({
            izquierda: ico(c.tipo === 'efectivo' ? 'efectivo' : 'banco', 'acc'), titulo: esc(c.nombre),
            derecha: `<span class="${c.saldo < 0 ? 'rojo' : ''}">${peso(c.saldo)}</span>`,
            detalle: (c.tipo === 'efectivo' ? 'Efectivo' : 'Digital') + (c.actualizado ? ' · actualizado ' + hace(c.actualizado) : ' · sin actualizar'),
          })),
          ...(datos.bienes.length ? [fila({ izquierda: ico('caja', 'acc'), titulo: 'Inventario', derecha: peso(b.bienes), detalle: `${datos.bienes.length} ${datos.bienes.length === 1 ? 'cosa' : 'cosas'} · valor de hoy` })] : []),
          ...porCobrar().map(o => fila({ izquierda: ico('cobro', 'warn'), titulo: 'Te debe ' + esc(o.cliente), derecha: `<span class="ambar">${peso(o.precio)}</span>`, detalle: o.fechaCobro ? 'cobro ' + textoFecha(o.fechaCobro) : 'sin fecha de cobro' })),
        ], 'Agrega tus cuentas en <a class="enlace" href="#cuentas">Cuentas</a> y tus cosas en el inventario.')}
      </article>

      <article class="tarjeta a-debes">
        ${cab('Lo que debes', peso(b.pasivos), 'tarjeta')}
        ${ul(deudasActivas().sort(porFecha).map(p => fila({
          izquierda: ico('tarjeta', 'neg'), titulo: esc(p.nombre),
          derecha: `<span class="rojo">${peso(montoDeuda(p))}</span>`,
          detalle: [p.saldo && p.monto ? 'cuota ' + peso(p.monto) : (!p.monto ? 'cuota por confirmar' : ''), p.fecha ? 'vence ' + textoFecha(p.fecha) : '', p.mensual ? 'cada mes' : ''].filter(Boolean).join(' · '),
        })), 'Sin deudas pendientes.')}
        ${b.pasivos && b.activos ? `<p class="detalle">Lo que debes equivale al <b>${Math.round(b.pasivos / b.activos * 100)}%</b> de lo que tienes.</p>` : ''}
      </article>

      <article class="tarjeta a-resultados">${tarjetaResultados()}</article>
      <article class="tarjeta a-inventario">${tarjetaInventario(b.bienes)}</article>
      <article class="tarjeta a-linea">${lineaTiempo()}</article>
    </section>`;
}

// Línea del patrimonio neto mes a mes (se dibuja con 2 o más meses guardados)
function graficoHistorial(fotos) {
  if (fotos.length < 2) return '';
  const w = 320, h = 70, p = 6;
  const v = fotos.map(f => f.neto), min = Math.min(...v, 0), max = Math.max(...v, 0), rango = max - min || 1;
  const x = i => p + i * (w - 2 * p) / (fotos.length - 1), y = n => h - p - (n - min) / rango * (h - 2 * p);
  const linea = fotos.map((f, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(f.neto).toFixed(1)}`).join('');
  return `<svg class="mini-grafico" viewBox="0 0 ${w} ${h}" role="img" aria-label="Patrimonio neto por mes: ${fotos.map(f => esc(mesTexto(f.mes)) + ' ' + peso(f.neto)).join(', ')}">
      <line x1="0" x2="${w}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="cero"/>
      <path d="${linea}" class="linea-neto"/>
      ${fotos.map((f, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(f.neto).toFixed(1)}" r="3"><title>${esc(mesTexto(f.mes))}: ${peso(f.neto)}</title></circle>`).join('')}
    </svg>`;
}

function tarjetaResultados() {
  const mes = mesResultados || hoy().slice(0, 7);
  const r = resultadosMes(mes);
  const linea = (texto, valor, clase = '') => `<li class="${clase}"><span>${texto}</span><b class="num">${valor}</b></li>`;
  const menos = n => n ? '−' + peso(n) : '$0';
  const nav = `<div class="nav-mes">
      <button type="button" class="icono-btn" data-accion="mesResultados" data-paso="-1" aria-label="Mes anterior" title="Mes anterior">${ic('chevron')}</button>
      <span>${esc(mesTexto(mes))}</span>
      <button type="button" class="icono-btn siguiente" data-accion="mesResultados" data-paso="1" aria-label="Mes siguiente" title="Mes siguiente"${mes >= hoy().slice(0, 7) ? ' disabled' : ''}>${ic('chevron')}</button>
    </div>`;
  return `${cab('Estado de resultados', '', 'finanzas', nav)}
    <p class="detalle">Tu mes como si fueras una empresa: lo que entró, lo que costó y lo que quedó.</p>
    <ul class="resultados">
      ${linea('Ingresos', peso(r.totalIngresos), 'total')}
      ${r.ingresos.map(([k, v]) => linea(esc(k), peso(v), 'sub')).join('')}
      ${r.costoVentas ? linea('Costo de lo vendido', menos(r.costoVentas)) + linea('Utilidad bruta', peso(r.bruta), 'total') : ''}
      ${linea('Gastos del día a día', menos(r.totalOperativos))}
      ${r.operativos.map(([k, v]) => linea(esc(k), menos(v), 'sub')).join('')}
      ${linea('Utilidad operativa', peso(r.operativa), 'total')}
      ${linea('Pagos de deudas', menos(r.financieros))}
      ${linea('Resultado del mes', `<span class="${r.neto < 0 ? 'rojo' : 'verde'}">${peso(r.neto)}</span>`, 'final')}
    </ul>
    ${r.totalIngresos ? `<p class="detalle">${r.neto >= 0 ? `Te quedó el <b>${r.ahorro}%</b> de lo que entró.` : `Saliste <b>${peso(-r.neto)}</b> más de lo que entró.`}</p>`
      : '<p class="detalle">Registra ingresos y gastos en <a class="enlace" href="#cuentas">Cuentas</a> para armar tu estado de resultados.</p>'}`;
}

function tarjetaInventario(total) {
  const grupos = CATEGORIAS_BIEN.map(([k, t]) => [t, datos.bienes.filter(b => (VIDA_UTIL[b.categoria] !== undefined ? b.categoria : 'otro') === k)])
    .filter(([, lista]) => lista.length);
  const puntos = n => `<span class="aprecio" aria-label="Lo valoras ${n} de 5">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  return `${cab('Inventario', datos.bienes.length ? `${datos.bienes.length} ${datos.bienes.length === 1 ? 'cosa' : 'cosas'} · ${peso(total)}` : '', 'caja', btnNuevo('bien', 'Agregar'))}
    ${grupos.length ? grupos.map(([titulo, lista]) => `<h4 class="grupo">${titulo} <span>${peso(suma(lista, valorBien))}</span></h4>
      ${ul(lista.sort((a, c) => valorBien(c) - valorBien(a)).map(b => {
        const hoyVale = valorBien(b), compra = Number(b.valorCompra) || 0;
        return fila({
          col: 'bienes', id: b.id, izquierda: ico('caja', 'acc'), titulo: esc(b.nombre),
          derecha: peso(hoyVale),
          detalle: [compra ? 'costó ' + peso(compra) : '', b.fecha ? fechaCorta(b.fecha) : '', compra && hoyVale < compra ? `perdió ${Math.round((1 - hoyVale / compra) * 100)}%` : '', b.nota ? esc(b.nota) : ''].filter(Boolean).join(' · '),
          extra: b.aprecio ? puntos(Number(b.aprecio)) : '',
        });
      }))}`).join('')
      : '<p class="vacio">Empieza tu inventario: tu celular, tu portátil, tu ropa buena, lo que tenga valor para ti. Es tu punto de partida.</p>'}`;
}

// ---------- Línea de tiempo ----------
function eventosEconomicos() {
  const ev = [];
  for (const m of datos.movimientos) {
    const t = m.tipo;
    ev.push({
      fecha: m.fecha, icono: t === 'transferencia' ? 'transferir' : t, tono: t === 'ingreso' ? 'pos' : t === 'gasto' ? 'neg' : 'acc',
      texto: esc(m.nota || m.categoria || TIPOS_MOV[t] || 'Movimiento') + (t === 'transferencia' ? ` <span class="suave">${esc(nombreCuenta(m.cuenta))} → ${esc(nombreCuenta(m.destino))}</span>` : ''),
      monto: t === 'ingreso' ? m.monto : t === 'gasto' ? -m.monto : 0, transferencia: t === 'transferencia' ? m.monto : 0,
    });
  }
  for (const p of datos.pagos) if (p.pagado && !p.movId && (p.fechaPago || p.fecha)) {
    ev.push({ fecha: p.fechaPago || p.fecha, icono: 'tarjeta', tono: 'neg', texto: 'Pagaste ' + esc(p.nombre), monto: -(Number(p.monto) || 0) });
  }
  for (const o of datos.pedidos) if (o.estado === 'pagado' && !o.movId && o.fechaCobro) {
    ev.push({ fecha: o.fechaCobro, icono: 'cobro', tono: 'pos', texto: 'Cobraste a ' + esc(o.cliente), monto: Number(o.precio) || 0 });
  }
  for (const b of datos.bienes) if (b.fecha) {
    ev.push({ fecha: b.fecha, icono: 'caja', tono: 'acc', texto: 'Compraste ' + esc(b.nombre), monto: 0, bien: Number(b.valorCompra) || 0 });
  }
  return ev.filter(e => fechaValida(e.fecha)).sort((a, b) => b.fecha.localeCompare(a.fecha));
}

function lineaTiempo() {
  const ev = eventosEconomicos();
  const meses = [...new Set(ev.map(e => e.fecha.slice(0, 7)))];
  const fotos = new Map(datos.historial.map(h => [h.mes, h]));
  const mesActual = hoy().slice(0, 7);
  return `${cab('Línea de tiempo', ev.length ? `${ev.length} movimientos` : '', 'reloj')}
    ${meses.length ? `<div class="linea-tiempo">${meses.map((mes, i) => {
      const delMes = ev.filter(e => e.fecha.startsWith(mes));
      const entro = suma(delMes, e => Math.max(0, e.monto)), salio = suma(delMes, e => Math.max(0, -e.monto));
      const foto = fotos.get(mes);
      const compras = delMes.filter(e => e.bien !== undefined).length;
      return `<details class="mes-linea"${i === 0 || mes === mesActual ? ' open' : ''}>
        <summary>
          <span class="mes-nombre">${esc(mesTexto(mes))}</span>
          <span class="mes-cifras">${entro ? `<span class="verde">+${peso(entro)}</span>` : ''}${salio ? `<span>−${peso(salio)}</span>` : ''}${compras ? `<span class="acento">${compras} ${compras === 1 ? 'compra' : 'compras'}</span>` : ''}${foto ? `<span class="suave">neto ${peso(foto.neto)}</span>` : ''}</span>
          ${ic('chevron')}
        </summary>
        <ol>${delMes.map(e => `<li class="evento ${e.tono}">
            <span class="dia">${fechaCorta(e.fecha)}</span>
            <span class="punto-ev">${ic(e.icono)}</span>
            <span class="texto-ev">${e.texto}</span>
            <b class="num ${e.monto > 0 ? 'verde' : ''}">${e.monto ? (e.monto > 0 ? '+' : '−') + peso(Math.abs(e.monto)) : e.bien ? peso(e.bien) : e.transferencia ? peso(e.transferencia) : ''}</b>
          </li>`).join('')}</ol>
      </details>`;
    }).join('')}</div>`
      : '<p class="vacio">Aquí verás, mes a mes, todo lo que entra, sale y compras. Empieza registrando un movimiento con el botón +.</p>'}`;
}

// ---------- Formulario del inventario ----------
FORMULARIOS.bien = {
  col: 'bienes', boton: 'Agregar al inventario',
  titulo: b => b ? 'Editar del inventario' : 'Agregar al inventario',
  campos: b => {
    b = b || {};
    return campo('Qué es', 'nombre', b.nombre, 'required placeholder="Ej.: Celular, portátil, bicicleta"')
      + selector('Categoría', 'categoria', CATEGORIAS_BIEN, b.categoria || 'tecnologia')
      + campoDinero('Cuánto costó', 'valorCompra', b.valorCompra)
      + campoFecha('Cuándo lo compraste', 'fecha', b.fecha)
      + campoDinero('Cuánto vale hoy (vacío = lo calcula Jarvis)', 'valorActual', b.valorActual)
      + selector('Cuánto lo valoras', 'aprecio', [['5', '5 · Imprescindible'], ['4', '4 · Mucho'], ['3', '3 · Normal'], ['2', '2 · Poco'], ['1', '1 · Podría venderlo']], String(b.aprecio || 3))
      + campo('Nota', 'nota', b.nota, 'placeholder="Ej.: estado, garantía, dónde está"');
  },
  guardar: (d, previo) => {
    guardarItem('bienes', {
      ...previo, id: previo.id || uid(), nombre: d.nombre, categoria: d.categoria,
      valorCompra: d.valorCompra || 0, fecha: d.fecha, valorActual: d.valorActual, aprecio: Number(d.aprecio) || 3, nota: d.nota,
    });
  },
};
