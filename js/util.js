// Utilidades: pesos, texto seguro, fechas, quincenas y piezas de HTML.
//
// Las fechas son texto "AAAA-MM-DD" y SIEMPRE se leen en hora local.
// Ojo: new Date('2026-11-04') se interpreta como UTC y en Colombia daría el día 3,
// y toISOString() para "hoy" daría mañana después de las 7 pm.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// ---------- Formato ----------
function miles(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// 1234567 → "$1.234.567"   (negativos: "-$1.234")
function peso(n) {
  n = Math.round(Number(n) || 0);
  return (n < 0 ? '-' : '') + '$' + miles(Math.abs(n));
}

// "793.900" o "$793.900" → 793900 (quita todo lo que no sea dígito)
function dinero(texto) {
  return Number(String(texto ?? '').replace(/\D/g, '')) || 0;
}

// Texto del usuario → HTML seguro (el JSON importado podría traer etiquetas).
function esc(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
}

let contadorId = 0;
const uid = () => Date.now().toString(36) + (contadorId++).toString(36) + Math.random().toString(36).slice(2, 5);
const suma = (lista, f) => lista.reduce((total, x) => total + (Number(f(x)) || 0), 0);

// ---------- Fechas ----------
const iso = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');

function aFecha(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const deFecha = f => iso(f.getFullYear(), f.getMonth() + 1, f.getDate());
const hoy = () => deFecha(new Date());

function sumarDias(s, n) {
  const f = aFecha(s);
  f.setDate(f.getDate() + n);
  return deFecha(f);
}

const ultimoDia = (y, m) => new Date(y, m, 0).getDate(); // m = 1..12

// Mismo día del mes siguiente (recorta: 31 ene → 28 feb).
function sumarMes(s) {
  let [y, m, d] = s.split('-').map(Number);
  m++;
  if (m > 12) { m = 1; y++; }
  return iso(y, m, Math.min(d, ultimoDia(y, m)));
}

const diasHasta = s => Math.round((aFecha(s) - aFecha(hoy())) / 86400000);

// "hoy", "mañana", "en 3 días", "vencido hace 2 días"
function cuando(s) {
  const n = diasHasta(s);
  if (n < 0) return 'vencido hace ' + (-n) + (n === -1 ? ' día' : ' días');
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  return 'en ' + n + ' días';
}

// "4 nov" (con año si no es el actual)
function fechaCorta(s) {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return d + ' ' + MESES[m - 1] + (y !== new Date().getFullYear() ? ' ' + y : '');
}

const claseFecha = s => { const n = diasHasta(s); return n < 0 ? 'rojo' : n <= 2 ? 'ambar' : 'suave'; };
const textoFecha = s => s ? `<span class="fecha ${claseFecha(s)}">${fechaCorta(s)} · ${cuando(s)}</span>` : '';

// ---------- Quincenas ----------
// Se paga el 15 y el 30 (en febrero, el último día). Una quincena empieza el día de pago:
//   quincena del 15 → días 15 al 29      quincena del 30 → día 30 al 14 del mes siguiente
const dia30 = (y, m) => Math.min(30, ultimoDia(y, m));

// Fecha en que empezó la quincena que contiene a `s`.
function inicioQuincena(s) {
  let [y, m, d] = s.split('-').map(Number);
  if (d < 15) { // 1–14: todavía rige la quincena del 30 del mes anterior
    m--;
    if (m === 0) { m = 12; y--; }
    return iso(y, m, dia30(y, m));
  }
  return d >= dia30(y, m) ? iso(y, m, dia30(y, m)) : iso(y, m, 15);
}

function siguienteQuincena(inicio) {
  let [y, m, d] = inicio.split('-').map(Number);
  if (d === 15) return iso(y, m, dia30(y, m));
  m++;
  if (m === 13) { m = 1; y++; }
  return iso(y, m, 15);
}

const esQuincena15 = inicio => inicio.endsWith('-15');
const etiquetaQuincena = inicio => fechaCorta(inicio) + ' – ' + fechaCorta(sumarDias(siguienteQuincena(inicio), -1));

// Días de [inicio, fin) que cuentan (todos, o solo lunes a viernes).
function diasEnPeriodo(inicio, fin, soloHabiles) {
  let n = 0;
  for (let f = inicio; f < fin; f = sumarDias(f, 1)) {
    const dia = aFecha(f).getDay(); // 0 = domingo … 6 = sábado
    if (!soloHabiles || (dia >= 1 && dia <= 5)) n++;
  }
  return n;
}

// ---------- Piezas de HTML ----------
const campo = (etiqueta, nombre, valor = '', extra = '') =>
  `<label>${etiqueta}<input name="${nombre}" value="${esc(valor)}" ${extra}></label>`;

const campoDinero = (etiqueta, nombre, valor, extra = '') =>
  campo(etiqueta, nombre, valor ? miles(valor) : '', `inputmode="numeric" data-dinero ${extra}`);

const campoFecha = (etiqueta, nombre, valor, extra = '') =>
  campo(etiqueta, nombre, valor, `type="date" ${extra}`);

const casilla = (etiqueta, nombre, marcada) =>
  `<label class="casilla"><input type="checkbox" name="${nombre}"${marcada ? ' checked' : ''}> ${etiqueta}</label>`;

function selector(etiqueta, nombre, opciones, valor) {
  const ops = opciones.map(([v, t]) => `<option value="${v}"${v === valor ? ' selected' : ''}>${t}</option>`).join('');
  return `<label>${etiqueta}<select name="${nombre}">${ops}</select></label>`;
}

// Formulario plegable. `item` = lo que se está editando (o null para crear uno nuevo).
function formulario(nombre, titulo, item, campos) {
  return `<details class="agregar"${item ? ' open' : ''}>
    <summary>${item ? '✎ Editando: ' + esc(item.nombre || item.cliente || item.texto) : '＋ ' + titulo}</summary>
    <form data-form="${nombre}" autocomplete="off">
      ${campos}
      <div class="botones">
        <button class="primario">${item ? 'Guardar cambios' : 'Agregar'}</button>
        ${item ? '<button type="button" data-accion="cancelar">Cancelar</button>' : ''}
      </div>
    </form>
  </details>`;
}

// Fila de lista. Todos los campos ya son HTML seguro: usa esc() con el texto del usuario.
// Con `col` + `id` muestra los botones de editar y borrar.
// Con `ok` ({ accion, id, etiqueta, nombre }) muestra un botón ✓ de acción rápida.
function fila(o) {
  const rapido = o.ok
    ? `<button class="ok-rapido" data-accion="${o.ok.accion}" data-id="${esc(o.ok.id)}" aria-label="${esc(o.ok.etiqueta)}: ${esc(o.ok.nombre)}" title="${esc(o.ok.etiqueta)}">✓</button>`
    : '';
  const iconos = o.col ? `<div class="iconos">
      <button data-accion="editar" data-col="${o.col}" data-id="${esc(o.id)}" aria-label="Editar" title="Editar">✎</button>
      <button data-accion="borrar" data-col="${o.col}" data-id="${esc(o.id)}" aria-label="Borrar" title="Borrar">🗑</button>
    </div>` : '';
  return `<li class="item${o.clase ? ' ' + o.clase : ''}">
    ${o.izquierda || ''}
    <div class="texto">
      <div class="linea"><span class="nombre">${o.titulo}</span><span class="derecha">${o.derecha || ''}</span></div>
      ${o.detalle ? `<div class="detalle">${o.detalle}</div>` : ''}
      ${o.extra ? `<div class="extra">${o.extra}</div>` : ''}
    </div>
    ${rapido}
    ${iconos}
  </li>`;
}

const ul = (filas, vacio, clase = '') =>
  filas.length ? `<ul class="lista ${clase}">${filas.join('')}</ul>` : `<p class="vacio">${vacio}</p>`;
