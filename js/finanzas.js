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
  ? `<p class="aviso">⚠ Sin descontar (falta el mínimo): ${r.sinDescontar.map(p => esc(p.nombre)).join(', ')}</p>` : '';

// Lo que vence en los próximos 7 días (y lo ya vencido), lo más urgente primero.
function vencenPronto(conTareas) {
  const limite = sumarDias(hoy(), 7);
  const items = [];
  for (const p of datos.pagos) {
    if (!p.pagado && p.fecha && p.fecha <= limite)
      items.push({ icono: '💸', fecha: p.fecha, texto: p.nombre, porPagar: p.monto, id: p.id,
        monto: p.monto ? peso(p.monto) : 'por confirmar', accion: 'pagar', etiqueta: 'Marcar pagado' });
  }
  for (const o of porCobrar()) {
    if (o.fechaCobro && o.fechaCobro <= limite)
      items.push({ icono: '🧾', fecha: o.fechaCobro, texto: 'Cobrar a ' + o.cliente, id: o.id,
        monto: peso(o.precio), accion: 'cobrado', etiqueta: 'Marcar cobrado' });
  }
  if (conTareas) {
    for (const t of datos.tareas) {
      if (!t.hecha && t.fecha && t.fecha <= limite)
        items.push({ icono: '✅', fecha: t.fecha, texto: t.texto, id: t.id,
          monto: '', accion: 'tareaHecha', etiqueta: 'Marcar hecha' });
    }
  }
  return items.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

const totalPorPagar = items => suma(items, i => i.porPagar);

// Cada fila trae un ✓ para marcarla como pagada / cobrada / hecha sin salir de la pantalla.
const listaAlertas = (items, clase) => ul(items.map(i => fila({
  izquierda: `<span class="icono">${i.icono}</span>`,
  titulo: esc(i.texto), derecha: i.monto, detalle: textoFecha(i.fecha),
  ok: { accion: i.accion, id: i.id, etiqueta: i.etiqueta, nombre: i.texto },
})), 'Nada vence en los próximos 7 días 🎉', clase);

// ---------- Pantalla ----------
// Las clases a-xxx colocan cada tarjeta en la rejilla de PC (ver style.css); en celular van una tras otra.
function vistaFinanzas() {
  const [actual, siguiente] = quincenasVisibles();
  const alertas = vencenPronto(false);
  return `<h2 class="titulo">Finanzas</h2>
    <section class="rejilla finanzas">
      <article class="tarjeta a-vence${alertas.length ? ' alerta' : ''}">
        <h3>⏰ Vence en los próximos 7 días <small>${alertas.length ? peso(totalPorPagar(alertas)) + ' por pagar' : ''}</small></h3>
        ${listaAlertas(alertas, 'columnas-pc')}
      </article>
      ${tarjetaQuincena(resumenQuincena(actual), 'Quincena actual', 'a-actual')}
      ${tarjetaQuincena(resumenQuincena(siguiente), 'Siguiente quincena', 'a-siguiente')}
      ${seccionPagos('deuda', 'Deudas', 'deuda', 'a-deudas')}
      ${seccionPagos('fijo', 'Fijos', 'fijo', 'a-fijos')}
      ${seccionDiarios()}
      ${seccionPorCobrar()}
    </section>`;
}

function tarjetaQuincena(r, titulo, area) {
  const clave = esQuincena15(r.inicio) ? 'q15' : 'q30';
  const dia = clave.slice(1);
  const detalleDiarios = r.diarios.map(g => esc(g.nombre) + ' × ' + g.dias + ' días').join(' · ');
  return `<article class="tarjeta ${area}">
    <h3>${titulo} <small>${r.etiqueta}</small></h3>
    <div class="fila-cuenta"><span>Ingreso del ${dia}</span>
      <input class="monto-en-linea" inputmode="numeric" value="${miles(r.ingreso)}"
             data-cambio="ingreso" data-id="${clave}" aria-label="Ingreso quincena del ${dia}"></div>
    <div class="fila-cuenta"><span>Pagos</span><b>${resta(r.totalPagos)}</b></div>
    <div class="fila-cuenta"><span>Gastos diarios${detalleDiarios ? `<small>${detalleDiarios}</small>` : ''}</span><b>${resta(r.totalDiarios)}</b></div>
    <div class="fila-cuenta total"><span>Libre</span><b class="${r.libre < 0 ? 'rojo' : 'verde'}">${peso(r.libre)}</b></div>
    ${avisoSinDescontar(r)}
    ${r.cobros ? `<p class="suave">Por cobrar con fecha en esta quincena: <b>+${peso(r.cobros)}</b> · libre si cobras: <b>${peso(r.libre + r.cobros)}</b></p>` : ''}
  </article>`;
}

// ---------- Deudas y fijos (misma lista, misma forma) ----------
function seccionPagos(tipo, titulo, singular, area) {
  const previo = enEdicion('pagos');
  const item = previo && previo.tipo === tipo ? previo : null;
  const todos = datos.pagos.filter(p => p.tipo === tipo);
  const pendientes = todos.filter(p => !p.pagado).sort(porFecha);
  const pagados = todos.filter(p => p.pagado)
    .sort((a, b) => (b.fechaPago || b.fecha || '').localeCompare(a.fechaPago || a.fecha || ''));
  return `<article class="tarjeta ${area}">
    <h3>${titulo} <small>${pendientes.length} pendiente${pendientes.length === 1 ? '' : 's'} · ${peso(suma(pendientes, p => p.monto))}</small></h3>
    ${ul(pendientes.map(filaPago), 'Nada pendiente 🎉')}
    ${pagados.length ? `<details class="pagados"><summary>Pagados (${pagados.length})</summary>${ul(pagados.map(filaPago))}</details>` : ''}
    ${formulario('pago', 'Agregar ' + singular, item, camposPago(item, tipo))}
  </article>`;
}

function camposPago(p, tipo) {
  p = p || {};
  return campo('Nombre', 'nombre', p.nombre, 'required')
    + selector('Tipo', 'tipo', [['deuda', 'Deuda'], ['fijo', 'Fijo']], p.tipo || tipo)
    + campoDinero('Monto a pagar (vacío = por confirmar)', 'monto', p.monto)
    + campoDinero('Deuda total (opcional)', 'saldo', p.saldo)
    + campoFecha('Fecha límite', 'fecha', p.fecha)
    + casilla('Se repite cada mes', 'mensual', p.mensual)
    + casilla('Se paga con cobros (no resta de la quincena)', 'conCobros', p.conCobros)
    + campo('Nota', 'nota', p.nota);
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
    p.nota ? esc(p.nota) : '',
  ].filter(Boolean).join(' · ');
  return fila({
    col: 'pagos', id: p.id, clase: p.pagado ? 'hecho' : '',
    titulo: esc(p.nombre),
    derecha: p.monto ? peso(p.monto) : (p.pagado ? '' : '<span class="ambar">mínimo por confirmar</span>'),
    detalle,
    extra: `<button class="pagar${p.pagado ? ' hecho' : ''}" data-accion="pagar" data-id="${esc(p.id)}">${p.pagado ? '↩ Deshacer' : '✓ Marcar pagado'}</button>`,
  });
}

