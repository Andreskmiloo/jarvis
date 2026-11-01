// ===== PENDIENTES (matriz de Eisenhower), METAS Y RUTINA =====

const CUADRANTES = [
  { urgente: true,  importante: true,  titulo: 'Urgente e importante',     pista: 'Hazlo ya',          clase: 'q1' },
  { urgente: false, importante: true,  titulo: 'Importante, no urgente',   pista: 'Planifícalo',       clase: 'q2' },
  { urgente: true,  importante: false, titulo: 'Urgente, no importante',   pista: 'Resuélvelo rápido', clase: 'q3' },
  { urgente: false, importante: false, titulo: 'Ni urgente ni importante', pista: 'Para después',      clase: 'q4' },
];

function vistaPendientes() {
  return `${encabezado('Organización', 'Pendientes y metas', 'Tareas por prioridad, metas con progreso y tu rutina.')}
    <section class="rejilla pendientes">
      ${seccionTareas()}
      ${seccionMetas()}
      ${seccionRutina()}
    </section>`;
}

// ---------- Tareas ----------
function seccionTareas() {
  const hechas = datos.tareas.filter(x => x.hecha);
  return `<article class="tarjeta a-matriz">
    ${cab('Matriz de Eisenhower', `${datos.tareas.length - hechas.length} pendientes`, 'pendientes', btnNuevo('tarea', 'Agregar tarea'))}
    <div class="matriz">${CUADRANTES.map(cuadrante).join('')}</div>
    ${hechas.length ? `<details class="mas pagados"><summary>Hechas (${hechas.length}) ${ic('chevron')}</summary>${ul(hechas.map(filaTarea))}</details>` : ''}
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
  ok: { accion: 'tareaHecha', id: t.id, nombre: t.texto, etiqueta: t.hecha ? 'Deshacer' : 'Marcar hecha', variante: t.hecha ? 'deshacer' : '' },
});

FORMULARIOS.tarea = {
  col: 'tareas',
  titulo: t => t ? 'Editar tarea' : 'Nueva tarea',
  campos: t => {
    t = t || {};
    return campo('Tarea', 'texto', t.texto, 'required')
      + campoFecha('Fecha (opcional)', 'fecha', t.fecha)
      + casilla('Urgente', 'urgente', t.urgente)
      + casilla('Importante', 'importante', t.importante);
  },
  guardar: (d, previo) => {
    guardarItem('tareas', { ...previo, id: previo.id || uid(), texto: d.texto, fecha: d.fecha, urgente: d.urgente, importante: d.importante });
  },
};
acciones.tareaHecha = id => { const t = buscar('tareas', id); if (t) t.hecha = !t.hecha; };

// ---------- Metas ----------
// Avance: automático (ventas del negocio / cantidad de pedidos) o escrito a mano.
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

function seccionMetas() {
  const ordenadas = [...datos.metas].sort((a, b) => (!!a.hecha - !!b.hecha) || porFecha(a, b));
  return `<article class="tarjeta a-metas">
    ${cab('Metas', `${datos.metas.filter(x => !x.hecha).length} en camino`, 'meta', btnNuevo('meta', 'Agregar meta'))}
    ${ul(ordenadas.map(filaMeta), 'Aún no tienes metas.', 'columnas')}
  </article>`;
}

function filaMeta(m) {
  const i = infoMeta(m);
  const aMano = !m.auto && i.objetivo > 0;
  const extra = (i.objetivo ? `<div class="linea detalle"><span>${i.texto}</span></div>` : '')
    + (aMano ? `<label class="en-linea">Llevo <input class="monto-en-linea" inputmode="numeric" value="${miles(m.actual)}"
        data-cambio="avanceMeta" data-id="${esc(m.id)}" aria-label="Cuánto llevo de ${esc(m.nombre)}"></label>` : '');
  return fila({
    col: 'metas', id: m.id, clase: m.hecha ? 'hecho' : '',
    izquierda: i.objetivo ? anillo(i.pct, `<b>${i.pct}%</b>`, i.atrasada ? 'atrasada' : '') : ico(m.hecha ? 'ok' : 'meta', m.hecha ? 'pos' : 'acc'),
    titulo: esc(m.nombre),
    derecha: m.fecha ? (m.hecha ? fechaCorta(m.fecha) : textoFecha(m.fecha)) : '',
    detalle: m.nota ? esc(m.nota) : '',
    ok: { accion: 'metaHecha', id: m.id, nombre: m.nombre, etiqueta: m.hecha ? 'Reabrir' : 'Marcar cumplida', variante: m.hecha ? 'deshacer' : '' },
    extra,
  });
}

FORMULARIOS.meta = {
  col: 'metas',
  titulo: m => m ? 'Editar meta' : 'Nueva meta',
  campos: m => {
    m = m || {};
    return campo('Meta', 'nombre', m.nombre, 'required')
      + campoFecha('Fecha (opcional)', 'fecha', m.fecha)
      + campoDinero('Cuánto necesito (opcional: pesos o cantidad)', 'objetivo', m.objetivo)
      + selector('Cómo se mide el avance', 'auto', [
          ['', 'A mano'],
          ['ventas', 'Ventas del negocio (automático)'],
          ['pedidos', 'Pedidos registrados (automático)'],
        ], m.auto || '')
      + campoDinero('Llevo (solo si es a mano)', 'actual', m.actual)
      + campo('Nota', 'nota', m.nota);
  },
  guardar: (d, previo) => {
    guardarItem('metas', {
      ...previo, id: previo.id || uid(),
      nombre: d.nombre, fecha: d.fecha, objetivo: d.objetivo || 0, auto: d.auto, actual: d.actual || 0, nota: d.nota,
    });
  },
};
cambios.avanceMeta = (id, valor) => { const m = buscar('metas', id); if (m) m.actual = dinero(valor); };
acciones.metaHecha = id => { const m = buscar('metas', id); if (m) m.hecha = !m.hecha; };

// ---------- Rutina (hábitos con racha) ----------
// Racha = días seguidos hasta hoy (o hasta ayer, si hoy todavía no lo marcas).
function racha(h) {
  const hechos = new Set(h.hechos);
  let f = hechos.has(hoy()) ? hoy() : sumarDias(hoy(), -1);
  let n = 0;
  while (hechos.has(f)) { n++; f = sumarDias(f, -1); }
  return n;
}

function seccionRutina() {
  const hechosHoy = datos.habitos.filter(h => h.hechos.includes(hoy())).length;
  return `<article class="tarjeta a-rutina">
    ${cab('Rutina', datos.habitos.length ? `${hechosHoy} de ${datos.habitos.length} hoy` : '', 'llama', btnNuevo('habito', 'Agregar hábito'))}
    ${ul(datos.habitos.map(filaHabito), 'Agrega un hábito (estudiar, ejercicio, leer) y construye tu racha día a día.', 'columnas')}
  </article>`;
}

function filaHabito(h) {
  const hechoHoy = h.hechos.includes(hoy());
  const n = racha(h);
  const tira = [6, 5, 4, 3, 2, 1, 0].map(k => {
    const f = sumarDias(hoy(), -k);
    return `<span class="dia${h.hechos.includes(f) ? ' on' : ''}${k === 0 ? ' hoy' : ''}" title="${fechaConDia(f)}"><small>${DIAS_SEMANA[aFecha(f).getDay()].charAt(0).toUpperCase()}</small><i></i></span>`;
  }).join('');
  return fila({
    col: 'habitos', id: h.id,
    izquierda: ico('llama', n >= 3 ? 'warn' : 'mut'),
    titulo: esc(h.nombre),
    derecha: `<span class="racha ${n >= 3 ? 'ambar' : 'suave'}">${n} ${n === 1 ? 'día' : 'días'}</span>`,
    detalle: n ? 'Racha actual' : 'Sin racha todavía',
    ok: { accion: 'habitoHoy', id: h.id, nombre: h.nombre, etiqueta: hechoHoy ? 'Deshacer hoy' : 'Marcar hecho hoy', variante: hechoHoy ? 'deshacer' : '' },
    extra: `<div class="tira" aria-label="Últimos 7 días">${tira}</div>`,
  });
}

FORMULARIOS.habito = {
  col: 'habitos',
  titulo: h => h ? 'Editar hábito' : 'Nuevo hábito',
  campos: h => campo('Hábito', 'nombre', (h || {}).nombre, 'required placeholder="Ej.: Estudiar 1 hora"'),
  guardar: (d, previo) => {
    guardarItem('habitos', { ...previo, id: previo.id || uid(), nombre: d.nombre, hechos: previo.hechos || [] });
  },
};
acciones.habitoHoy = id => {
  const h = buscar('habitos', id);
  if (!h) return;
  const hoyS = hoy();
  h.hechos = h.hechos.includes(hoyS) ? h.hechos.filter(f => f !== hoyS) : [...h.hechos, hoyS];
};
