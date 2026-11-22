// ===== APRENDER: lecciones cortas de finanzas e inversión para empezar desde cero (Colombia) =====
// Cada lección toma 2 o 3 minutos y termina con una pregunta; al acertar queda marcada como aprendida.
// Es educación general: para decisiones grandes, verifica con fuentes oficiales (Superfinanciera, DIAN).

const LECCIONES = [
  { id: 'colchon', titulo: 'El colchón: tu primer paso', min: 2, texto: `
    <p>Antes de invertir necesitas un <b>fondo de emergencia</b>: plata guardada solo para imprevistos (una enfermedad, un daño, quedarte sin ingreso).</p>
    <p>La meta inicial es <b>un mes de tus gastos</b>; después, <b>tres a seis meses</b>. Guárdalo en una cuenta aparte que puedas sacar rápido y que, si se puede, pague intereses.</p>
    <p>Sin colchón, cualquier imprevisto termina en la tarjeta de crédito, y ahí los intereses te comen lo que hayas ganado invirtiendo.</p>`,
    pregunta: '¿Para qué es el fondo de emergencia?', opciones: ['Para invertir en bolsa', 'Para imprevistos, y poder sacarlo rápido', 'Para comprar cuando hay ofertas'], correcta: 1,
    explica: 'Es tu seguro: está para imprevistos, no para gastos planeados ni para arriesgar.' },
  { id: 'compuesto', titulo: 'Interés compuesto', min: 2, texto: `
    <p>Cuando tu dinero gana intereses y esos intereses también ganan intereses, crece cada vez más rápido. Eso es el <b>interés compuesto</b>.</p>
    <p>Ejemplo: $100.000 al 10% anual son $110.000 al año; al segundo año ganas sobre $110.000, no sobre $100.000. En 20 años serían unos $673.000 sin poner un peso más.</p>
    <p>Por eso <b>empezar temprano</b> importa más que empezar con mucho. Prueba la calculadora de esta página con distintos años.</p>`,
    pregunta: '¿Qué hace más poderoso al interés compuesto?', opciones: ['El tiempo', 'Retirar los intereses cada mes', 'Cambiar de banco seguido'], correcta: 0,
    explica: 'El tiempo: entre más años dejes crecer el dinero (sin sacar los intereses), más se nota.' },
  { id: 'deudas', titulo: 'Las deudas también tienen interés', min: 2, texto: `
    <p>El interés funciona al revés cuando debes: las tarjetas de crédito pueden cobrar cerca del máximo legal (la <b>tasa de usura</b>, que en 2026 rondó el 25%–30% efectivo anual).</p>
    <p>Pagar una deuda al 28% es como "ganar" 28% seguro: ninguna inversión normal te da eso sin riesgo. Por eso <b>salir de deudas caras va antes que invertir</b>.</p>
    <p>Truco: si pagas solo el mínimo, la mayor parte se va en intereses. Paga más del mínimo en la deuda más cara.</p>`,
    pregunta: 'Tienes $300.000 libres y una tarjeta al 28% anual. ¿Qué rinde más?', opciones: ['Invertir en cripto', 'Abonar a la tarjeta', 'Dejarlo en la billetera'], correcta: 1,
    explica: 'Abonar a la tarjeta: te ahorras un 28% seguro, sin riesgo.' },
  { id: 'inflacion', titulo: 'Inflación y dólar', min: 2, texto: `
    <p>La <b>inflación</b> es cuánto suben los precios en un año. Si es 5% y tu plata está quieta, cada año compra 5% menos.</p>
    <p>Por eso guardar todo en efectivo no es "seguro": pierde valor. Una cuenta que rinda más que la inflación al menos lo protege.</p>
    <p>El <b>dólar (TRM)</b> afecta lo importado: si sube, celulares, ropa de afuera y compras en Amazon se encarecen. Tener una parte en dólares es una forma de protegerte, pero también sube y baja.</p>`,
    pregunta: 'Si la inflación es 5% y tu cuenta paga 2%, tu dinero…', opciones: ['Gana poder de compra', 'Pierde poder de compra', 'Queda igual'], correcta: 1,
    explica: 'Pierde: los precios suben más rápido que tus intereses.' },
  { id: 'cdt', titulo: 'Cuentas que rinden y CDT', min: 3, texto: `
    <p>Es el escalón más seguro para empezar. Una <b>cuenta de ahorro de alto rendimiento</b> paga intereses y puedes sacar cuando quieras. Un <b>CDT</b> paga un poco más, pero tu plata queda quieta un plazo fijo (90 días, 6 meses, un año).</p>
    <p>Compara la tasa <b>E.A.</b> (efectiva anual): es la que dice cuánto ganas en un año.</p>
    <p>En bancos vigilados por la Superfinanciera, tus depósitos tienen un seguro (Fogafín) hasta un monto por persona y entidad; revisa el monto vigente en fogafin.gov.co.</p>`,
    pregunta: '¿Cuál es la diferencia principal entre una cuenta que rinde y un CDT?', opciones: ['El CDT deja la plata quieta un plazo a cambio de algo más de interés', 'La cuenta no paga intereses', 'El CDT es una acción'], correcta: 0,
    explica: 'El CDT congela tu dinero un tiempo a cambio de una tasa algo mejor.' },
  { id: 'riesgo', titulo: 'Riesgo y rentabilidad', min: 2, texto: `
    <p>Regla de oro: <b>a más rentabilidad posible, más riesgo</b>. Nadie serio te garantiza ganar mucho sin riesgo.</p>
    <p><b>Renta fija</b> (CDT, bonos): sabes de antemano cuánto ganas. <b>Renta variable</b> (acciones, cripto): puede ganar mucho o perder.</p>
    <p>Tu <b>perfil de riesgo</b> depende de cuándo necesitas la plata: lo que vas a usar en menos de 2 años no debería estar en algo que puede caer 30%.</p>`,
    pregunta: 'Necesitas la plata en 6 meses para la matrícula. ¿Dónde la pondrías?', opciones: ['En cripto', 'En acciones de una sola empresa', 'En una cuenta que rinde o un CDT corto'], correcta: 2,
    explica: 'A corto plazo, lo seguro: no puedes esperar a que el mercado se recupere.' },
  { id: 'acciones', titulo: 'Acciones y ETF', min: 3, texto: `
    <p>Una <b>acción</b> es un pedacito de una empresa: si a la empresa le va bien, sube; si le va mal, baja.</p>
    <p>Un <b>ETF</b> o fondo indexado compra muchas empresas a la vez (por ejemplo, las 500 más grandes de EE. UU.). Si una cae, las otras compensan: es la forma más simple de <b>diversificar</b>.</p>
    <p>En Colombia hay apps y comisionistas vigilados por la Superfinanciera para invertir desde montos pequeños. Antes de usar una, verifica que esté vigilada.</p>`,
    pregunta: '¿Por qué un ETF es menos riesgoso que una sola acción?', opciones: ['Porque nunca baja', 'Porque reparte tu dinero en muchas empresas', 'Porque lo garantiza el gobierno'], correcta: 1,
    explica: 'Reparte el riesgo: no dependes de una sola empresa. Pero sí puede bajar.' },
  { id: 'cripto', titulo: 'Cripto sin cuentos', min: 3, texto: `
    <p>Bitcoin y las demás criptomonedas son activos digitales muy <b>volátiles</b>: pueden subir o caer 50% en meses.</p>
    <p>Si decides tener, que sea una <b>parte pequeña</b> de lo que inviertes y plata que podrías perder sin afectar tu vida. Usa plataformas conocidas y activa la verificación en dos pasos.</p>
    <p>Las "stablecoins" como USDT buscan valer 1 dólar: no son para ganar, sino para guardar en dólares, y tienen sus propios riesgos.</p>`,
    pregunta: '¿Cuánto de tu dinero tendría sentido poner en cripto al empezar?', opciones: ['Todo, para ganar rápido', 'Una parte pequeña que puedas perder', 'Lo del fondo de emergencia'], correcta: 1,
    explica: 'Una parte pequeña: es de alto riesgo.' },
  { id: 'diversificar', titulo: 'Diversificar', min: 2, texto: `
    <p><b>No pongas todos los huevos en la misma canasta.</b> Reparte entre tipos de activos (ahorro, acciones, algo en dólares) y también entre <b>fuentes de ingreso</b>.</p>
    <p>Si todo tu ingreso viene de un solo lugar, un despido o una mala temporada te deja en cero. Tu negocio, trabajos por horas o vender algo que sabes hacer suman estabilidad.</p>
    <p>En esta página ves de dónde viene tu dinero: la meta es que ninguna fuente pase del 70%.</p>`,
    pregunta: '¿Qué es diversificar?', opciones: ['Repartir el dinero y los ingresos para no depender de una sola cosa', 'Cambiar de inversión cada semana', 'Invertir solo en lo que más subió'], correcta: 0,
    explica: 'Repartir para que, si algo falla, lo demás te sostenga.' },
  { id: 'estafas', titulo: 'Cómo detectar estafas', min: 2, texto: `
    <p>Señales de alerta: te <b>prometen rentabilidades altas y garantizadas</b>, te presionan para decidir ya, ganas por traer a otros (pirámide) o te piden claves y códigos.</p>
    <p>Antes de entregar dinero, revisa que la entidad esté <b>vigilada por la Superfinanciera</b> (superfinanciera.gov.co). Si no aparece, no.</p>
    <p>Si suena demasiado bueno para ser verdad, casi siempre lo es.</p>`,
    pregunta: 'Te ofrecen 10% mensual garantizado si traes amigos. Es…', opciones: ['Una gran oportunidad', 'Señal clara de pirámide o estafa', 'Un CDT'], correcta: 1,
    explica: 'Rentabilidad garantizada alta + traer gente = pirámide.' },
  { id: 'impuestos', titulo: 'Impuestos básicos', min: 2, texto: `
    <p>Los rendimientos (intereses, ganancias) pueden tener <b>retención en la fuente</b>: el banco descuenta una parte y la paga a la DIAN por ti.</p>
    <p>Si tus ingresos, patrimonio, consumos con tarjeta o compras superan ciertos topes en el año, debes <b>declarar renta</b>. Los topes cambian cada año (se fijan en UVT).</p>
    <p>Revisa cada año los topes vigentes en dian.gov.co. Llevar tus números en Jarvis te facilita esa revisión.</p>`,
    pregunta: '¿Dónde verificas si te toca declarar renta?', opciones: ['En redes sociales', 'En la DIAN, con los topes del año', 'Nunca hace falta'], correcta: 1,
    explica: 'En la DIAN: los topes cambian cada año.' },
  { id: 'resultados', titulo: 'Lee tu estado de resultados', min: 2, texto: `
    <p>En Patrimonio tienes tu mes "como una empresa": <b>ingresos − costos − gastos − pagos de deudas = resultado</b>.</p>
    <p>Si el resultado es positivo, ese es tu dinero para ahorrar e invertir. El porcentaje que te queda es tu <b>tasa de ahorro</b>: una meta sana es 10% o más.</p>
    <p>Si es negativo, mira qué categoría creció (Compras te lo dice) y qué gasto hormiga puedes cortar.</p>`,
    pregunta: 'Entró $1.600.000 y te quedaron $160.000. ¿Cuál es tu tasa de ahorro?', opciones: ['1%', '10%', '16%'], correcta: 1,
    explica: '160.000 / 1.600.000 = 10%.' },
];

