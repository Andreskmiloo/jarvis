// Estado de la app, guardado en localStorage, y respaldo en JSON.

const CLAVE = 'jarvis';
const VERSION = 2;
let datos;            // todos los datos (ver semilla.js para ver la forma)
let editando = null;  // { col, id } cuando se está editando un elemento
let lecturaGuardada = null; // contenido leído de localStorage
let usarMemoria = false;
let almacenOk = true; // false si el navegador no deja guardar

// Los eventos de la pantalla buscan aquí qué hacer (cada sección agrega los suyos):
const acciones = {};     // clic en [data-accion="x"]
const cambios = {};      // cambio en [data-cambio="x"]
const FORMULARIOS = {};  // formularios: { col, titulo(item, ctx), campos(item, ctx), guardar(d, previo) }

const COLECCIONES_BASE = ['pagos', 'diarios', 'pedidos', 'tareas', 'metas']; // las que trae todo respaldo
const COLECCIONES = [...COLECCIONES_BASE, 'cuentas', 'movimientos', 'habitos'];
const CAMPOS_FECHA = ['fecha', 'fechaPago', 'fechaCobro', 'actualizado'];
const FECHA_OK = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = f => typeof f === 'string' && FECHA_OK.test(f) && deFecha(aFecha(f)) === f;
const registro = x => x && typeof x === 'object' && !Array.isArray(x);

function datosVacios() {
  return {
    version: VERSION, ultimoRespaldo: '',
    ingresos: { q15: 0, q30: 0 }, config: { gananciaEstimada: 100000 },
    cuentas: [], movimientos: [], pagos: [], diarios: [], pedidos: [], tareas: [], metas: [], habitos: [],
  };
}

// Pone al día datos guardados con una versión anterior, sin perder nada.
function migrar(d) {
  if ((Number(d.version) || 1) >= VERSION) return d;
  if (!('cuentas' in d)) {
    d.cuentas = [
      { nombre: 'Billetera', tipo: 'efectivo', saldo: 0, actualizado: '' },
      { nombre: 'BBVA', tipo: 'digital', saldo: 0, actualizado: '' },
    ];
  }
  if (!('habitos' in d)) d.habitos = [{ nombre: 'Estudiar Matemática', hechos: [] }];
  for (const o of Array.isArray(d.pedidos) ? d.pedidos : []) { // "perfume" pasa a "producto"
    if (o && typeof o === 'object' && 'perfume' in o) {
      if (!('producto' in o)) o.producto = o.perfume;
      delete o.perfume;
    }
  }
  const nuevoTexto = { // textos de las metas iniciales, solo si siguen tal cual
    'Vender $10.000.000 en perfumes': 'Vender $10.000.000',
    'Cerrar 10 pedidos de perfumes': 'Cerrar 10 pedidos',
    'Ganancia aproximada: $100.000 por perfume': 'Ganancia aproximada: $100.000 por venta',
  };
  for (const m of Array.isArray(d.metas) ? d.metas : []) {
    if (!m || typeof m !== 'object') continue;
    if (Object.hasOwn(nuevoTexto, m.nombre)) m.nombre = nuevoTexto[m.nombre];
    if (Object.hasOwn(nuevoTexto, m.nota)) m.nota = nuevoTexto[m.nota];
  }
  d.version = VERSION;
  return d;
}

