// Arranque: navegación por #hash, pintar la pantalla y manejar los eventos.

const SECCIONES = [
  { id: 'inicio', texto: 'Inicio', icono: 'inicio', vista: vistaInicio },
  { id: 'cuentas', texto: 'Cuentas', icono: 'cuentas', vista: vistaCuentas },
  { id: 'finanzas', texto: 'Finanzas', icono: 'finanzas', vista: vistaFinanzas },
  { id: 'pendientes', texto: 'Pendientes', icono: 'pendientes', vista: vistaPendientes },
  { id: 'negocio', texto: 'Negocio', icono: 'negocio', vista: vistaNegocio },
];
const ALIAS = { tablero: 'inicio', parfums: 'negocio' }; // direcciones de la versión anterior

let vistaPintada = '';
let fechaPintada = '';

function vistaActual() {
  const h = location.hash.slice(1);
  const id = ALIAS[h] || h;
  return SECCIONES.some(s => s.id === id) ? id : 'inicio';
}

function construirMenu() {
  const menu = document.getElementById('menu');
  menu.style.setProperty('--n', SECCIONES.length);
  menu.innerHTML = SECCIONES.map(s =>
    `<a href="#${s.id}" data-vista="${s.id}">${ic(s.icono)}<span>${s.texto}</span></a>`).join('') + '<i class="ind" aria-hidden="true"></i>';
  document.getElementById('fab').innerHTML = ic('mas');
  document.getElementById('registrar-lat').innerHTML = ic('mas') + '<span>Registrar movimiento</span>';
  document.getElementById('pie-exportar').innerHTML = ic('descargar') + '<span>Descargar respaldo</span>';
}

function render() {
  const id = vistaActual();
  const seccion = SECCIONES.find(s => s.id === id);
  const cambio = id !== vistaPintada;
  vistaPintada = id;
  fechaPintada = hoy();

  let html;
  try { html = seccion.vista(); }
  catch (e) {
    console.error(e);
    html = `<p class="aviso">${ic('alerta')}<span>Algo salió mal al mostrar esta pantalla (${esc(e.message)}). Tus datos siguen guardados.</span></p>`;
  }
  const sinAlmacen = almacenOk ? ''
    : `<p class="aviso">${ic('alerta')}<span>Este navegador no me deja guardar datos (¿modo privado?). Exporta un respaldo antes de cerrar.</span></p>`;
  document.getElementById('vista').innerHTML = sinAlmacen + html;
  montarNucleo(document.querySelector('.hero-esfera'));

  const menu = document.getElementById('menu');
  menu.querySelectorAll('a').forEach((a, i) => {
    if (a.dataset.vista === id) { a.setAttribute('aria-current', 'page'); menu.style.setProperty('--i', i); }
    else a.removeAttribute('aria-current');
  });
  document.title = seccion.texto + ' · Jarvis';
  document.getElementById('estado-guardado').textContent = almacenOk ? 'Almacenamiento local' : 'Cambios sin guardar';
  document.body.dataset.vista = id;
  document.getElementById('pie-respaldo').textContent = datos.ultimoRespaldo ? 'Último respaldo: ' + hace(datos.ultimoRespaldo) : 'Aún sin respaldo';

  if (cambio) previos.clear();
  actualizarReloj();
  animarContadores();
  animarBarras(); // antes de entrada(): esta calcula estilos y las barras deben partir de su valor inicial
  if (cambio) entrada();
  pintarGraficos();
}

// Los diálogos se abren en el mismo evento para que el foco responda de inmediato.
const accionesConGuardado = new Set(['confirmarSi', 'exportar', 'pagar', 'cobrado', 'tareaHecha', 'metaHecha', 'habitoHoy']);
document.addEventListener('click', e => {
  const el = e.target.closest('[data-accion]');
  const accion = el?.dataset.accion;
  if (!Object.hasOwn(acciones, accion)) return;
  const ejecutar = () => acciones[accion](el.dataset.id, el);
  if (accionesConGuardado.has(accion)) cambiarDatos(ejecutar);
  else if (accion === 'cerrarHoja' || !sincronizarPestana()) ejecutar();
});

document.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const F = FORMULARIOS[f.dataset.form];
  cambiarDatos(() => {
    if (!f.isConnected || !f.closest('.hoja.abierta')) return false;
    const previo = (F.col && enEdicion(F.col)) || null;
    if (F.guardar(leerForm(f), previo || {}) === false) return false;
    cerrarHoja();
    avisar(F.aviso || (previo ? 'Cambios guardados' : 'Agregado'));
  });
});

document.addEventListener('change', e => {
  const el = e.target.closest('[data-cambio]');
  if (!el || !Object.hasOwn(cambios, el.dataset.cambio)) return;
  const aplicar = () => cambios[el.dataset.cambio](el.dataset.id, el.value, el);
  if (el.dataset.cambio === 'importar') {
    if (!sincronizarPestana()) aplicar();
  } else {
    cambiarDatos(aplicar);
  }
});

window.addEventListener('storage', e => {
  if (e.key === CLAVE || e.key === null) sincronizarPestana();
});

// Escape cierra la ventana emergente; Tab se queda dentro de ella (accesibilidad con teclado)
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { cerrarHoja(); return; }
  if (e.key !== 'Tab') return;
  const panel = document.querySelector('#hoja.abierta .hoja-panel');
  if (!panel) return;
  const enfocables = [...panel.querySelectorAll('button, input:not([type="hidden"]), select, a[href]')].filter(el => !el.disabled && el.offsetParent !== null);
  if (!enfocables.length) return;
  const primero = enfocables[0];
  const ultimo = enfocables[enfocables.length - 1];
  if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
});

window.addEventListener('hashchange', () => {
  cerrarHoja();
  render();
  document.getElementById('vista').focus({ preventScroll: true });
  window.scrollTo(0, 0);
});

// Si dejas la pestaña abierta de un día para otro, al volver se actualiza "hoy"
// (solo si cambió el día, para no borrar lo que estés escribiendo).
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !sincronizarPestana()) {
    actualizarReloj();
    if (hoy() !== fechaPintada) render();
  }
});

datos = cargar();
construirMenu();
render();
