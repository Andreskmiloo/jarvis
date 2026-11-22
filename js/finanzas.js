// ===== FINANZAS =====
// Cada pago "pesa" en la quincena de su fecha:
//   pendiente → su fecha (si ya venció, pesa en la quincena actual)
//   pagado    → el día que se pagó (así el "libre" no sube al pagar)

const porFecha = (a, b) => (a.fecha || '9999').localeCompare(b.fecha || '9999');
const enQuincena = (fecha, inicio) => !!fecha && inicioQuincena(fecha) === inicio;
const porCobrar = () => datos.pedidos.filter(o => o.estado === 'entregado');

// Un pendiente que ya venció pesa hoy; uno futuro pesa en su fecha.
const efectiva = fecha => (fecha && fecha < hoy() ? hoy() : fecha);

function fechaContable(p) {
  return p.pagado ? (p.fechaPago || p.fecha) : efectiva(p.fecha);
}

// Cuánto queda libre en la quincena que empieza en `inicio`:
//   libre = ingreso − pagos − gastos diarios   (los pagos "con cobros" no restan)
function resumenQuincena(inicio) {
  const fin = siguienteQuincena(inicio);
  const ingreso = Number(datos.ingresos[esQuincena15(inicio) ? 'q15' : 'q30']) || 0;
  const delPeriodo = datos.pagos.filter(p => !p.conCobros && enQuincena(fechaContable(p), inicio));
  const totalPagos = suma(delPeriodo, p => p.monto);
  const diarios = datos.diarios.map(g => {
    const dias = diasEnPeriodo(inicio, fin, g.soloHabiles);
    return { nombre: g.nombre, dias, total: (Number(g.monto) || 0) * dias };
  });
  const totalDiarios = suma(diarios, g => g.total);
  const cobros = suma(porCobrar().filter(o => enQuincena(efectiva(o.fechaCobro), inicio)), o => o.precio);
  return {
    inicio, etiqueta: etiquetaQuincena(inicio), ingreso, totalPagos, diarios, totalDiarios, cobros,
    libre: ingreso - totalPagos - totalDiarios,
    sinDescontar: delPeriodo.filter(p => !p.pagado && !p.monto && p.saldo), // falta el mínimo
  };
}

const resta = n => n ? '−' + peso(n) : '$0';
const quincenasVisibles = () => { const a = inicioQuincena(hoy()); return [a, siguienteQuincena(a)]; };
const avisoSinDescontar = r => r.sinDescontar.length
  ? `<p class="aviso">${ic('alerta')}<span>Sin descontar (falta el mínimo): ${r.sinDescontar.map(p => esc(p.nombre)).join(', ')}</span></p>` : '';

// Lo que vence en los próximos 7 días (y lo ya vencido), lo más urgente primero.
const claseUrgencia = f => { const n = diasHasta(f); return n < 0 ? 'neg' : n <= 2 ? 'warn' : 'acc'; };

