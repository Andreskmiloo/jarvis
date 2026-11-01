// ===== INICIO (tablero principal) =====

// Deudas pendientes: el total de la deuda si lo conoces (tarjetas), o el monto a pagar.
const totalDeudas = () => suma(datos.pagos.filter(p => p.tipo === 'deuda' && !p.pagado), p => p.saldo || p.monto);

function vistaInicio() {
  const [actual, siguiente] = quincenasVisibles();
  const qa = resumenQuincena(actual);
  const qs = resumenQuincena(siguiente);
  const alertas = vencenPronto(true);
  const efectivo = totalCuentas('efectivo');
  const digital = totalCuentas('digital');
  const disponible = efectivo + digital;
  const positivo = Math.max(0, efectivo) + Math.max(0, digital);
  const pEfectivo = positivo > 0 ? limitarPct(Math.max(0, efectivo) / positivo * 100) : 0;
  const pDigital = positivo > 0 ? limitarPct(Math.max(0, digital) / positivo * 100) : 0;
  const cobrar = porCobrar();
  const totalCobrar = suma(cobrar, o => o.precio);
  const deudas = totalDeudas();
  const neta = disponible + totalCobrar - deudas;
  const sinSaldos = datos.cuentas.every(c => !c.saldo);
  const debe = [...cobrar].sort((a, b) => (a.fechaCobro || '9999').localeCompare(b.fechaCobro || '9999'));
  const metas = datos.metas.filter(m => !m.hecha).sort(porFecha).slice(0, 6);

  const kpi = (etiqueta, valor, detalle, clase, k) => `<article class="tarjeta kpi">
      <span class="etiqueta">${etiqueta}</span>
      <b class="num ${clase}" data-k="${k}">${contador(valor)}</b>
      <span class="detalle">${detalle}</span>
    </article>`;

  // Las clases a-xxx colocan cada tarjeta en la rejilla de PC (ver style.css); en celular van una tras otra.
  return `<header class="encabezado">
      <div>
        <span class="etiqueta" id="saludo">${saludo()}</span>
        <h2 class="titulo">Inicio</h2>
        <p class="sub" id="fecha-hoy">${fechaLarga()}</p>
      </div>
    </header>
    <section class="rejilla inicio">
      <article class="tarjeta hero a-hero">
        <div class="hero-cab">
          <span class="etiqueta">Disponible ahora</span>
          <a class="enlace" href="#cuentas">Ver cuentas${ic('flecha')}</a>
        </div>
        <b class="gigante num ${disponible < 0 ? 'rojo' : 'degradado'}" data-k="disponible">${contador(disponible)}</b>
        <div class="reparto grande" aria-hidden="true">
          <i class="efectivo" data-p="${pEfectivo}" style="--p:${pEfectivo}"></i>
          <i class="digital" data-p="${pDigital}" style="--p:${pDigital}"></i>
        </div>
        <div class="chips-tipos">
          <span class="chip efectivo"><i></i>Efectivo <b data-k="efectivo">${contador(efectivo)}</b></span>
          <span class="chip digital"><i></i>Digital <b data-k="digital">${contador(digital)}</b></span>
        </div>
        <div class="hero-pie">
          <div><span>Por cobrar</span><b class="verde num" data-k="hero-cobrar">${contador(totalCobrar)}</b></div>
          <div><span>Deudas</span><b class="num" data-k="hero-deudas">${contador(deudas)}</b></div>
          <div><span>Posición neta</span><b class="num ${neta < 0 ? 'rojo' : ''}" data-k="hero-neta">${contador(neta)}</b></div>
        </div>
        ${sinSaldos ? `<p class="aviso">${ic('info')}<span>Escribe cuánto tienes en tu billetera y en tus bancos. <a href="#cuentas">Ir a cuentas</a></span></p>` : ''}
      </article>

      <div class="kpis a-kpis">
        ${kpi('Libre · actual', qa.libre, qa.etiqueta, qa.libre < 0 ? 'rojo' : 'verde', 'libre-actual')}
        ${kpi('Libre · siguiente', qs.libre, qs.etiqueta, qs.libre < 0 ? 'rojo' : 'verde', 'libre-siguiente')}
        ${kpi('Pagos · 7 días', totalPorPagar(alertas), `${alertas.filter(a => a.porPagar !== undefined).length} pagos`, '', 'por-pagar')}
        ${kpi('Por cobrar', totalCobrar, `${cobrar.length} ${cobrar.length === 1 ? 'cliente' : 'clientes'}`, 'ambar', 'por-cobrar')}
      </div>

      <article class="tarjeta a-lecturas">
        ${cab('Lectura de Jarvis', 'según tus datos', 'chispa')}
        ${listaLecturas(5)}
      </article>

      ${tarjetaCaja('a-caja')}

      <article class="tarjeta a-semana${alertas.length ? ' alerta' : ''}">
        ${cab('Vence esta semana', alertas.length ? peso(totalPorPagar(alertas)) + ' por pagar' : 'próximos 7 días', 'reloj')}
        ${listaAlertas(alertas)}
      </article>

      <article class="tarjeta a-debe">
        ${cab('Quién me debe', peso(totalCobrar), 'cobro')}
        ${ul(debe.map(o => fila({
          izquierda: ico('cobro', o.fechaCobro && o.fechaCobro < hoy() ? 'neg' : 'acc'),
          titulo: esc(o.cliente), derecha: peso(o.precio),
          detalle: o.fechaCobro ? textoFecha(o.fechaCobro) : 'sin fecha de cobro',
          ok: { accion: 'cobrado', id: o.id, etiqueta: 'Marcar cobrado', nombre: o.cliente },
        })), 'Nadie te debe por ahora.')}
      </article>

      <article class="tarjeta a-metas">
        ${cab('Metas', '', 'meta', `<a class="enlace" href="#pendientes">Ver todas${ic('flecha')}</a>`)}
        ${metas.length ? `<ul class="metas-mini">${metas.map(filaMetaMini).join('')}</ul>` : '<p class="vacio">Sin metas pendientes.</p>'}
      </article>

      <article class="tarjeta a-rutina">
        ${cab('Rutina de hoy', datos.habitos.length ? `${datos.habitos.filter(h => h.hechos.includes(hoy())).length} de ${datos.habitos.length}` : '', 'llama')}
        ${ul(datos.habitos.map(filaHabito), 'Agrega un hábito en Pendientes para construir tu racha.')}
      </article>

      <article class="tarjeta a-respaldo">
        ${cab('Respaldo', '', 'escudo')}
        <p class="suave">Tus datos viven solo en este navegador. Descarga un respaldo de vez en cuando; sirve también para pasarlos de un aparato a otro.</p>
        ${textoRespaldo()}
        <div class="botones">
          <button type="button" class="btn primario" data-accion="exportar">${ic('descargar')}<span>Exportar respaldo</span></button>
          <label class="btn">${ic('subir')}<span>Importar respaldo</span>
            <input class="oculto" type="file" accept="application/json,.json" data-cambio="importar"></label>
        </div>
      </article>
    </section>`;
}

function filaMetaMini(m) {
  const i = infoMeta(m);
  return `<li class="meta-mini">
    ${i.objetivo ? anillo(i.pct, `<b>${i.pct}%</b>`, i.atrasada ? 'atrasada' : '') : ico('meta')}
    <div>
      <b>${esc(m.nombre)}</b>
      <span class="detalle">${i.objetivo ? i.texto : esc(m.nota)}</span>
      ${m.fecha ? `<span class="detalle">${textoFecha(m.fecha)}</span>` : ''}
    </div>
  </li>`;
}

function textoRespaldo() {
  if (!datos.ultimoRespaldo) return '<p class="ambar nota">Aún no has hecho ningún respaldo.</p>';
  const n = -diasHasta(datos.ultimoRespaldo);
  return `<p class="${n > 7 ? 'ambar' : 'suave'} nota">Último respaldo: ${hace(datos.ultimoRespaldo)}.</p>`;
}
