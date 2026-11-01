// ===== NEGOCIO (emprendimiento): ventas, pedidos y ganancia =====

const ESTADOS = [['pedido', 'Pedido'], ['entregado', 'Entregado'], ['pagado', 'Pagado']];

const costoConocido = o => o.costo !== null && o.costo !== undefined && o.costo !== '';
// Sin costo se usa la ganancia estimada por venta (~$100.000, editable en esta pantalla)
const gananciaPedido = o => costoConocido(o)
  ? (Number(o.precio) || 0) - (Number(o.costo) || 0)
  : Number(datos.config.gananciaEstimada) || 0;

// Cambia el estado de un pedido. Si pasa a "pagado" y tiene cuenta, el cobro suma al saldo (y se revierte al deshacer).
function fijarEstadoPedido(o, estado) {
  const antes = o.estado;
  o.estado = estado;
  if (estado === 'pagado' && antes !== 'pagado') {
    const cuenta = o.cuenta && buscar('cuentas', o.cuenta);
    if (cuenta && o.precio) {
      o.movId = registrarMov({ tipo: 'ingreso', monto: o.precio, cuenta: cuenta.id, categoria: 'Negocio', nota: 'Cobro ' + o.cliente }).id;
      avisar('Cobrado. Entró a ' + cuenta.nombre);
    } else {
      avisar('Marcado como cobrado');
    }
  } else if (antes === 'pagado' && estado !== 'pagado' && o.movId) {
    quitarMov(o.movId);
    o.movId = '';
  }
}
acciones.cobrado = id => { const o = buscar('pedidos', id); if (o) fijarEstadoPedido(o, 'pagado'); };
cambios.estadoPedido = (id, valor) => { const o = buscar('pedidos', id); if (o) fijarEstadoPedido(o, valor); };
cambios.gananciaEstimada = (id, valor) => { datos.config.gananciaEstimada = dinero(valor); };

function vistaNegocio() {
  const vendido = suma(datos.pedidos, o => o.precio);
  const ganancia = suma(datos.pedidos, gananciaPedido);
  const estimada = datos.pedidos.some(o => !costoConocido(o));
  const meta = datos.metas.find(m => m.auto === 'ventas');
  const info = meta ? infoMeta(meta) : null;
  const rango = { pedido: 0, entregado: 1, pagado: 2 }; // en proceso primero, lo más nuevo arriba
  const pedidos = [...datos.pedidos].reverse().sort((a, b) => (rango[a.estado] ?? 0) - (rango[b.estado] ?? 0));
  const ticket = datos.pedidos.length ? vendido / datos.pedidos.length : 0;

  return `${encabezado('Emprendimiento', 'Negocio', 'Ventas, pedidos y ganancia hacia tu meta.', btnNuevo('pedido', 'Nuevo pedido', {}, 'btn primario'))}
    <section class="rejilla negocio">
      <article class="tarjeta a-meta">
        ${cab(meta ? esc(meta.nombre) : 'Ventas del negocio', meta && meta.fecha ? textoFecha(meta.fecha) : '', 'meta')}
        <div class="meta-hero">
          ${info && info.objetivo ? anillo(info.pct, `<b>${info.pct}%</b>`, 'grande' + (info.atrasada ? ' atrasada' : '')) : ''}
          <div class="meta-cifras">
            <span class="etiqueta">Total vendido</span>
            <b class="gigante num" data-k="vendido">${contador(vendido)}</b>
            ${info && info.objetivo ? `<span class="detalle">de ${peso(info.objetivo)} · faltan ${peso(Math.max(0, info.objetivo - vendido))}</span>` : ''}
          </div>
        </div>
        <div class="stats">
          <div><span>Ganancia${estimada ? ' (estimada)' : ''}</span><b class="verde num">${estimada ? '~' : ''}${contador(ganancia)}</b></div>
          <div><span>Por cobrar</span><b class="ambar num">${contador(suma(porCobrar(), o => o.precio))}</b></div>
          <div><span>Pedidos</span><b class="num">${contador(datos.pedidos.length, 'entero')}</b></div>
          <div><span>Ticket promedio</span><b class="num">${contador(ticket)}</b></div>
        </div>
        <label class="en-linea">Ganancia estimada por venta (si no pones el costo)
          <input class="monto-en-linea" inputmode="numeric" value="${miles(datos.config.gananciaEstimada)}"
                 data-cambio="gananciaEstimada" aria-label="Ganancia estimada por venta"></label>
      </article>

      <article class="tarjeta a-ritmo">${tarjetaRitmo(vendido, meta, info, ticket)}</article>

      <article class="tarjeta a-pedidos">
        ${cab('Pedidos', String(pedidos.length), 'negocio', btnNuevo('pedido', 'Agregar'))}
        ${ul(pedidos.map(filaPedido), 'Aún no hay pedidos.', 'columnas')}
      </article>
    </section>`;
}