function vencenPronto(conTareas) {
  const limite = sumarDias(hoy(), 7);
  const items = [];
  for (const p of datos.pagos) {
    if (!p.pagado && p.fecha && p.fecha <= limite)
      items.push({ icono: 'pago', clase: claseUrgencia(p.fecha), fecha: p.fecha, texto: p.nombre, porPagar: p.monto, id: p.id,
        monto: p.monto ? peso(p.monto) : 'por confirmar', accion: 'pagar', etiqueta: 'Marcar pagado' });
  }
  for (const o of porCobrar()) {
    if (o.fechaCobro && o.fechaCobro <= limite)
      items.push({ icono: 'cobro', clase: claseUrgencia(o.fechaCobro), fecha: o.fechaCobro, texto: 'Cobrar a ' + o.cliente, id: o.id,
        monto: peso(o.precio), accion: 'cobrado', etiqueta: 'Marcar cobrado' });
  }
  if (conTareas) {
    for (const t of datos.tareas) {
      if (!t.hecha && t.fecha && t.fecha <= limite)
        items.push({ icono: 'tarea', clase: claseUrgencia(t.fecha), fecha: t.fecha, texto: t.texto, id: t.id,
          monto: '', accion: 'tareaHecha', etiqueta: 'Marcar hecha' });
    }
  }
  return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

const totalPorPagar = items => suma(items, i => i.porPagar);

// Cada fila trae un botón para marcarla como pagada / cobrada / hecha sin salir de la pantalla.
const listaAlertas = (items, clase) => ul(items.map(i => fila({
  izquierda: ico(i.icono, i.clase),
  titulo: esc(i.texto), derecha: i.monto, detalle: textoFecha(i.fecha),
  ok: { accion: i.accion, id: i.id, etiqueta: i.etiqueta, nombre: i.texto },
})), 'Nada vence en los próximos 7 días.', clase);

// ---------- Pantalla ----------
// Las clases a-xxx colocan cada tarjeta en la rejilla de PC (ver style.css); en celular van una tras otra.
function vistaFinanzas() {
  const [actual, siguiente] = quincenasVisibles();
  const alertas = vencenPronto(false);
  return `${encabezado('Flujo y compromisos', 'Finanzas', 'Quincenas, deudas, fijos y lo que te deben.')}
    <section class="rejilla finanzas">
      <article class="tarjeta a-vence${alertas.length ? ' alerta' : ''}">
        ${cab('Vence en los próximos 7 días', alertas.length ? peso(totalPorPagar(alertas)) + ' por pagar' : '', 'reloj')}
        ${listaAlertas(alertas, 'columnas-pc')}
      </article>
      ${tarjetaQuincena(resumenQuincena(actual), 'Quincena actual', 'a-actual')}
      ${tarjetaQuincena(resumenQuincena(siguiente), 'Siguiente quincena', 'a-siguiente')}
      ${seccionPagos('deuda', 'Deudas', 'a-deudas', 'tarjeta')}
      ${seccionPagos('fijo', 'Fijos', 'a-fijos', 'repetir')}
      ${seccionDiarios()}
      ${seccionPorCobrar()}
    </section>`;
}

function tarjetaQuincena(r, titulo, area) {
  const clave = esQuincena15(r.inicio) ? 'q15' : 'q30';
  const dia = clave.slice(1);
  const base = Math.max(r.ingreso, r.totalPagos + r.totalDiarios, 1); // si gastas más de lo que entra, la barra queda llena
  const parte = n => limitarPct(Math.max(0, n) / base * 100);
  const detalleDiarios = r.diarios.map(g => esc(g.nombre) + ' × ' + g.dias + ' días').join(' · ');
  const seg = (clase, n) => `<i class="${clase}" data-p="${parte(n)}" style="--p:${parte(n)}"></i>`;
  return `<article class="tarjeta ${area}">
    ${cab(titulo, r.etiqueta, 'calendario')}
    <div class="fila-cuenta"><span>Ingreso del ${dia}</span>
      <input class="monto-en-linea" inputmode="numeric" value="${miles(r.ingreso)}"
             data-cambio="ingreso" data-id="${clave}" aria-label="Ingreso quincena del ${dia}"></div>
    <div class="reparto" aria-hidden="true">${seg('pagos', r.totalPagos)}${seg('diarios', r.totalDiarios)}${seg('libre', r.libre)}</div>
    <div class="fila-cuenta"><span class="leyenda pagos">Pagos</span><b data-k="pagos">${resta(r.totalPagos)}</b></div>
    <div class="fila-cuenta"><span class="leyenda diarios">Gastos diarios${detalleDiarios ? `<small>${detalleDiarios}</small>` : ''}</span><b data-k="diarios">${resta(r.totalDiarios)}</b></div>
    <div class="fila-cuenta total"><span class="leyenda libre">Libre</span><b class="num ${r.libre < 0 ? 'rojo' : 'verde'}" data-k="libre">${contador(r.libre)}</b></div>
    ${avisoSinDescontar(r)}
    ${r.cobros ? `<p class="nota">Por cobrar con fecha en esta quincena: <b>+${peso(r.cobros)}</b> · libre si cobras: <b>${peso(r.libre + r.cobros)}</b></p>` : ''}
  </article>`;
}

// ---------- Deudas y fijos (misma lista, misma forma) ----------
function seccionPagos(tipo, titulo, area, icono) {
  const todos = datos.pagos.filter(p => p.tipo === tipo);
  const pendientes = todos.filter(p => !p.pagado).sort(porFecha);
  const pagados = todos.filter(p => p.pagado)
    .sort((a, b) => (b.fechaPago || b.fecha || '').localeCompare(a.fechaPago || a.fecha || ''));
  const resumen = `${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'} · ${peso(suma(pendientes, p => p.monto))}`;
  return `<article class="tarjeta ${area}">
    ${cab(titulo, resumen, icono, btnNuevo('pago', 'Agregar', { tipo }))}
    ${ul(pendientes.map(filaPago), 'Nada pendiente.')}
    ${pagados.length ? `<details class="mas pagados"><summary>Pagados (${pagados.length}) ${ic('chevron')}</summary>${ul(pagados.map(filaPago))}</details>` : ''}
  </article>`;
}

function filaPago(p) {
  const cuandoPago = p.fechaPago || p.fecha;
  const fecha = p.pagado
    ? 'pagado' + (cuandoPago ? ' el ' + fechaCorta(cuandoPago) : '')
    : (p.fecha ? 'vence ' + textoFecha(p.fecha) : 'sin fecha');
  const detalle = [
    fecha,
    p.saldo ? 'deuda total ' + peso(p.saldo) : '',
    p.mensual ? 'cada mes' : '',
    p.conCobros ? 'se paga con cobros' : '',
    p.cuenta ? 'desde ' + esc(nombreCuenta(p.cuenta)) : '',
    p.nota ? esc(p.nota) : '',
  ].filter(Boolean).join(' · ');
  return fila({
    col: 'pagos', id: p.id, clase: p.pagado ? 'hecho' : '',
    izquierda: ico(p.tipo === 'fijo' ? 'repetir' : 'tarjeta', p.pagado ? 'mut' : p.tipo === 'fijo' ? 'acc' : 'warn'),
    titulo: esc(p.nombre),
    derecha: p.monto ? peso(p.monto) : (p.pagado ? '' : '<span class="ambar">mínimo por confirmar</span>'),
    detalle,
    ok: { accion: 'pagar', id: p.id, nombre: p.nombre, etiqueta: p.pagado ? 'Deshacer' : 'Marcar pagado', variante: p.pagado ? 'deshacer' : '' },
  });
}

FORMULARIOS.pago = {
  col: 'pagos',
  titulo: (p, ctx) => p ? 'Editar pago' : (ctx.tipo === 'fijo' ? 'Nuevo fijo' : 'Nueva deuda'),
  campos: (p, ctx) => {
    p = p || {};
    return campo('Nombre', 'nombre', p.nombre, 'required')
      + selector('Tipo', 'tipo', [['deuda', 'Deuda'], ['fijo', 'Fijo']], p.tipo || ctx.tipo || 'deuda')
      + campoDinero('Monto a pagar (vacío = por confirmar)', 'monto', p.monto)
      + campoDinero('Deuda total (opcional)', 'saldo', p.saldo)
      + campoFecha('Fecha límite', 'fecha', p.fecha)
      + (datos.cuentas.length ? selector('Se paga desde (descuenta el saldo al pagar)', 'cuenta', opcionesCuentas(true), p.cuenta || '') : '')
      + casilla('Se repite cada mes', 'mensual', p.mensual)
      + casilla('Se paga con cobros (no resta de la quincena)', 'conCobros', p.conCobros)
      + campo('Nota', 'nota', p.nota);
  },
  guardar: (d, previo) => {
    const pago = {
      ...previo, id: previo.id || uid(),
      nombre: d.nombre, tipo: d.tipo, monto: d.monto || 0, saldo: d.saldo || 0, fecha: d.fecha,
      cuenta: d.cuenta || '', mensual: d.mensual, conCobros: d.conCobros, nota: d.nota,
    };
    if (pago.fecha !== previo.fecha) pago.diaMensual = Number(pago.fecha.slice(-2));
    if (pago.origenMensual) pago.cuotaEditada = true;
    if (pago.pagado && (pago.movId || pago.monto !== previo.monto || pago.cuenta !== (previo.cuenta || ''))) {
      sincronizarMovimiento(pago, 'gasto', pago.monto, 'Pagos', pago.nombre, pago.fechaPago);
    }
    guardarItem('pagos', pago);
  },
};

function siguientePagoMensual(p) {
  const fecha = sumarMes(p.fecha, p.diaMensual);
  const serie = p.serieMensual || p.id;
  const existente = buscar('pagos', p.siguienteId) ||
    datos.pagos.find(x => x.serieMensual === serie && (x.periodoMensual || (x.fecha || '').slice(0, 7)) === fecha.slice(0, 7));
  if (existente) return existente.id;

  const cuota = {
    ...p, id: uid(), fecha, pagado: false, fechaPago: '', siguienteId: '', movId: '',
    origenMensual: p.id, serieMensual: serie, diaMensual: p.diaMensual || Number(p.fecha.slice(-2)),
    periodoMensual: fecha.slice(0, 7), cuotaEditada: false,
  };
  datos.pagos.push(cuota);
  return cuota.id;
}

acciones.pagar = id => {
  const p = buscar('pagos', id);
  if (!p) return;
  if (p.pagado) {
    const sig = buscar('pagos', p.siguienteId);
    if (sig && !sig.pagado && sig.cuotaEditada === false && !sig.siguienteId) {
      borrarItem('pagos', sig.id);
      p.siguienteId = '';
    }
    if (p.movId) quitarMov(p.movId);
    p.pagado = false; p.fechaPago = ''; p.movId = '';
    avisar('Pago revertido');
    return;
  }
  p.pagado = true; p.fechaPago = hoy();
  sincronizarMovimiento(p, 'gasto', p.monto, 'Pagos', p.nombre, p.fechaPago);
  if (p.mensual && p.fecha) p.siguienteId = siguientePagoMensual(p);
  const cuenta = p.movId && buscar('cuentas', p.cuenta);
  avisar(cuenta ? 'Pagado. Se descontó de ' + cuenta.nombre : 'Marcado como pagado');
};

cambios.ingreso = (clave, valor) => { datos.ingresos[clave] = dinero(valor); };

// ---------- Gastos diarios ----------
function seccionDiarios() {
  const filas = datos.diarios.map(x => fila({
    col: 'diarios', id: x.id, izquierda: ico('calendario', 'acc'),
    titulo: esc(x.nombre), derecha: peso(x.monto) + '/día',
    detalle: x.soloHabiles ? 'solo entre semana (lun–vie)' : 'todos los días',
  }));
  return `<article class="tarjeta a-diarios">
    ${cab('Gastos diarios', 'se restan del libre', 'pulso', btnNuevo('diario', 'Agregar'))}
    ${ul(filas, 'Sin gastos diarios.')}
  </article>`;
}

FORMULARIOS.diario = {
  col: 'diarios',
  titulo: g => g ? 'Editar gasto diario' : 'Nuevo gasto diario',
  campos: g => {
    g = g || { soloHabiles: true };
    return campo('Nombre', 'nombre', g.nombre, 'required')
      + campoDinero('Monto por día', 'monto', g.monto, 'required')
      + casilla('Solo entre semana (lunes a viernes)', 'soloHabiles', g.soloHabiles);
  },
  guardar: (d, previo) => {
    guardarItem('diarios', { ...previo, id: previo.id || uid(), nombre: d.nombre, monto: d.monto || 0, soloHabiles: d.soloHabiles });
  },
};

// ---------- Por cobrar (pedidos entregados y sin pagar) ----------
function seccionPorCobrar() {
  const lista = porCobrar().sort((a, b) => (a.fechaCobro || '9999').localeCompare(b.fechaCobro || '9999'));
  return `<article class="tarjeta a-cobrar">
    ${cab('Por cobrar', peso(suma(lista, o => o.precio)), 'cobro')}
    ${ul(lista.map(filaCobro), 'Nadie te debe por ahora.', 'columnas-pc')}
    <p class="pie">Aquí salen los pedidos entregados y sin pagar. <a href="#negocio">Registrar un pedido ${ic('flecha')}</a></p>
  </article>`;
}

const filaCobro = o => fila({
  izquierda: ico('cobro', o.fechaCobro && o.fechaCobro < hoy() ? 'neg' : 'acc'),
  titulo: esc(o.cliente) + (o.producto ? ` <span class="suave">· ${esc(o.producto)}</span>` : ''),
  derecha: peso(o.precio),
  detalle: o.fechaCobro ? 'cobrar ' + textoFecha(o.fechaCobro) : 'sin fecha de cobro',
  ok: { accion: 'cobrado', id: o.id, nombre: o.cliente, etiqueta: 'Marcar cobrado' },
});
