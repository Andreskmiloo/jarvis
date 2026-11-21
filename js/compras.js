// ===== COMPRAS: lo que quieres comprar, si te conviene ahora y en qué se va tu dinero =====
// Cada deseo pasa por un semáforo que mira tu momento económico (lo libre de la quincena, los pagos que
// vienen, las deudas atrasadas y tu colchón) y te dice si comprarlo ya, esperar o cómo ahorrarlo.
// Los resultados del buscador de ofertas (archivos JSON) se importan y quedan ligados a su deseo.
// Todo son reglas simples sobre tus datos: es una ayuda para decidir, no una asesoría financiera.

const PRIORIDADES = [['3', 'Lo necesito'], ['2', 'Lo quiero mucho'], ['1', 'Sería bueno tenerlo']];
const urlSegura = u => typeof u === 'string' && /^https?:\/\//i.test(u.trim()) ? u.trim() : '';

// ---------- Tu momento económico ----------
function momentoEconomico() {
  const inicio = inicioQuincena(hoy());
  const qa = resumenQuincena(inicio), qs = resumenQuincena(siguienteQuincena(inicio));
  const ingresoMes = (Number(datos.ingresos.q15) || 0) + (Number(datos.ingresos.q30) || 0);
  const disponible = totalCuentas();
  const atrasadas = deudasActivas().filter(p => p.fecha && p.fecha < hoy());
  const proximos = suma(vencenPronto(false), i => i.porPagar);
  const gastoMes = gastoMensualFijo();
  return {
    qa, qs, ingresoMes, disponible, atrasadas, proximos, gastoMes,
    colchon: gastoMes ? disponible / gastoMes : 0, // meses que aguantas con lo que tienes
  };
}

// Lo que se te va cada mes sí o sí: fijos, cuotas de deudas que se repiten y gastos diarios.
function gastoMensualFijo() {
  return suma(seriesMensuales(), p => p.monto)
    + suma(datos.diarios, g => (Number(g.monto) || 0) * (g.soloHabiles ? 22 : 30));
}

// Una entrada por cada pago que se repite cada mes (la cuota más reciente de su serie).
function seriesMensuales() {
  const series = new Map();
  for (const p of datos.pagos) if (p.mensual) {
    const k = p.serieMensual || p.id, previo = series.get(k);
    if (!previo || (p.fecha || '') > (previo.fecha || '')) series.set(k, p);
  }
  return [...series.values()];
}

// ---------- El semáforo ----------
// rojo = no ahora · ámbar = con cuidado · verde = puedes
function evaluarCompra(precio, m = momentoEconomico()) {
  precio = Number(precio) || 0;
  const razones = [];
  let color = 'verde';
  const subir = c => { if (c === 'rojo' || (c === 'ambar' && color === 'verde')) color = c; };
  const libre = m.qa.libre;

  if (!precio) return { color: 'gris', titulo: 'Falta el precio', razones: ['Escribe cuánto cuesta para evaluarlo.'], plan: '' };
  if (m.atrasadas.length) { subir('rojo'); razones.push(`Tienes ${m.atrasadas.length} ${m.atrasadas.length === 1 ? 'deuda atrasada' : 'deudas atrasadas'}: ponerlas al día rinde más que cualquier descuento.`); }
  if (precio > m.disponible) { subir('rojo'); razones.push(`Cuesta más de lo que tienes hoy en tus cuentas (${peso(m.disponible)}).`); }
  if (libre - precio < 0) { subir('rojo'); razones.push(libre > 0 ? `Te dejaría en negativo esta quincena (te quedan ${peso(libre)} libres).` : 'Esta quincena ya no te queda dinero libre.'); }
  else if (precio > libre * .3) { subir('ambar'); razones.push(`Se come el ${Math.round(precio / libre * 100)}% de lo libre de esta quincena.`); }
  if (m.proximos && m.disponible - precio < m.proximos) { subir('ambar'); razones.push(`En los próximos 7 días vencen pagos por ${peso(m.proximos)}.`); }
  if (m.gastoMes && m.colchon < 1) { subir('ambar'); razones.push('Aún no tienes un colchón de un mes de gastos.'); }
  if (m.ingresoMes && precio > m.ingresoMes * .25) { subir('ambar'); razones.push(`Equivale al ${Math.round(precio / m.ingresoMes * 100)}% de tu ingreso del mes.`); }
  if (color === 'verde') razones.push('Te alcanza sin tocar tus pagos ni dejar la quincena en rojo.');

  return { color, titulo: { verde: 'Puedes comprarlo', ambar: 'Con cuidado', rojo: 'Mejor no ahora' }[color], razones: razones.slice(0, 3), plan: color === 'verde' ? '' : planAhorro(precio, m) };
}

