// Estado de la app, guardado en localStorage, y respaldo en JSON.

const CLAVE = 'jarvis';
let datos;            // todos los datos (ver semilla.js para ver la forma)
let editando = null;  // { col, id } cuando se está editando un elemento
let almacenOk = true; // false si el navegador no deja guardar

// Los eventos de la pantalla buscan aquí qué hacer (cada sección agrega los suyos):
const acciones = {};     // clic en [data-accion="x"]
const formularios = {};  // envío de <form data-form="x">
const cambios = {};      // cambio en [data-cambio="x"]

const COLECCIONES = ['pagos', 'diarios', 'pedidos', 'tareas', 'metas'];
const CAMPOS_FECHA = ['fecha', 'fechaPago', 'fechaCobro'];

function datosVacios() {
  return {
    version: 1, ultimoRespaldo: '',
    ingresos: { q15: 0, q30: 0 }, config: { gananciaEstimada: 100000 },
    pagos: [], diarios: [], pedidos: [], tareas: [], metas: [],
  };
}

// Rellena lo que falte (ids, listas, fechas inválidas) para que la pantalla nunca se rompa.
function completar(d) {
  const v = datosVacios();
  const r = { ...v, ...d, ingresos: { ...v.ingresos, ...d.ingresos }, config: { ...v.config, ...d.config } };
  for (const col of COLECCIONES) {
    r[col] = (Array.isArray(r[col]) ? r[col] : [])
      .filter(x => x && typeof x === 'object')
      .map(x => {
        for (const k of CAMPOS_FECHA) {
          if (k in x && !/^\d{4}-\d{2}-\d{2}$/.test(x[k])) x[k] = '';
        }
        return { ...x, id: x.id || uid() };
      });
  }
  return r;
}

function cargar() {
  let crudo = null;
  try { crudo = localStorage.getItem(CLAVE); } catch (e) { almacenOk = false; }
  if (crudo) {
    try { return completar(JSON.parse(crudo)); }
    catch (e) { // datos dañados: guardo una copia antes de empezar de nuevo
      try { localStorage.setItem(CLAVE + '_corrupto', crudo); } catch (e2) { /* nada */ }
    }
  }
  return completar(semilla());
}

function guardar() {
  try { localStorage.setItem(CLAVE, JSON.stringify(datos)); almacenOk = true; }
  catch (e) { almacenOk = false; }
}

// ---------- Listas ----------
const buscar = (col, id) => datos[col].find(x => x.id === id);
const enEdicion = col => (editando && editando.col === col && buscar(col, editando.id)) || null;

function guardarItem(col, item) { // crea o actualiza
  const i = datos[col].findIndex(x => x.id === item.id);
  if (i >= 0) datos[col][i] = item; else datos[col].push(item);
}
const borrarItem = (col, id) => { datos[col] = datos[col].filter(x => x.id !== id); };

// Lee un <form>: casillas → true/false, campos de dinero → número (o null si están vacíos).
function leerForm(f) {
  const d = {};
  for (const el of f.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') d[el.name] = el.checked;
    else if (el.type === 'date') d[el.name] = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : ''; // navegadores sin selector de fecha
    else if (el.dataset.dinero !== undefined) d[el.name] = el.value.trim() === '' ? null : dinero(el.value);
    else d[el.name] = el.value.trim();
  }
  return d;
}

acciones.editar = (id, el) => { editando = { col: el.dataset.col, id }; };
acciones.cancelar = () => { editando = null; };
acciones.borrar = (id, el) => {
  const item = buscar(el.dataset.col, id);
  if (!item) return;
  const nombre = item.nombre || item.cliente || item.texto || 'este elemento';
  if (confirm('¿Borrar "' + nombre + '"?')) borrarItem(el.dataset.col, id);
};

// ---------- Respaldo ----------
function exportar() {
  datos.ultimoRespaldo = hoy();
  guardar();
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jarvis-respaldo-' + hoy() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importar(archivo) {
  if (!archivo) return;
  let nuevo;
  try { nuevo = JSON.parse(await archivo.text()); }
  catch (e) { alert('No pude leer ese archivo: no parece un respaldo de Jarvis.'); return; }
  const valido = nuevo && typeof nuevo === 'object' && COLECCIONES.every(c => Array.isArray(nuevo[c]));
  if (!valido) { alert('Ese archivo no parece un respaldo de Jarvis.'); return; }
  if (!confirm('Esto reemplaza todos tus datos actuales por los del archivo. ¿Continuar?')) return;
  datos = completar(nuevo);
  editando = null;
  guardar();
  render();
}

acciones.exportar = exportar;
cambios.importar = (id, valor, el) => { importar(el.files[0]).then(() => { el.value = ''; }); };