// Rellena lo que falte (ids, listas, fechas inválidas) para que la pantalla nunca se rompa.
function completar(d) {
  d = migrar({ ...d });
  const v = datosVacios();
  const r = { ...v, ...d, ingresos: { ...v.ingresos, ...d.ingresos }, config: { ...v.config, ...d.config } };
  r.ultimoRespaldo = fechaValida(r.ultimoRespaldo) ? r.ultimoRespaldo : '';
  for (const col of COLECCIONES) {
    r[col] = (Array.isArray(r[col]) ? r[col] : [])
      .filter(registro)
      .map(x => {
        for (const k of CAMPOS_FECHA) {
          if (k in x && !fechaValida(x[k])) x[k] = '';
        }
        return { ...x, id: (typeof x.id === 'string' || typeof x.id === 'number') && x.id !== '' ? String(x.id) : uid() };
      });
  }
  r.cuentas = r.cuentas.map(c => ({ ...c, tipo: c.tipo === 'efectivo' ? 'efectivo' : 'digital' }));
  r.habitos = r.habitos.map(h => ({ ...h, hechos: Array.isArray(h.hechos) ? h.hechos.filter(fechaValida) : [] }));
  for (const x of [...r.pagos, ...r.pedidos, ...r.movimientos]) {
    for (const k of ['cuenta', 'destino', 'movId', 'siguienteId']) {
      if (typeof x[k] === 'number') x[k] = String(x[k]);
    }
  }
  // Los respaldos anteriores enlazaban las cuotas por ID, pero no guardaban el día original.
  const pagos = new Map(r.pagos.map(p => [p.id, p]));
  const hijos = new Set(r.pagos.map(p => p.siguienteId).filter(Boolean));
  for (const raiz of r.pagos) {
    if (hijos.has(raiz.id) || !raiz.fecha) continue;
    let padre = raiz;
    let hijo = pagos.get(padre.siguienteId);
    const visitados = new Set([raiz.id]);
    while (hijo && !visitados.has(hijo.id)) {
      hijo.serieMensual ||= padre.serieMensual || raiz.id;
      hijo.diaMensual ||= padre.diaMensual || Number((padre.fecha || raiz.fecha).slice(-2));
      hijo.origenMensual ||= padre.id;
      visitados.add(hijo.id);
      padre = hijo;
      hijo = pagos.get(padre.siguienteId);
    }
  }
  return r;
}

function cargar() {
  try { lecturaGuardada = localStorage.getItem(CLAVE); }
  catch (e) { usarMemoria = true; almacenOk = false; }
  return leerEstado(lecturaGuardada);
}

function leerEstado(crudo) {
  if (!crudo) return completar(semilla());
  try {
    const guardado = JSON.parse(crudo);
    if (!respaldoValido(guardado)) throw new Error('Respaldo inválido');
    return completar(guardado);
  } catch (e) {
    try { localStorage.setItem(CLAVE + '_corrupto', crudo); } catch (error) { /* sin acceso */ }
    return completar(semilla());
  }
}

function sincronizarPestana() {
  if (usarMemoria) return false;
  let actual;
  try { actual = localStorage.getItem(CLAVE); }
  catch (e) { usarMemoria = true; almacenOk = false; return false; }
  if (actual === lecturaGuardada) return false;

  lecturaGuardada = actual;
  datos = leerEstado(actual);
  cerrarHoja();
  render();
  avisar('Se cargaron los cambios de otra pestaña.');
  return true;
}

async function cambiarDatos(cambiar) {
  const ejecutar = () => {
    if (sincronizarPestana()) return;
    const previo = JSON.stringify(datos);
    let nuevo;
    try {
      if (cambiar() === false) return;
      nuevo = JSON.stringify(datos);
    } catch (e) {
      datos = JSON.parse(previo);
      render();
      throw e;
    }
    if (nuevo !== previo && !usarMemoria) {
      if (sincronizarPestana()) return;
      try {
        localStorage.setItem(CLAVE, nuevo);
        lecturaGuardada = nuevo;
        almacenOk = true;
      } catch (e) {
        almacenOk = false;
      }
    }
    if (nuevo !== previo) render();
  };
  // Con Web Locks, leer y escribir es una sola operación entre pestañas del mismo origen.
  try {
    if (navigator.locks) await navigator.locks.request(CLAVE, ejecutar);
    else ejecutar();
  } catch (e) {
    console.error(e);
    avisar('No se pudo completar la acción.', 'error');
  }
}

// ---------- Listas ----------
const buscar = (col, id) => datos[col].find(x => x.id === id);
const enEdicion = col => (editando && editando.col === col && buscar(col, editando.id)) || null;

function guardarItem(col, item) { // crea o actualiza
  const i = datos[col].findIndex(x => x.id === item.id);
  if (i >= 0) datos[col][i] = item; else datos[col].push(item);
}
const borrarItem = (col, id) => { datos[col] = datos[col].filter(x => x.id !== id); };

// Lee un <form>: casillas → true/false, fechas inválidas → '', dinero → número (o null si está vacío).
function leerForm(f) {
  const d = {};
  for (const el of f.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') d[el.name] = el.checked;
    else if (el.type === 'date') d[el.name] = fechaValida(el.value) ? el.value : ''; // navegadores sin selector de fecha
    else if (el.dataset.dinero !== undefined) {
      const convertir = el.name === 'saldo' && f.dataset.form === 'cuenta' ? dineroConSigno : dinero;
      d[el.name] = el.value.trim() === '' ? null : convertir(el.value);
    }
    else d[el.name] = el.value.trim();
  }
  return d;
}

