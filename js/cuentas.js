// ===== CUENTAS: billetera y bancos (dinero en efectivo y digital) =====
// El saldo de cada cuenta lo escribes tú ("Ajustar saldo") y se mueve solo cuando registras
// gastos, ingresos o transferencias, o cuando marcas pagado/cobrado algo que tiene cuenta asignada.

const CATEGORIAS = {
  gasto: ['Comida', 'Transporte', 'Estudio', 'Salud', 'Ocio', 'Hogar', 'Pagos', 'Otros'],
  ingreso: ['Quincena', 'Negocio', 'Cobro', 'Otros'],
};
const TIPOS_MOV = { gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia' };

const totalCuentas = tipo => suma(datos.cuentas.filter(c => !tipo || c.tipo === tipo), c => c.saldo);
const nombreCuenta = id => { const c = id && buscar('cuentas', id); return c ? c.nombre : 'Cuenta eliminada'; };
const opcionesCuentas = (conNinguna) => [...(conNinguna ? [['', 'Ninguna']] : []), ...datos.cuentas.map(c => [c.id, c.nombre])];

// ---------- Movimientos ----------
// Gasto resta, ingreso suma, transferencia pasa de una cuenta a otra. signo = -1 revierte.
function aplicarMov(m, signo) {
  const monto = Number(m.monto) || 0;
  const tocar = (c, delta) => {
    if (!c) return;
    c.saldo = (Number(c.saldo) || 0) + delta;
    if (signo > 0) c.actualizado = hoy();
  };
  const origen = buscar('cuentas', m.cuenta);
  if (m.tipo === 'gasto') tocar(origen, -signo * monto);
  else if (m.tipo === 'ingreso') tocar(origen, signo * monto);
  else if (m.tipo === 'transferencia') { tocar(origen, -signo * monto); tocar(buscar('cuentas', m.destino), signo * monto); }
}

function registrarMov(m) {
  const mov = { id: uid(), fecha: hoy(), categoria: '', nota: '', destino: '', ...m };
  datos.movimientos.push(mov);
  aplicarMov(mov, 1);
  return mov;
}

function quitarMov(id) {
  const m = buscar('movimientos', id);
  if (!m) return;
  aplicarMov(m, -1);
  borrarItem('movimientos', id);
}

// ---------- Pantalla ----------
function donut(partes, centro) { // partes: [{ valor, clase }]
  const total = suma(partes, p => Math.max(0, p.valor));
  let acumulado = 0;
  const arcos = total > 0 ? partes.filter(p => p.valor > 0).map(p => {
    const pct = p.valor / total * 100;
    const arco = `<circle class="arco ${p.clase}" cx="18" cy="18" r="15.9155" pathLength="100" stroke-dasharray="${pct.toFixed(2)} ${(100 - pct).toFixed(2)}" stroke-dashoffset="${(-acumulado).toFixed(2)}"/>`;
    acumulado += pct;
    return arco;
  }).join('') : '';
  return `<div class="donut"><svg viewBox="0 0 36 36" aria-hidden="true"><circle class="pista" cx="18" cy="18" r="15.9155" pathLength="100"/>${arcos}</svg><span>${centro}</span></div>`;
}

function vistaCuentas() {
  const efectivo = totalCuentas('efectivo');
  const digital = totalCuentas('digital');
  const total = efectivo + digital;
  const positivo = Math.max(0, efectivo) + Math.max(0, digital);
  const pctDigital = positivo > 0 ? Math.round(Math.max(0, digital) / positivo * 100) : 0;
  const ultima = datos.cuentas.map(c => c.actualizado).filter(Boolean).sort().pop();
  const movs = [...datos.movimientos].reverse().sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const recientes = movs.slice(0, 8);
  const resto = movs.slice(8);

  return `${encabezado('Dinero disponible', 'Cuentas', 'Cuánto tienes y dónde: efectivo y digital.', btnNuevo('cuenta', 'Agregar cuenta', {}, 'btn primario'))}
    <section class="rejilla cuentas">
      <article class="tarjeta a-resumen">
        ${cab('Total disponible', '', 'cuentas')}
        <div class="resumen-dinero">
          <div class="resumen-cifras">
            <b class="gigante num ${total < 0 ? 'rojo' : ''}" data-k="total">${contador(total)}</b>
            <div class="chips-tipos">
              <span class="chip efectivo"><i></i>Efectivo <b data-k="efectivo">${contador(efectivo)}</b></span>
              <span class="chip digital"><i></i>Digital <b data-k="digital">${contador(digital)}</b></span>
            </div>
            <span class="detalle">${datos.cuentas.length} cuenta${datos.cuentas.length === 1 ? '' : 's'} · saldos actualizados ${hace(ultima)}</span>
          </div>
          ${donut([{ valor: efectivo, clase: 'efectivo' }, { valor: digital, clase: 'digital' }],
            positivo > 0 ? `<b>${pctDigital}%</b><small>digital</small>` : '<small>sin saldos</small>')}
        </div>
      </article>

      <article class="tarjeta a-lista">
        ${cab('Mis cuentas', 'billetera y bancos', 'banco')}
        ${datos.cuentas.length
          ? `<div class="cuentas-grid">${datos.cuentas.map(tarjetaCuenta).join('')}</div>`
          : '<p class="vacio">Agrega tu billetera y tus bancos para ver cuánto tienes.</p>'}
      </article>

      <article class="tarjeta a-movs">
        ${cab('Movimientos', 'los más recientes', 'transferir', btnNuevo('movimiento', 'Registrar', { tipo: 'gasto' }))}
        ${ul(recientes.map(filaMov), 'Aún no registras movimientos. Anota un gasto, un ingreso o una transferencia y los saldos se actualizan solos.')}
        ${resto.length ? `<details class="mas"><summary>Ver ${resto.length} más ${ic('chevron')}</summary>${ul(resto.map(filaMov))}</details>` : ''}
      </article>

      <article class="tarjeta a-categorias">
        ${categoriasMes()}
      </article>
    </section>`;
}

function tarjetaCuenta(c) {
  const esEfectivo = c.tipo === 'efectivo';
  const viejo = c.actualizado && -diasHasta(c.actualizado) > 7;
  const id = esc(c.id);
  return `<div class="cuenta ${c.tipo}">
    <div class="cuenta-cab">
      ${ico(esEfectivo ? 'efectivo' : 'banco', esEfectivo ? 'cash' : 'digi')}
      <div class="cuenta-nombre"><b>${esc(c.nombre)}</b><span class="chip ${c.tipo}">${esEfectivo ? 'Efectivo' : 'Digital'}</span></div>
      <div class="iconos">
        <button type="button" class="icono-btn" data-accion="editar" data-col="cuentas" data-id="${id}" aria-label="Editar ${esc(c.nombre)}" title="Editar">${ic('editar')}</button>
        <button type="button" class="icono-btn" data-accion="borrar" data-col="cuentas" data-id="${id}" aria-label="Borrar ${esc(c.nombre)}" title="Borrar">${ic('borrar')}</button>
      </div>
    </div>
    <div class="cuenta-saldo num ${c.saldo < 0 ? 'rojo' : ''}" data-k="saldo">${contador(c.saldo)}</div>
    <div class="detalle ${viejo ? 'ambar' : ''}">Actualizado ${hace(c.actualizado)}</div>
    <label class="ajuste"><span>Ajustar saldo</span>
      <input class="monto-en-linea" inputmode="numeric" value="${miles(c.saldo)}" data-cambio="saldoCuenta" data-id="${id}" aria-label="Saldo de ${esc(c.nombre)}"></label>
    <div class="cuenta-acc">
      ${btnNuevo('movimiento', 'Gasto', { tipo: 'gasto', cuenta: c.id }, 'btn mini suave')}
      ${btnNuevo('movimiento', 'Ingreso', { tipo: 'ingreso', cuenta: c.id }, 'btn mini suave')}
      ${btnNuevo('movimiento', 'Transferir', { tipo: 'transferencia', cuenta: c.id }, 'btn mini suave')}
    </div>
  </div>`;
}

function filaMov(m) {
  const t = m.tipo;
  const signo = t === 'ingreso' ? '+' : t === 'gasto' ? '−' : '';
  const clase = t === 'ingreso' ? 'verde' : t === 'gasto' ? '' : 'acento';
  const ruta = t === 'transferencia' ? `${esc(nombreCuenta(m.cuenta))} → ${esc(nombreCuenta(m.destino))}` : esc(nombreCuenta(m.cuenta));
  return fila({
    izquierda: ico(t === 'transferencia' ? 'transferir' : t, t === 'ingreso' ? 'pos' : t === 'gasto' ? 'neg' : 'acc'),
    titulo: esc(m.nota || m.categoria || TIPOS_MOV[t] || 'Movimiento'),
    derecha: `<span class="${clase}">${signo}${peso(m.monto)}</span>`,
    detalle: [m.categoria && m.nota ? esc(m.categoria) : '', ruta, fechaCorta(m.fecha)].filter(Boolean).join(' · '),
    botones: `<button type="button" class="icono-btn" data-accion="borrarMov" data-id="${esc(m.id)}" aria-label="Borrar movimiento" title="Borrar">${ic('borrar')}</button>`,
  });
}

// En qué se va el dinero este mes (solo gastos registrados)
function categoriasMes() {
  const mes = hoy().slice(0, 7);
  const delMes = datos.movimientos.filter(m => (m.fecha || '').startsWith(mes));
  const gastos = {};
  for (const m of delMes) if (m.tipo === 'gasto') { const k = m.categoria || 'Otros'; gastos[k] = (gastos[k] || 0) + (Number(m.monto) || 0); }
  const filas = Object.entries(gastos).sort((a, b) => b[1] - a[1]);
  const totalGastos = suma(filas, f => f[1]);
  const totalIngresos = suma(delMes.filter(m => m.tipo === 'ingreso'), m => m.monto);
  return `${cab('En qué se va tu dinero', MESES_LARGOS[Number(mes.slice(5)) - 1], 'pulso')}
    <div class="stats dos">
      <div><span>Ingresos del mes</span><b class="verde num">${contador(totalIngresos)}</b></div>
      <div><span>Gastos del mes</span><b class="num">${contador(totalGastos)}</b></div>
    </div>
    ${filas.length ? `<ul class="categorias">${filas.map(([nombre, valor]) => `<li>
        <div class="linea"><span class="nombre">${esc(nombre)}</span><span class="derecha">${peso(valor)}</span></div>
        ${barraProg(valor / totalGastos * 100)}</li>`).join('')}</ul>`
      : '<p class="vacio">Registra tus gastos para ver en qué categorías se va tu dinero.</p>'}`;
}

// ---------- Formularios ----------
FORMULARIOS.cuenta = {
  col: 'cuentas', boton: 'Agregar cuenta',
  titulo: c => c ? 'Editar cuenta' : 'Nueva cuenta',
  campos: c => {
    c = c || {};
    return campo('Nombre', 'nombre', c.nombre, 'required placeholder="Ej.: Billetera, Nequi, Bancolombia"')
      + selector('Tipo de dinero', 'tipo', [['efectivo', 'Efectivo (físico)'], ['digital', 'Digital (banco o app)']], c.tipo || 'digital')
      + campoDinero(c.id ? 'Saldo actual' : 'Saldo inicial', 'saldo', c.saldo);
  },
  guardar: (d, previo) => {
    const cambioSaldo = !previo.id || (Number(previo.saldo) || 0) !== (d.saldo || 0);
    guardarItem('cuentas', {
      ...previo, id: previo.id || uid(), nombre: d.nombre, tipo: d.tipo, saldo: d.saldo || 0,
      actualizado: cambioSaldo ? hoy() : previo.actualizado,
    });
  },
};

FORMULARIOS.movimiento = {
  col: null, boton: 'Registrar', aviso: 'Movimiento registrado',
  titulo: (_, ctx) => ({ gasto: 'Registrar gasto', ingreso: 'Registrar ingreso', transferencia: 'Transferir dinero' }[ctx.tipo] || 'Registrar movimiento'),
  campos: (_, ctx) => {
    const tipo = TIPOS_MOV[ctx.tipo] ? ctx.tipo : 'gasto';
    if (!datos.cuentas.length) return '<p class="texto-hoja">Primero agrega una cuenta (por ejemplo, tu billetera) en la sección Cuentas.</p>';
    const origen = datos.cuentas.some(c => c.id === ctx.cuenta) ? ctx.cuenta : datos.cuentas[0].id;
    const otra = datos.cuentas.find(c => c.id !== origen);
    const destino = datos.cuentas.some(c => c.id === ctx.destino) ? ctx.destino : (otra ? otra.id : origen);
    const segmentos = ['gasto', 'ingreso', 'transferencia'].map(t =>
      `<button type="button" class="seg${t === tipo ? ' on' : ''}" data-accion="tipoMov" data-tipo="${t}" aria-pressed="${t === tipo}">${ic(t === 'transferencia' ? 'transferir' : t)}<span>${t === 'transferencia' ? 'Transferir' : TIPOS_MOV[t]}</span></button>`).join('');
    return `<div class="segmentos">${segmentos}</div>
      <input type="hidden" name="tipo" value="${tipo}">
      ${campoDinero('Monto', 'monto', Number(ctx.monto) || 0, 'required')}
      ${selector(tipo === 'transferencia' ? 'Desde' : 'Cuenta', 'cuenta', opcionesCuentas(false), origen)}
      ${tipo === 'transferencia'
        ? selector('Hacia', 'destino', opcionesCuentas(false), destino)
        : selector('Categoría', 'categoria', CATEGORIAS[tipo].map(c => [c, c]), ctx.categoria)}
      ${campo('Nota (opcional)', 'nota', ctx.nota)}
      ${campoFecha('Fecha', 'fecha', ctx.fecha || hoy())}`;
  },
  guardar: d => {
    if (!datos.cuentas.length) { avisar('Primero agrega una cuenta', 'error'); return false; }
    if (!(d.monto > 0)) { avisar('Escribe un monto mayor a cero', 'error'); return false; }
    if (d.tipo === 'transferencia' && d.cuenta === d.destino) { avisar('Elige dos cuentas distintas', 'error'); return false; }
    registrarMov({
      fecha: d.fecha || hoy(), tipo: d.tipo, monto: d.monto, cuenta: d.cuenta,
      destino: d.tipo === 'transferencia' ? d.destino : '', categoria: d.categoria || '', nota: d.nota,
    });
  },
};

// ---------- Acciones ----------
acciones.registrar = () => abrirFormulario('movimiento', null, { tipo: 'gasto' });

// Cambiar entre gasto / ingreso / transferencia sin perder lo escrito
acciones.tipoMov = (id, el) => {
  const f = document.querySelector('#hoja form[data-form="movimiento"]');
  abrirFormulario('movimiento', null, { ...(f ? leerForm(f) : {}), tipo: el.dataset.tipo, destino: '', categoria: '' }, true);
};

// El día de pago, Jarvis ofrece registrar el ingreso de la quincena
acciones.registrarQuincena = () => {
  const inicio = inicioQuincena(hoy());
  const digital = datos.cuentas.find(c => c.tipo === 'digital') || datos.cuentas[0];
  abrirFormulario('movimiento', null, {
    tipo: 'ingreso', categoria: 'Quincena', nota: 'Quincena',
    monto: Number(datos.ingresos[esQuincena15(inicio) ? 'q15' : 'q30']) || 0, cuenta: digital ? digital.id : '',
  });
};

acciones.borrarMov = id => {
  const m = buscar('movimientos', id);
  if (!m) return;
  confirmar({
    titulo: 'Borrar movimiento', boton: 'Borrar', peligro: true,
    texto: `Se borrará <b>${esc(m.nota || m.categoria || 'el movimiento')}</b> y se revertirá su efecto en los saldos.`,
    alAceptar: () => { quitarMov(id); avisar('Movimiento borrado'); },
  });
};

cambios.saldoCuenta = (id, valor) => {
  const c = buscar('cuentas', id);
  if (!c) return;
  c.saldo = dinero(valor);
  c.actualizado = hoy();
};