// Cómo llegar: apartar una parte de lo libre cada quincena hasta juntarlo.
function planAhorro(precio, m) {
  const libreProximo = Math.max(m.qs.libre, 0);
  if (!libreProximo) return 'Primero pon al día tus pagos: la próxima quincena tampoco te queda libre.';
  const aparte = Math.max(Math.round(libreProximo * .3 / 1000) * 1000, 1000);
  const quincenas = Math.ceil(precio / aparte);
  let fecha = inicioQuincena(hoy());
  for (let i = 0; i < quincenas; i++) fecha = siguienteQuincena(fecha);
  return quincenas > 24
    ? `Apartando ${peso(aparte)} por quincena tardarías más de un año: busca una opción más barata o súmale un ingreso extra.`
    : `Apartando ${peso(aparte)} por quincena (30% de lo libre) lo tienes el ${fechaCorta(fecha)}${quincenas > 1 ? ` (${quincenas} quincenas)` : ''}.`;
}

// ---------- Pantalla ----------
function vistaCompras() {
  const m = momentoEconomico();
  const deseos = [...datos.deseos].sort((a, b) => (!!a.comprado - !!b.comprado) || (Number(b.prioridad) || 0) - (Number(a.prioridad) || 0));
  return `${encabezado('Compras inteligentes', 'Compras', 'Lo que quieres comprar, si te conviene ahora y en qué se va tu dinero.',
      btnNuevo('deseo', 'Nuevo deseo', {}, 'btn primario')
      + `<label class="btn suave archivo">${ic('subir')}<span>Importar ofertas</span><input type="file" accept="application/json,.json" data-cambio="importarOfertas" hidden></label>`)}
    <section class="rejilla compras">
      <article class="tarjeta a-momento">${tarjetaMomento(m)}</article>
      <article class="tarjeta a-deseos">
        ${cab('Lo que quiero comprar', deseos.length ? `${deseos.filter(d => !d.comprado).length} pendientes` : '', 'meta', btnNuevo('deseo', 'Agregar'))}
        ${ul(deseos.map(d => filaDeseo(d, m)), 'Agrega lo que quieres comprar, o importa un resultado del buscador de ofertas, y Jarvis te dice si te conviene ahora.')}
      </article>
      <article class="tarjeta a-gasto">${tarjetaGasto()}</article>
      <article class="tarjeta a-fijos">${tarjetaFijos()}</article>
    </section>`;
}

function tarjetaMomento(m) {
  const colchon = m.gastoMes ? (m.colchon >= 10 ? '10+' : m.colchon.toFixed(1)) + ' meses' : 'sin datos';
  return `${cab('Tu momento económico', 'con esto decide el semáforo', 'pulso')}
    <div class="stats">
      <div><span>Libre esta quincena</span><b class="num ${m.qa.libre < 0 ? 'rojo' : 'verde'}">${peso(m.qa.libre)}</b></div>
      <div><span>Libre la siguiente</span><b class="num ${m.qs.libre < 0 ? 'rojo' : ''}">${peso(m.qs.libre)}</b></div>
      <div><span>Pagos en 7 días</span><b class="num">${peso(m.proximos)}</b></div>
      <div><span>Colchón</span><b class="num ${m.colchon < 1 ? 'ambar' : ''}">${colchon}</b></div>
    </div>
    ${m.atrasadas.length ? `<p class="aviso">${ic('alerta')}<span>${m.atrasadas.length} ${m.atrasadas.length === 1 ? 'deuda atrasada' : 'deudas atrasadas'}: mientras no estén al día, Jarvis te dirá que esperes.</span></p>` : ''}
    <p class="detalle">Son reglas simples sobre tus datos para ayudarte a decidir; no es asesoría financiera.</p>`;
}

