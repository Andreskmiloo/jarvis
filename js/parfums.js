// ===== PRESENCIA PARFUMS =====

const ESTADOS = [['pedido', 'Pedido'], ['entregado', 'Entregado'], ['pagado', 'Pagado']];

const costoConocido = o => o.costo !== null && o.costo !== undefined && o.costo !== '';
// Sin costo se usa la ganancia estimada por perfume (~$100.000, editable abajo)
const gananciaPedido = o => costoConocido(o)
  ? (Number(o.precio) || 0) - (Number(o.costo) || 0)
  : Number(datos.config.gananciaEstimada) || 0;

function vistaParfums() {
  const vendido = suma(datos.pedidos, o => o.precio);
  const ganancia = suma(datos.pedidos, gananciaPedido);
  const estimada = datos.pedidos.some(o => !costoConocido(o));
  const meta = datos.metas.find(m => m.auto === 'ventas');
  const info = meta ? infoMeta(meta) : null;
  const item = enEdicion('pedidos');
  const rango = { pedido: 0, entregado: 1, pagado: 2 }; // en proceso primero, lo más nuevo arriba
  const pedidos = [...datos.pedidos].reverse().sort((a, b) => (rango[a.estado] ?? 0) - (rango[b.estado] ?? 0));
  return `<h2 class="titulo">Presencia Parfums</h2>
    <section class="rejilla">
      <article class="tarjeta ancho">
        <h3>🧴 ${meta ? esc(meta.nombre) : 'Ventas de perfumes'} <small>${meta && meta.fecha ? textoFecha(meta.fecha) : ''}</small></h3>
        ${info && info.objetivo ? barraMeta(info) + `<div class="linea detalle"><span>${peso(vendido)} de ${peso(info.objetivo)} · faltan ${peso(Math.max(0, info.objetivo - vendido))}</span><span>${info.pct}%</span></div>` : ''}
        <div class="stats">
          <div><span>Total vendido</span><b>${peso(vendido)}</b></div>
          <div><span>Ganancia${estimada ? ' (estimada)' : ''}</span><b class="verde">${estimada ? '~' : ''}${peso(ganancia)}</b></div>
          <div><span>Por cobrar</span><b class="ambar">${peso(suma(porCobrar(), o => o.precio))}</b></div>
          <div><span>Pedidos</span><b>${datos.pedidos.length}</b></div>
        </div>
        <label class="en-linea">Ganancia estimada por perfume (si no pones el costo)
          <input class="monto-en-linea" inputmode="numeric" value="${miles(datos.config.gananciaEstimada)}"
                 data-cambio="gananciaEstimada" aria-label="Ganancia estimada por perfume"></label>
      </article>
      <article class="tarjeta ancho">
        <h3>Pedidos <small>${pedidos.length}</small></h3>
        ${ul(pedidos.map(filaPedido), 'Aún no hay pedidos.', 'columnas')}
        ${formulario('pedido', 'Agregar pedido', item, camposPedido(item))}
      </article>
    </section>`;
}

function camposPedido(o) {
  o = o || {};
  return campo('Cliente', 'cliente', o.cliente, 'required')
    + campo('Perfume', 'perfume', o.perfume)
    + campoDinero('Precio de venta', 'precio', o.precio, 'required')
    + campoDinero('Costo (opcional)', 'costo', o.costo)
    + selector('Estado', 'estado', ESTADOS, o.estado || 'pedido')
    + campoFecha('Fecha en que me paga (opcional)', 'fechaCobro', o.fechaCobro);
}

const selEstado = o => `<select class="estado ${esc(o.estado)}" data-cambio="estadoPedido" data-id="${esc(o.id)}" aria-label="Estado del pedido">
  ${ESTADOS.map(([v, t]) => `<option value="${v}"${v === o.estado ? ' selected' : ''}>${t}</option>`).join('')}</select>`;

function filaPedido(o) {
  const conocido = costoConocido(o);
  const detalle = [
    conocido ? 'costo ' + peso(o.costo) : 'sin costo',
    'ganancia ' + (conocido ? '' : '~') + peso(gananciaPedido(o)),
    o.estado === 'entregado' ? (o.fechaCobro ? 'cobrar ' + textoFecha(o.fechaCobro) : 'sin fecha de cobro') : '',
  ].filter(Boolean).join(' · ');
  return fila({
    col: 'pedidos', id: o.id, clase: o.estado === 'pagado' ? 'hecho' : '',
    titulo: esc(o.cliente) + (o.perfume ? ` <span class="suave">· ${esc(o.perfume)}</span>` : ''),
    derecha: peso(o.precio),
    detalle,
    extra: selEstado(o),
  });
}

formularios.pedido = d => {
  const previo = enEdicion('pedidos') || {};
  guardarItem('pedidos', {
    ...previo, id: previo.id || uid(),
    cliente: d.cliente, perfume: d.perfume, precio: d.precio || 0, costo: d.costo, // costo vacío = null
    estado: d.estado, fechaCobro: d.fechaCobro,
  });
};
cambios.estadoPedido = (id, valor) => { const o = buscar('pedidos', id); if (o) o.estado = valor; };
cambios.gananciaEstimada = (id, valor) => { datos.config.gananciaEstimada = dinero(valor); };
