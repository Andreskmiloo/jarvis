// Arranque: navegación por #hash, pintar la pantalla y manejar los eventos.

const VISTAS = { tablero: vistaTablero, finanzas: vistaFinanzas, pendientes: vistaPendientes, parfums: vistaParfums };
let fechaPintada = '';

function vistaActual() {
  const v = location.hash.slice(1);
  return VISTAS[v] ? v : 'tablero';
}

function render() {
  const actual = vistaActual();
  fechaPintada = hoy();
  let html;
  try { html = VISTAS[actual](); }
  catch (e) { html = `<p class="aviso">Algo salió mal al mostrar esta pantalla (${esc(e.message)}). Tus datos siguen guardados.</p>`; }
  const sinAlmacen = almacenOk ? '' : '<p class="aviso">⚠ Este navegador no me deja guardar datos (¿modo privado?). Exporta un respaldo antes de cerrar.</p>';
  document.getElementById('vista').innerHTML = sinAlmacen + html;
  document.getElementById('fecha-hoy').textContent =
    new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  document.querySelectorAll('#menu a').forEach(a => {
    if (a.dataset.vista === actual) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// Después de cada acción: guardar y volver a pintar.
document.addEventListener('click', e => {
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  const accion = el.dataset.accion;
  acciones[accion](el.dataset.id, el);
  guardar();
  render();
  if (accion === 'editar') { // llevar la vista al formulario que se abrió
    const f = document.querySelector('details[open] form');
    if (f) f.scrollIntoView({ block: 'center' });
  }
});

document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  formularios[f.dataset.form](leerForm(f));
  editando = null;
  guardar();
  render();
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-cambio]');
  if (!el) return;
  cambios[el.dataset.cambio](el.dataset.id, el.value, el);
  guardar();
  render();
});

window.addEventListener('hashchange', () => { editando = null; render(); window.scrollTo(0, 0); });

// Si dejas la pestaña abierta de un día para otro, al volver se actualiza "hoy"
// (solo si cambió el día, para no borrar lo que estés escribiendo).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && hoy() !== fechaPintada) render();
});

datos = cargar();
guardar();
render();