function filaDeseo(d, m) {
  const precio = Number(d.precio) || 0;
  const ev = d.comprado ? null : evaluarCompra(precio, m);
  const ofertas = Array.isArray(d.ofertas) ? d.ofertas : [];
  const enlace = urlSegura(d.enlace);
  return fila({
    col: 'deseos', id: d.id, clase: d.comprado ? 'hecho' : '',
    izquierda: d.comprado ? ico('ok', 'pos') : `<span class="semaforo ${ev.color}" title="${esc(ev.titulo)}"></span>`,
    titulo: esc(d.nombre),
    derecha: precio ? peso(precio) : '<span class="suave">sin precio</span>',
    detalle: [
      (PRIORIDADES.find(p => p[0] === String(d.prioridad)) || [, ''])[1],
      enlace ? `<a class="enlace" href="${esc(enlace)}" target="_blank" rel="noopener noreferrer">ver</a>` : '',
      d.comprado ? 'comprado' + (d.fechaCompra ? ' el ' + fechaCorta(d.fechaCompra) : '') : '',
      d.nota ? esc(d.nota) : '',
    ].filter(Boolean).join(' · '),
    extra: (ev ? `<div class="veredicto ${ev.color}"><b>${ev.titulo}</b><ul>${ev.razones.map(r => `<li>${r}</li>`).join('')}</ul>${ev.plan ? `<p>${ev.plan}</p>` : ''}</div>` : '')
      + (ofertas.length ? `<details class="ofertas"><summary>${ofertas.length} ${ofertas.length === 1 ? 'oferta' : 'ofertas'} del buscador${d.consultaFecha ? ' · ' + fechaCorta(d.consultaFecha) : ''} ${ic('chevron')}</summary><ul>${ofertas.map(o => {
          const u = urlSegura(o.url);
          return `<li><span>${esc(o.tienda)}${o.condicion && o.condicion !== 'nuevo' ? ' · ' + esc(o.condicion) : ''}</span>
            <span class="producto">${u ? `<a class="enlace" href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(o.producto)}</a>` : esc(o.producto)}</span>
            <b class="num">${peso(o.precio)}</b>${o.nota ? `<small class="ambar">${esc(o.nota)}</small>` : ''}</li>`;
        }).join('')}</ul></details>` : ''),
    ok: { accion: 'deseoComprado', id: d.id, nombre: d.nombre, etiqueta: d.comprado ? 'Deshacer' : 'Ya lo compré', variante: d.comprado ? 'deshacer' : '' },
  });
}

// Comprado: se marca y, si quieres, pasa a tu inventario.
acciones.deseoComprado = id => {
  const d = buscar('deseos', id);
  if (!d) return;
  d.comprado = !d.comprado;
  d.fechaCompra = d.comprado ? hoy() : '';
  if (d.comprado && !datos.bienes.some(b => b.deseo === d.id)) {
    datos.bienes.push({ id: uid(), nombre: d.nombre, categoria: d.categoria || 'otro', valorCompra: Number(d.precio) || 0, fecha: hoy(), aprecio: 4, nota: '', deuda: '', deseo: d.id });
    avisar('Comprado. Ya está en tu inventario');
  } else if (!d.comprado) {
    datos.bienes = datos.bienes.filter(b => b.deseo !== d.id);
    avisar('Compra deshecha');
  }
};

// ---------- En qué gastas ----------
function gastosPorCategoria(mes) {
  const r = Object.create(null);
  for (const mv of datos.movimientos) if (mv.tipo === 'gasto' && (mv.fecha || '').startsWith(mes)) r[mv.categoria || 'Otros'] = (r[mv.categoria || 'Otros'] || 0) + (Number(mv.monto) || 0);
  return r;
}

