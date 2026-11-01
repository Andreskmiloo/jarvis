// ===== TABLERO (página principal) =====

function vistaTablero() {
  const [actual, siguiente] = quincenasVisibles();
  const alertas = vencenPronto(true);
  const debe = porCobrar().sort((a, b) => (a.fechaCobro || '9999').localeCompare(b.fechaCobro || '9999'));
  const metas = datos.metas.filter(m => !m.hecha).sort(porFecha);
  // Las clases a-xxx colocan cada tarjeta en la rejilla de PC (ver style.css); en celular van una tras otra.
  return `<h2 class="titulo">Tablero</h2>
    <section class="rejilla tablero">
      <article class="tarjeta a-vence${alertas.length ? ' alerta' : ''}">
        <h3>⏰ Vence esta semana <small>${alertas.length ? peso(totalPorPagar(alertas)) + ' por pagar' : 'próximos 7 días'}</small></h3>
        ${listaAlertas(alertas)}
      </article>

      <article class="tarjeta a-libre">
        <h3>💰 Cuánto me queda libre</h3>
        ${bloqueLibre(resumenQuincena(actual), 'Quincena actual')}
        ${bloqueLibre(resumenQuincena(siguiente), 'Siguiente quincena')}
        <p class="suave"><a href="#finanzas">Ver el detalle →</a></p>
      </article>

      <article class="tarjeta a-debe">
        <h3>🧾 Quién me debe <small>${peso(suma(debe, o => o.precio))}</small></h3>
        ${ul(debe.map(o => fila({
          titulo: esc(o.cliente), derecha: peso(o.precio),
          detalle: o.fechaCobro ? textoFecha(o.fechaCobro) : 'sin fecha de cobro',
        })), 'Nadie te debe por ahora.')}
      </article>

      <article class="tarjeta a-metas">
        <h3>🎯 Metas <small><a href="#pendientes">Ver todas →</a></small></h3>
        ${ul(metas.map(filaMetaTablero), 'Sin metas pendientes.', 'columnas')}
      </article>

      <article class="tarjeta a-respaldo">
        <h3>💾 Respaldo</h3>
        <p class="suave">Tus datos viven solo en este navegador. Descarga un respaldo de vez en cuando; sirve también para pasarlos de un aparato a otro.</p>
        ${textoRespaldo()}
        <div class="botones">
          <button class="primario" data-accion="exportar">⬇ Exportar respaldo</button>
          <label class="boton">⬆ Importar respaldo
            <input class="oculto" type="file" accept="application/json,.json" data-cambio="importar"></label>
        </div>
      </article>
    </section>`;
}

function bloqueLibre(r, titulo) {
  return `<div class="libre">
    <div class="linea">
      <span class="nombre">${titulo}<small>${r.etiqueta}</small></span>
      <b class="grande ${r.libre < 0 ? 'rojo' : 'verde'}">${peso(r.libre)}</b>
    </div>
    <div class="detalle">Ingreso ${peso(r.ingreso)} − pagos ${peso(r.totalPagos)} − gastos diarios ${peso(r.totalDiarios)}</div>
    ${avisoSinDescontar(r)}
    ${r.cobros ? `<div class="detalle">Si cobras lo que te deben en esta quincena (+${peso(r.cobros)}): ${peso(r.libre + r.cobros)}</div>` : ''}
  </div>`;
}

function filaMetaTablero(m) {
  const i = infoMeta(m);
  return fila({
    titulo: esc(m.nombre),
    derecha: m.fecha ? textoFecha(m.fecha) : '',
    detalle: i.objetivo ? '' : esc(m.nota),
    extra: i.objetivo ? barraMeta(i) + `<div class="linea detalle"><span>${i.texto}</span><span>${i.pct}%</span></div>` : '',
  });
}

function textoRespaldo() {
  if (!datos.ultimoRespaldo) return '<p class="ambar">Aún no has hecho ningún respaldo.</p>';
  const n = -diasHasta(datos.ultimoRespaldo);
  const texto = n <= 0 ? 'hoy' : n === 1 ? 'ayer' : 'hace ' + n + ' días';
  return `<p class="${n > 7 ? 'ambar' : 'suave'}">Último respaldo: ${texto}.</p>`;
}