const GLOSARIO = [
  ['E.A.', 'Efectiva anual: lo que ganas (o pagas) en un año, ya con el interés compuesto.'],
  ['TRM', 'Tasa representativa del mercado: el precio oficial del dólar en Colombia cada día.'],
  ['Volatilidad', 'Qué tanto y qué tan rápido sube y baja un precio.'],
  ['Diversificar', 'Repartir el dinero para no depender de una sola inversión o ingreso.'],
  ['Liquidez', 'Qué tan rápido puedes convertir algo en efectivo sin perder valor.'],
  ['Tasa de usura', 'El interés máximo que la ley permite cobrar en un crédito.'],
];

const aprendidas = () => (registro(datos.config.lecciones) ? datos.config.lecciones : {});

function tarjetaAprender() {
  const hechas = aprendidas(), n = LECCIONES.filter(l => hechas[l.id]).length;
  const siguiente = LECCIONES.find(l => !hechas[l.id]);
  return `${cab('Aprender', `${n} de ${LECCIONES.length}`, 'chispa')}
    ${barraProg(n / LECCIONES.length * 100)}
    ${siguiente ? `<button type="button" class="btn primario siguiente-leccion" data-accion="abrirLeccion" data-id="${siguiente.id}">${ic('flecha')}<span>Sigue: ${esc(siguiente.titulo)} · ${siguiente.min} min</span></button>` : '<p class="detalle verde">Completaste todas las lecciones. Repásalas cuando quieras.</p>'}
    <ol class="lecciones">${LECCIONES.map((l, i) => `<li class="${hechas[l.id] ? 'hecha' : ''}">
        <button type="button" data-accion="abrirLeccion" data-id="${l.id}"><span class="num-paso">${hechas[l.id] ? ic('check') : i + 1}</span><span>${esc(l.titulo)}</span><small>${l.min} min</small></button>
      </li>`).join('')}</ol>
    <details class="glosario"><summary>Glosario ${ic('chevron')}</summary><dl>${GLOSARIO.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join('')}</dl></details>`;
}