// Gastos hormiga: compras pequeñas (hasta $25.000) que se repiten 3 veces o más en 30 días.
function gastosHormiga() {
  const desde = sumarDias(hoy(), -30), grupos = new Map();
  for (const mv of datos.movimientos) {
    if (mv.tipo !== 'gasto' || !mv.fecha || mv.fecha < desde || Number(mv.monto) > 25000) continue;
    const k = (mv.nota || mv.categoria || 'Otros').trim().toLowerCase();
    const g = grupos.get(k) || { nombre: mv.nota || mv.categoria || 'Otros', veces: 0, total: 0 };
    g.veces++; g.total += Number(mv.monto) || 0;
    grupos.set(k, g);
  }
  return [...grupos.values()].filter(g => g.veces >= 3).sort((a, b) => b.total - a.total);
}

function tarjetaGasto() {
  const mes = hoy().slice(0, 7), antes = deFecha(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5)) - 2, 1)).slice(0, 7);
  const ahora = gastosPorCategoria(mes), previo = gastosPorCategoria(antes);
  const cats = [...new Set([...Object.keys(ahora), ...Object.keys(previo)])].sort((a, b) => (ahora[b] || 0) - (ahora[a] || 0));
  const total = suma(Object.values(ahora), v => v), totalAntes = suma(Object.values(previo), v => v);
  const maximo = Math.max(1, ...cats.map(c => Math.max(ahora[c] || 0, previo[c] || 0)));
  const hormiga = gastosHormiga();
  const consejos = [];
  for (const c of cats) {
    const a = ahora[c] || 0, p = previo[c] || 0;
    if (p >= 20000 && a > p * 1.3) consejos.push(`<b>${esc(c)}</b> va ${Math.round((a / p - 1) * 100)}% por encima del mes pasado.`);
  }
  for (const h of hormiga.slice(0, 2)) consejos.push(`<b>${esc(h.nombre)}</b>: ${h.veces} veces en 30 días suman ${peso(h.total)}. Al año serían unos ${peso(h.total * 12)}.`);
  return `${cab('En qué se va tu dinero', esc(MESES_LARGOS[Number(mes.slice(5)) - 1]), 'finanzas')}
    <div class="stats dos">
      <div><span>Gastado este mes</span><b class="num">${peso(total)}</b></div>
      <div><span>Mes pasado completo</span><b class="num">${peso(totalAntes)}</b></div>
    </div>
    ${cats.length ? `<ul class="comparar">${cats.map(c => `<li>
        <div class="linea"><span class="nombre">${esc(c)}</span><span class="derecha">${peso(ahora[c] || 0)}</span></div>
        <div class="barras-dobles"><i style="--p:${Math.round((ahora[c] || 0) / maximo * 100)}%"></i><i class="antes" style="--p:${Math.round((previo[c] || 0) / maximo * 100)}%"></i></div>
      </li>`).join('')}</ul><p class="leyenda-dobles"><span>este mes</span><span class="antes">mes pasado</span></p>`
      : '<p class="vacio">Registra tus gastos con el botón + para ver en qué categorías se va tu dinero.</p>'}
    <h4 class="grupo">Qué arreglar</h4>
    ${consejos.length ? `<ul class="consejos">${consejos.map(t => `<li>${ic('chispa')}<span>${t}</span></li>`).join('')}</ul>` : '<p class="vacio">Nada raro por ahora. Jarvis te avisa si una categoría se dispara o aparecen gastos hormiga.</p>'}`;
}

function tarjetaFijos() {
  const series = seriesMensuales().sort((a, b) => (Number(b.monto) || 0) - (Number(a.monto) || 0));
  const totalMes = suma(series, p => p.monto);
  const diarios = suma(datos.diarios, g => (Number(g.monto) || 0) * (g.soloHabiles ? 22 : 30));
  return `${cab('Lo que pagas cada mes', peso(totalMes + diarios) + ' al mes', 'repetir')}
    ${ul([
      ...series.map(p => fila({ izquierda: ico(p.tipo === 'fijo' ? 'repetir' : 'tarjeta', p.tipo === 'fijo' ? 'acc' : 'neg'), titulo: esc(p.nombre), derecha: p.monto ? peso(p.monto) : '<span class="ambar">por confirmar</span>', detalle: `${p.tipo === 'fijo' ? 'fijo' : 'cuota'} · ${peso((Number(p.monto) || 0) * 12)} al año` })),
      ...(diarios ? [fila({ izquierda: ico('calendario', 'acc'), titulo: 'Gastos diarios', derecha: peso(diarios), detalle: `aprox. al mes · ${peso(diarios * 12)} al año` })] : []),
    ], 'Marca "Se repite cada mes" en tus fijos y cuotas para verlos aquí.')}
    ${totalMes + diarios ? `<p class="detalle">Al año son <b>${peso((totalMes + diarios) * 12)}</b>. Revisa si todos valen lo que cuestan.</p>` : ''}`;
}

