// Interfaz: ventana emergente, avisos, animaciones y reloj.
// Todo el movimiento respeta "reducir movimiento" del sistema (accesibilidad).

const reducirMovimiento = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------- Ventana emergente (formularios y confirmaciones) ----------
let alAceptar = null;
let temporizadorHoja = 0;
let focoAnterior = null;

function abrirHoja(titulo, html, opciones = {}) {
  const h = document.getElementById('hoja');
  if (!h.classList.contains('abierta')) focoAnterior = document.activeElement;
  clearTimeout(temporizadorHoja);
  h.innerHTML = `<div class="hoja-fondo" data-accion="cerrarHoja"></div>
    <div class="hoja-panel${opciones.chica ? ' chica' : ''}${opciones.enSitio ? ' quieta' : ''}" role="dialog" aria-modal="true" aria-labelledby="hoja-titulo">
      <div class="hoja-cab">
        <h3 id="hoja-titulo">${titulo}</h3>
        <button type="button" class="icono-btn" data-accion="cerrarHoja" aria-label="Cerrar">${ic('cerrar')}</button>
      </div>
      <div class="hoja-cuerpo">${html}</div>
    </div>`;
  h.classList.add('abierta');
  h.setAttribute('aria-hidden', 'false');
  document.body.classList.add('con-hoja');
  document.querySelector('.app').inert = true;
  const primero = opciones.enSitio ? h.querySelector('.seg.on') :
    (opciones.chica ? h.querySelector('.hoja-cuerpo [data-accion="cerrarHoja"]') :
      h.querySelector('input:not([type="hidden"]):not([type="checkbox"]):not([type="date"]), select'));
  (primero || h.querySelector('.hoja-cab button')).focus({ preventScroll: true });
}

function cerrarHoja() {
  const h = document.getElementById('hoja');
  editando = null;
  alAceptar = null;
  if (!h.classList.contains('abierta')) return;
  h.classList.remove('abierta');
  document.querySelector('.app').inert = false;
  if (focoAnterior?.isConnected) focoAnterior.focus({ preventScroll: true });
  else document.getElementById('vista').focus({ preventScroll: true });
  focoAnterior = null;
  h.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('con-hoja');
  temporizadorHoja = setTimeout(() => { if (!h.classList.contains('abierta')) h.innerHTML = ''; }, 350);
}
acciones.cerrarHoja = cerrarHoja;

// Pide confirmación antes de hacer algo que no se puede deshacer. `texto` ya debe venir en HTML seguro.
function confirmar({ titulo, texto, boton = 'Confirmar', peligro = false, alAceptar: hacer }) {
  abrirHoja(titulo, `<p class="texto-hoja">${texto}</p>
    <div class="botones">
      <button type="button" class="btn ${peligro ? 'peligro' : 'primario'}" data-accion="confirmarSi">${boton}</button>
      <button type="button" class="btn suave" data-accion="cerrarHoja">Cancelar</button>
    </div>`, { chica: true });
  alAceptar = hacer; // después de abrir (abrir no lo borra, cerrar sí)
}
acciones.confirmarSi = () => {
  const hacer = alAceptar;
  cerrarHoja();
  if (hacer) hacer();
};

// ---------- Avisos breves ----------
function avisar(texto, tipo = 'ok') {
  const cont = document.getElementById('avisos');
  if (!cont) return;
  const el = document.createElement('div');
  el.className = 'toast ' + tipo;
  el.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
  el.innerHTML = ic(tipo === 'error' ? 'alerta' : 'check') + '<span></span>';
  el.lastChild.textContent = texto;
  cont.appendChild(el);
  setTimeout(() => el.classList.add('sale'), 2800);
  setTimeout(() => el.remove(), 3200);
}

// ---------- Animaciones ----------
// Guarda el valor anterior de cada cifra/barra para animar de uno a otro (se borra al cambiar de pantalla).
const previos = new Map();

// Cifras que cuentan: <span data-contar="1234" data-formato="peso|pct|entero">
function animarContadores() {
  const quieto = reducirMovimiento();
  document.querySelectorAll('#vista [data-contar]').forEach((el, i) => {
    const destino = Number(el.dataset.contar) || 0;
    const formato = el.dataset.formato || 'peso';
    const clave = el.dataset.clave || 'c' + i;
    const desde = previos.has(clave) ? previos.get(clave) : 0;
    previos.set(clave, destino);
    if (quieto || desde === destino) { el.textContent = formatear(destino, formato); return; }
    el.textContent = formatear(desde, formato);
    const t0 = performance.now();
    const paso = t => {
      const k = Math.min(1, (t - t0) / 900);
      el.textContent = formatear(desde + (destino - desde) * (1 - Math.pow(1 - k, 3)), formato);
      if (k < 1 && el.isConnected) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  });
}

// Barras y anillos que se llenan: <div data-p="40" style="--p:40"> (el CSS hace la transición).
// Primero todos van a su valor inicial, se calcula el estilo UNA vez, y después todos al valor final.
// (Si se calculara el estilo antes de poner el inicial, la barra nacería ya llena y no se animaría.)
function animarBarras() {
  const quieto = reducirMovimiento();
  const animar = [];
  document.querySelectorAll('#vista [data-p]').forEach((el, i) => {
    const destino = Number(el.dataset.p) || 0;
    const clave = el.dataset.clave || 'b' + i;
    const desde = previos.has(clave) ? previos.get(clave) : 0;
    previos.set(clave, destino);
    if (quieto || desde === destino) { el.style.setProperty('--p', destino); return; }
    el.style.setProperty('--p', desde);
    animar.push([el, destino]);
  });
  if (!animar.length) return;
  void document.body.offsetWidth; // un solo cálculo de estilos con todo en su valor inicial
  requestAnimationFrame(() => animar.forEach(([el, destino]) => el.style.setProperty('--p', destino)));
}

// Las tarjetas entran una tras otra (solo al cambiar de pantalla, no en cada acción).
function entrada() {
  const v = document.getElementById('vista');
  v.querySelectorAll('.encabezado, .tarjeta').forEach((el, i) => el.style.setProperty('--i', i));
  v.classList.remove('entra');
  void v.offsetWidth;
  if (reducirMovimiento()) return;
  v.classList.add('entra');
  clearTimeout(entrada.t);
  entrada.t = setTimeout(() => v.classList.remove('entra'), 1700);
}

// Luz que sigue al puntero sobre cada tarjeta
document.addEventListener('pointermove', e => {
  const t = e.target.closest && e.target.closest('.tarjeta');
  if (!t) return;
  const r = t.getBoundingClientRect();
  t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
  t.style.setProperty('--my', (e.clientY - r.top) + 'px');
}, { passive: true });

// ---------- Reloj y saludo ----------
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const saludo = () => { const h = new Date().getHours(); return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'; };
const horaActual = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const fechaLarga = () => { const d = new Date(); return DIAS_LARGOS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES_LARGOS[d.getMonth()]; };

function actualizarReloj() {
  for (const [id, texto] of [['reloj', horaActual()], ['saludo', saludo()], ['fecha-hoy', fechaLarga()]]) {
    const el = document.getElementById(id);
    if (el && el.textContent !== texto) el.textContent = texto;
  }
}
setInterval(actualizarReloj, 15000);