function abrirLeccion(id, respuesta = null) {
  const l = LECCIONES.find(x => x.id === id);
  if (!l) return;
  const i = LECCIONES.indexOf(l), sig = LECCIONES[i + 1];
  const acerto = respuesta === l.correcta;
  abrirHoja(`${i + 1}. ${l.titulo}`, `<div class="leccion">${l.texto}
      <div class="quiz"><b>${l.pregunta}</b>
        ${l.opciones.map((o, k) => `<button type="button" class="opcion${respuesta === null ? '' : k === l.correcta ? ' bien' : k === respuesta ? ' mal' : ''}" data-accion="responderLeccion" data-id="${l.id}" data-op="${k}"${respuesta !== null ? ' disabled' : ''}>${o}</button>`).join('')}
        ${respuesta !== null ? `<p class="${acerto ? 'verde' : 'ambar'}">${acerto ? 'Correcto. ' : 'No exactamente. '}${l.explica}</p>` : ''}
      </div>
      <div class="botones">${respuesta !== null && !acerto ? `<button type="button" class="btn suave" data-accion="abrirLeccion" data-id="${l.id}">Intentar de nuevo</button>` : ''}
        ${sig ? `<button type="button" class="btn ${acerto ? 'primario' : 'suave'}" data-accion="abrirLeccion" data-id="${sig.id}">Siguiente: ${esc(sig.titulo)}</button>` : `<button type="button" class="btn suave" data-accion="cerrarHoja">Cerrar</button>`}</div>
    </div>`);
}

acciones.abrirLeccion = id => abrirLeccion(id);
// Responder: si acierta, la lección queda aprendida (pasa por cambiarDatos, ver app.js).
acciones.responderLeccion = (id, el) => {
  const l = LECCIONES.find(x => x.id === id);
  if (!l) return;
  const op = Number(el.dataset.op);
  if (op === l.correcta) {
    if (!registro(datos.config.lecciones)) datos.config.lecciones = {};
    datos.config.lecciones[id] = hoy();
  }
  setTimeout(() => abrirLeccion(id, op)); // después del repintado
};