// ---------- Formularios (se abren en una ventana emergente) ----------
const FORMULARIO_DE = { pagos: 'pago', diarios: 'diario', pedidos: 'pedido', tareas: 'tarea', metas: 'meta', cuentas: 'cuenta', habitos: 'habito' };

function abrirFormulario(nombre, item, ctx = {}, enSitio = false) {
  const F = FORMULARIOS[nombre];
  editando = item && F.col ? { col: F.col, id: item.id } : null;
  abrirHoja(F.titulo(item, ctx), `<form data-form="${nombre}" autocomplete="off">
      ${F.campos(item, ctx)}
      <div class="botones">
        <button type="submit" class="btn primario">${ic('check')}<span>${item ? 'Guardar cambios' : (F.boton || 'Agregar')}</span></button>
        <button type="button" class="btn suave" data-accion="cerrarHoja">Cancelar</button>
      </div>
    </form>`, { enSitio });
}

acciones.nuevo = (id, el) => abrirFormulario(el.dataset.form, null, { ...el.dataset });
acciones.editar = (id, el) => {
  const item = buscar(el.dataset.col, id);
  if (item) abrirFormulario(FORMULARIO_DE[el.dataset.col], item);
};

acciones.borrar = (id, el) => {
  const col = el.dataset.col;
  const item = buscar(col, id);
  if (!item) return;
  if (col === 'cuentas' && (
    datos.movimientos.some(m => m.cuenta === id || m.destino === id) ||
    [...datos.pagos, ...datos.pedidos].some(x => x.cuenta === id)
  )) {
    avisar('Esta cuenta tiene movimientos, pagos o pedidos vinculados.', 'error');
    return;
  }
  const movimiento = item.movId && buscar('movimientos', item.movId);
  const nombre = item.nombre || item.cliente || item.texto || 'este elemento';
  confirmar({
    titulo: 'Borrar', boton: 'Borrar', peligro: true,
    texto: `Se borrará <b>${esc(nombre)}</b>.${movimiento ? ' También se revertirá su movimiento en la cuenta.' : ''} Esta acción no se puede deshacer.`,
    alAceptar: () => {
      if (movimiento) quitarMov(movimiento.id);
      borrarItem(col, id);
      avisar('Borrado');
    },
  });
};

// ---------- Respaldo ----------
function exportar() {
  datos.ultimoRespaldo = hoy();
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jarvis-respaldo-' + hoy() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  avisar('Respaldo descargado');
}

const leerArchivo = archivo => new Promise((resolver, rechazar) => {
  const lector = new FileReader();
  lector.onload = () => resolver(lector.result);
  lector.onerror = rechazar;
  lector.readAsText(archivo);
});

function respaldoValido(d) {
  if (!registro(d) || (d.version != null && Number(d.version) > VERSION)) return false;
  if (!COLECCIONES_BASE.every(col => Array.isArray(d[col]))) return false;
  return COLECCIONES.every(col => {
    if (!(col in d)) return true;
    if (!Array.isArray(d[col]) || !d[col].every(registro)) return false;
    const ids = d[col].filter(x => typeof x.id === 'string' || typeof x.id === 'number')
      .map(x => String(x.id)).filter(Boolean);
    return new Set(ids).size === ids.length;
  });
}

async function importar(archivo) {
  if (!archivo) return;
  let nuevo;
  try { nuevo = JSON.parse(await leerArchivo(archivo)); }
  catch (e) { avisar('No pude leer ese archivo: no parece un respaldo de Jarvis.', 'error'); return; }
  if (!respaldoValido(nuevo)) { avisar('Ese archivo no parece un respaldo de Jarvis.', 'error'); return; }
  let preparado;
  try { preparado = completar(nuevo); }
  catch (e) { avisar('El respaldo contiene datos que Jarvis no puede leer.', 'error'); return; }
  confirmar({
    titulo: 'Importar respaldo', boton: 'Reemplazar datos', peligro: true,
    texto: 'Esto reemplaza todos tus datos actuales por los del archivo.',
    alAceptar: () => { datos = preparado; editando = null; avisar('Respaldo importado'); },
  });
}

acciones.exportar = exportar;
cambios.importar = (id, valor, el) => {
  const archivo = el.files && el.files[0];
  el.value = '';
  importar(archivo);
};