// ---------- Importar resultados del buscador de ofertas ----------
cambios.importarOfertas = (id, valor, el) => {
  const archivo = el.files && el.files[0];
  el.value = '';
  if (!archivo) return false;
  leerArchivo(archivo).then(texto => {
    let r;
    try { r = JSON.parse(texto); } catch (e) { avisar('Ese archivo no es un resultado del buscador de ofertas.', 'error'); return; }
    if (!registro(r) || typeof r.consulta !== 'string' || !Array.isArray(r.resultados)) { avisar('Ese archivo no es un resultado del buscador de ofertas.', 'error'); return; }
    cambiarDatos(() => importarOfertas(r));
  }).catch(() => avisar('No pude leer ese archivo.', 'error'));
  return false;
};

function importarOfertas(r) {
  const ofertas = r.resultados.filter(o => registro(o) && o.disponible !== false).map(o => ({
    tienda: String(o.tienda || '').slice(0, 80), producto: String(o.producto || o.modelo || '').slice(0, 200),
    precio: Math.round(Number(o.precio_final_estimado_cop || o.precio_cop) || 0), url: urlSegura(o.url),
    condicion: String(o.condicion || ''), nota: Array.isArray(o.alertas) ? o.alertas.filter(a => typeof a === 'string').slice(0, 1).join('') : '',
  })).filter(o => o.precio > 0).sort((a, b) => a.precio - b.precio).slice(0, 6);
  if (!ofertas.length) { avisar('El archivo no trae ofertas con precio.', 'error'); return false; }
  const nombre = r.consulta.trim().slice(0, 120);
  let d = datos.deseos.find(x => x.nombre.trim().toLowerCase() === nombre.toLowerCase());
  if (!d) { d = { id: uid(), nombre, precio: 0, prioridad: 2, categoria: CATEGORIAS_BIEN.some(c => c[0] === r.categoria) ? r.categoria : 'otro', enlace: '', nota: '' }; datos.deseos.push(d); }
  d.ofertas = ofertas;
  d.consultaFecha = typeof r.fecha === 'string' && fechaValida(r.fecha.slice(0, 10)) ? r.fecha.slice(0, 10) : hoy();
  if (!Number(d.precio)) { d.precio = ofertas[0].precio; d.enlace = d.enlace || ofertas[0].url; }
  avisar(`${ofertas.length} ofertas importadas para ${nombre}`);
}

// ---------- Formulario ----------
FORMULARIOS.deseo = {
  col: 'deseos', boton: 'Agregar deseo',
  titulo: d => d ? 'Editar deseo' : 'Nuevo deseo',
  campos: d => {
    d = d || {};
    return campo('Qué quieres comprar', 'nombre', d.nombre, 'required placeholder="Ej.: RAM para el portátil, patineta"')
      + campoDinero('Precio', 'precio', d.precio)
      + selector('Prioridad', 'prioridad', PRIORIDADES, String(d.prioridad || 2))
      + selector('Categoría (para tu inventario)', 'categoria', CATEGORIAS_BIEN, d.categoria || 'tecnologia')
      + campo('Enlace (opcional)', 'enlace', d.enlace, 'type="url" placeholder="https://"')
      + campo('Nota', 'nota', d.nota);
  },
  guardar: (d, previo) => {
    guardarItem('deseos', {
      ...previo, id: previo.id || uid(), nombre: d.nombre, precio: d.precio || 0, prioridad: Number(d.prioridad) || 2,
      categoria: d.categoria, enlace: urlSegura(d.enlace), nota: d.nota,
    });
  },
};