formularios.pago = d => {
  const previo = enEdicion('pagos') || {};
  guardarItem('pagos', {
    ...previo, id: previo.id || uid(),
    nombre: d.nombre, tipo: d.tipo, monto: d.monto || 0, saldo: d.saldo || 0, fecha: d.fecha,
    mensual: d.mensual, conCobros: d.conCobros, nota: d.nota,
  });
};

// Pagar = marcar pagado. Si se repite cada mes, nace el del mes siguiente.
// Deshacer = lo contrario (y borra el del mes siguiente si nadie lo ha tocado).
acciones.pagar = id => {
  const p = buscar('pagos', id);
  if (!p) return;
  if (p.pagado) {
    const sig = p.siguienteId && buscar('pagos', p.siguienteId);
    if (sig && !sig.pagado) borrarItem('pagos', sig.id);
    p.pagado = false; p.fechaPago = ''; p.siguienteId = '';
  } else {
    p.pagado = true; p.fechaPago = hoy();
    if (p.mensual && p.fecha) {
      const sig = { ...p, id: uid(), fecha: sumarMes(p.fecha), pagado: false, fechaPago: '', siguienteId: '' };
      datos.pagos.push(sig);
      p.siguienteId = sig.id;
    }
  }
};

cambios.ingreso = (clave, valor) => { datos.ingresos[clave] = dinero(valor); };

// ---------- Gastos diarios ----------
function seccionDiarios() {
  const item = enEdicion('diarios');
  const g = item || { soloHabiles: true };
  const filas = datos.diarios.map(x => fila({
    col: 'diarios', id: x.id, titulo: esc(x.nombre), derecha: peso(x.monto) + '/día',
    detalle: x.soloHabiles ? 'solo entre semana (lun–vie)' : 'todos los días',
  }));
  return `<article class="tarjeta a-diarios">
    <h3>Gastos diarios <small>se restan del libre</small></h3>
    ${ul(filas, 'Sin gastos diarios.')}
    ${formulario('diario', 'Agregar gasto diario', item,
      campo('Nombre', 'nombre', g.nombre, 'required')
      + campoDinero('Monto por día', 'monto', g.monto, 'required')
      + casilla('Solo entre semana (lunes a viernes)', 'soloHabiles', g.soloHabiles))}
  </article>`;
}

formularios.diario = d => {
  const previo = enEdicion('diarios') || {};
  guardarItem('diarios', { ...previo, id: previo.id || uid(), nombre: d.nombre, monto: d.monto || 0, soloHabiles: d.soloHabiles });
};

// ---------- Por cobrar (pedidos entregados y sin pagar) ----------
function seccionPorCobrar() {
  const lista = porCobrar().sort((a, b) => (a.fechaCobro || '9999').localeCompare(b.fechaCobro || '9999'));
  return `<article class="tarjeta a-cobrar">
    <h3>Por cobrar <small>${peso(suma(lista, o => o.precio))}</small></h3>
    ${ul(lista.map(filaCobro), 'Nadie te debe por ahora.', 'columnas-pc')}
    <p class="suave">Aquí salen los pedidos entregados y sin pagar. <a href="#parfums">Registrar un pedido →</a></p>
  </article>`;
}

const filaCobro = o => fila({
  titulo: esc(o.cliente) + (o.perfume ? ` <span class="suave">· ${esc(o.perfume)}</span>` : ''),
  derecha: peso(o.precio),
  detalle: o.fechaCobro ? 'cobrar ' + textoFecha(o.fechaCobro) : 'sin fecha de cobro',
  extra: `<button class="pagar" data-accion="cobrado" data-id="${esc(o.id)}">✓ Cobrado</button>`,
});

acciones.cobrado = id => { const o = buscar('pedidos', id); if (o) o.estado = 'pagado'; };
