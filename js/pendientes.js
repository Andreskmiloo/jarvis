// ===== PENDIENTES (matriz de Eisenhower) Y METAS =====

const CUADRANTES = [
  { urgente: true,  importante: true,  titulo: 'Urgente e importante',     pista: 'Hazlo ya',          clase: 'q1' },
  { urgente: false, importante: true,  titulo: 'Importante, no urgente',   pista: 'Planifícalo',       clase: 'q2' },
  { urgente: true,  importante: false, titulo: 'Urgente, no importante',   pista: 'Resuélvelo rápido', clase: 'q3' },
  { urgente: false, importante: false, titulo: 'Ni urgente ni importante', pista: 'Para después',      clase: 'q4' },
];

function vistaPendientes() {
  return `<h2 class="titulo">Pendientes y metas</h2>
    <section class="rejilla">
      ${seccionTareas()}
      ${seccionMetas()}
    </section>`;
}

// ---------- Tareas ----------
function seccionTareas() {
  const item = enEdicion('tareas');
  const t = item || {};
  const hechas = datos.tareas.filter(x => x.hecha);
  return `<article class="tarjeta ancho">
    <h3>Matriz de Eisenhower <small>${datos.tareas.length - hechas.length} pendientes</small></h3>
    <div class="matriz">${CUADRANTES.map(cuadrante).join('')}</div>
    ${hechas.length ? `<details class="pagados"><summary>Hechas (${hechas.length})</summary>${ul(hechas.map(filaTarea))}</details>` : ''}
    ${formulario('tarea', 'Agregar tarea', item,
      campo('Tarea', 'texto', t.texto, 'required')
      + campoFecha('Fecha (opcional)', 'fecha', t.fecha)
      + casilla('Urgente', 'urgente', t.urgente)
      + casilla('Importante', 'importante', t.importante))}
  </article>`;
}

function cuadrante(c) {
  const tareas = datos.tareas
    .filter(t => !t.hecha && !!t.urgente === c.urgente && !!t.importante === c.importante)
    .sort(porFecha);
  return `<section class="cuadrante ${c.clase}">
    <h4>${c.titulo} <small>${c.pista}</small></h4>
    ${ul(tareas.map(filaTarea), 'Nada aquí')}
  </section>`;
}

const filaTarea = t => fila({
  col: 'tareas', id: t.id, clase: t.hecha ? 'hecho' : '',
  titulo: esc(t.texto),
  detalle: t.fecha ? (t.hecha ? fechaCorta(t.fecha) : textoFecha(t.fecha)) : '',
  extra: `<button class="pagar${t.hecha ? ' hecho' : ''}" data-accion="tareaHecha" data-id="${esc(t.id)}">${t.hecha ? '↩ Deshacer' : '✓ Hecha'}</button>`,
});

formularios.tarea = d => {
  const previo = enEdicion('tareas') || {};
  guardarItem('tareas', { ...previo, id: previo.id || uid(), texto: d.texto, fecha: d.fecha, urgente: d.urgente, importante: d.importante });
};
acciones.tareaHecha = id => { const t = buscar('tareas', id); if (t) t.hecha = !t.hecha; };

// ---------- Metas ----------
// Avance: automático (ventas de perfumes / cantidad de pedidos) o escrito a mano.
function avanceMeta(m) {
  if (m.auto === 'ventas') return suma(datos.pedidos, o => o.precio);
  if (m.auto === 'pedidos') return datos.pedidos.length;
  return Number(m.actual) || 0;
}

function infoMeta(m) {
  const objetivo = Number(m.objetivo) || 0;
  const actual = avanceMeta(m);
  const cuenta = m.auto === 'pedidos';
  const fmt = n => (cuenta ? String(n) : peso(n));
  const pct = objetivo <= 0 ? 0 : actual >= objetivo ? 100 : Math.min(99, Math.round(actual * 100 / objetivo));
  const atrasada = !!m.fecha && !m.hecha && objetivo > 0 && actual < objetivo && diasHasta(m.fecha) < 0;
  return { objetivo, actual, pct, atrasada, texto: fmt(actual) + ' de ' + fmt(objetivo) + (cuenta ? ' pedidos' : '') };
}

const barraMeta = i => `<div class="barra-meta${i.atrasada ? ' atrasada' : ''}" role="progressbar"
  aria-valuemin="0" aria-valuemax="100" aria-valuenow="${i.pct}"><div style="width:${i.pct}%"></div></div>`;

function seccionMetas() {
  const item = enEdicion('metas');
  const m = item || {};
  const ordenadas = [...datos.metas].sort((a, b) => (!!a.hecha - !!b.hecha) || porFecha(a, b));
  return `<article class="tarjeta ancho">
    <h3>Metas <small>${datos.metas.filter(x => !x.hecha).length} en camino</small></h3>
    ${ul(ordenadas.map(filaMeta), 'Aún no tienes metas.', 'columnas')}
    ${formulario('meta', 'Agregar meta', item,
      campo('Meta', 'nombre', m.nombre, 'required')
      + campoFecha('Fecha (opcional)', 'fecha', m.fecha)
      + campoDinero('Cuánto necesito (opcional: pesos o cantidad)', 'objetivo', m.objetivo)
      + selector('Cómo se mide el avance', 'auto', [
          ['', 'A mano'],
          ['ventas', 'Ventas de perfumes (automático)'],
          ['pedidos', 'Pedidos registrados (automático)'],
        ], m.auto || '')
      + campoDinero('Llevo (solo si es a mano)', 'actual', m.actual)
      + campo('Nota', 'nota', m.nota))}
  </article>`;
}

function filaMeta(m) {
  const i = infoMeta(m);
  const aMano = !m.auto && i.objetivo > 0;
  const extra = (i.objetivo ? barraMeta(i) + `<div class="linea detalle"><span>${i.texto}</span><span>${i.pct}%</span></div>` : '')
    + (aMano ? `<label class="en-linea">Llevo <input class="monto-en-linea" inputmode="numeric" value="${miles(m.actual)}"
        data-cambio="avanceMeta" data-id="${esc(m.id)}" aria-label="Cuánto llevo de ${esc(m.nombre)}"></label>` : '')
    + `<button class="pagar${m.hecha ? ' hecho' : ''}" data-accion="metaHecha" data-id="${esc(m.id)}">${m.hecha ? '↩ Reabrir' : '✓ Cumplida'}</button>`;
  return fila({
    col: 'metas', id: m.id, clase: m.hecha ? 'hecho' : '',
    titulo: esc(m.nombre),
    derecha: m.fecha ? (m.hecha ? fechaCorta(m.fecha) : textoFecha(m.fecha)) : '',
    detalle: m.nota ? esc(m.nota) : '',
    extra,
  });
}

formularios.meta = d => {
  const previo = enEdicion('metas') || {};
  guardarItem('metas', {
    ...previo, id: previo.id || uid(),
    nombre: d.nombre, fecha: d.fecha, objetivo: d.objetivo || 0, auto: d.auto, actual: d.actual || 0, nota: d.nota,
  });
};
cambios.avanceMeta = (id, valor) => { const m = buscar('metas', id); if (m) m.actual = dinero(valor); };
acciones.metaHecha = id => { const m = buscar('metas', id); if (m) m.hecha = !m.hecha; };