// Cuánto hay que vender por semana para llegar a la meta a tiempo, y cómo se reparten las ventas.
function tarjetaRitmo(vendido, meta, info, ticket) {
  const dias = meta && meta.fecha ? diasHasta(meta.fecha) : 0;
  const faltante = info ? Math.max(0, info.objetivo - vendido) : 0;
  const semanas = dias > 0 ? Math.max(1, Math.ceil(dias / 7)) : 0;
  let ritmo;
  if (!meta || !info.objetivo) ritmo = '<p class="vacio">Crea una meta de ventas para ver el ritmo que necesitas.</p>';
  else if (faltante <= 0) ritmo = '<p class="aviso ok">' + ic('ok') + '<span>Meta alcanzada. Buen trabajo.</span></p>';
  else if (!semanas) ritmo = '<p class="vacio">La fecha de la meta ya pasó o no está definida.</p>';
  else {
    const porSemana = faltante / semanas;
    ritmo = `<div class="stats dos">
        <div><span>Ventas por semana</span><b class="num" data-k="por-semana">${contador(porSemana)}</b></div>
        <div><span>Pedidos por semana</span><b class="num">${ticket ? contador(Math.ceil(porSemana / ticket), 'entero') : '—'}</b></div>
      </div>`;
  }
  const porEstado = ESTADOS.map(([k, t]) => ({ k, t, valor: suma(datos.pedidos.filter(o => o.estado === k), o => o.precio) }));
  const segmentos = porEstado.map(e => {
    const p = vendido > 0 ? limitarPct(e.valor / vendido * 100) : 0;
    return `<i class="${e.k}" data-p="${p}" style="--p:${p}"></i>`;
  }).join('');
  return `${cab('Ritmo necesario', semanas ? `${semanas} ${semanas === 1 ? 'semana' : 'semanas'} para la meta` : '', 'tendencia')}
    ${ritmo}
    <span class="etiqueta separado">Ventas por estado</span>
    <div class="reparto" aria-hidden="true">${segmentos}</div>
    ${porEstado.map(e => `<div class="fila-cuenta"><span class="leyenda ${e.k}">${e.t}</span><b>${peso(e.valor)}</b></div>`).join('')}`;
}

const selEstado = o => `<select class="estado ${esc(o.estado)}" data-cambio="estadoPedido" data-id="${esc(o.id)}" aria-label="Estado del pedido">
  ${ESTADOS.map(([v, t]) => `<option value="${v}"${v === o.estado ? ' selected' : ''}>${t}</option>`).join('')}</select>`;

function filaPedido(o) {
  const conocido = costoConocido(o);
  const detalle = [
    conocido ? 'costo ' + peso(o.costo) : 'sin costo',
    'ganancia ' + (conocido ? '' : '~') + peso(gananciaPedido(o)),
    o.estado === 'entregado' ? (o.fechaCobro ? 'cobrar ' + textoFecha(o.fechaCobro) : 'sin fecha de cobro') : '',
    o.cuenta ? 'cobra en ' + esc(nombreCuenta(o.cuenta)) : '',
  ].filter(Boolean).join(' · ');
  return fila({
    col: 'pedidos', id: o.id, clase: o.estado === 'pagado' ? 'hecho' : '',
    izquierda: ico('negocio', o.estado === 'pagado' ? 'pos' : o.estado === 'entregado' ? 'acc' : 'warn'),
    titulo: esc(o.cliente) + (o.producto ? ` <span class="suave">· ${esc(o.producto)}</span>` : ''),
    derecha: peso(o.precio),
    detalle,
    extra: selEstado(o),
  });
}

FORMULARIOS.pedido = {
  col: 'pedidos', boton: 'Agregar pedido',
  titulo: o => o ? 'Editar pedido' : 'Nuevo pedido',
  campos: o => {
    o = o || {};
    return campo('Cliente', 'cliente', o.cliente, 'required')
      + campo('Producto', 'producto', o.producto)
      + campoDinero('Precio de venta', 'precio', o.precio, 'required')
      + campoDinero('Costo (opcional)', 'costo', o.costo)
      + selector('Estado', 'estado', ESTADOS, o.estado || 'pedido')
      + campoFecha('Fecha en que me paga (opcional)', 'fechaCobro', o.fechaCobro)
      + (datos.cuentas.length ? selector('Cobro entra a (suma al saldo al cobrar)', 'cuenta', opcionesCuentas(true), o.cuenta || '') : '');
  },
  guardar: (d, previo) => {
    const id = previo.id || uid();
    guardarItem('pedidos', {
      ...previo, id, cliente: d.cliente, producto: d.producto, precio: d.precio || 0,
      costo: d.costo, // vacío = null = se usa la ganancia estimada
      estado: previo.estado || 'pedido', fechaCobro: d.fechaCobro, cuenta: d.cuenta || '',
    });
    fijarEstadoPedido(buscar('pedidos', id), d.estado); // aplica el efecto en las cuentas si cambió
  },
};
