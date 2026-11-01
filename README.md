# Jarvis

Tu centro de control personal: una app web en español, sin servidor y sin dependencias. Guarda todo
en el navegador (`localStorage`) y se respalda con un archivo JSON. Tema oscuro, con movimiento
suave, para celular y PC.

## Qué tiene

- **Inicio**: cuánto tienes disponible (efectivo y digital), cuánto te queda libre en cada quincena,
  lo que vence esta semana (con botón para marcarlo ahí mismo), el flujo de caja de los próximos
  30 días en un gráfico interactivo, las lecturas de Jarvis, quién te debe, tus metas y tu rutina.
- **Cuentas**: tu billetera y tus bancos. Escribes cuánto tienes en cada una (dinero en físico y
  digital) y registras gastos, ingresos y transferencias (por ejemplo, un retiro de cajero).
- **Finanzas**: quincenas, deudas, fijos, gastos diarios y lo que te deben.
- **Pendientes**: matriz de Eisenhower (urgente / importante), metas con anillo de progreso y
  una rutina de hábitos con rachas.
- **Negocio**: ventas, pedidos y ganancia hacia tu meta, y el ritmo que necesitas para llegar.

## Cómo usarla

Abre `index.html` con doble clic. No hay que instalar nada.

Los datos se guardan **solo en ese navegador y en ese aparato**. Para pasarlos al celular (o a otro
computador) usa **Inicio → Exportar respaldo** y luego **Importar respaldo** en el otro lado.
Exporta de vez en cuando: si borras los datos del navegador, se pierden.

Para usarla en el celular, publica estos archivos en cualquier hosting de páginas estáticas
(Netlify, Cloudflare Pages, GitHub Pages…); sigue siendo "sin servidor".

## Control semi-automático

- **Saldos**: en Cuentas escribes lo que tienes. Cada gasto, ingreso o transferencia que registras
  mueve los saldos solo. Con el botón **+** (abajo a la derecha en el celular, arriba a la izquierda
  en PC) lo registras desde cualquier pantalla.
- **Pagos y cobros que mueven una cuenta**: al crear o editar un pago, elige "Se paga desde"; al
  marcarlo pagado se descuenta de esa cuenta (y se devuelve si lo deshaces). Con los pedidos, "Cobro
  entra a" suma al saldo cuando los cobras.
- **Flujo de caja**: parte de lo que hay en tus cuentas, descuenta los pagos pendientes y los gastos
  diarios, y suma la quincena los días 15 y 30. La línea punteada muestra qué pasaría si cobras lo
  que te deben. Pasa el dedo o el puntero por el gráfico para ver cada día.
- **Lecturas de Jarvis**: reglas simples sobre tus datos (pagos vencidos, si tu dinero alcanza para
  la semana, si la caja se queda sin fondos, cobros atrasados, ritmo de ventas, día de pago…).
  Nada sale de tu aparato.

## Cómo calcula el "libre" de cada quincena

`libre = ingreso − pagos − gastos diarios`

- Se paga el 15 y el 30. La quincena del 15 va del día 15 al 29; la del 30, del 30 al 14.
- Cada pago pesa en la quincena de su fecha límite. Lo **vencido** y sin pagar pesa en la quincena
  actual. Un pago ya hecho pesa donde lo pagaste.
- "Se paga con cobros" (por ejemplo Addi) no resta de la quincena.
- Una tarjeta con "monto a pagar" vacío (mínimo por confirmar) no se descuenta hasta que lo escribas.
- Los gastos diarios se multiplican por los días de la quincena (lunes a viernes si así lo marcas;
  no cuenta festivos).
- "Por cobrar" son los pedidos en estado **Entregado**: cuando los marcas **Pagado** dejan de deber.

## Datos iniciales y privacidad

La primera vez que abres la app se cargan los datos de `js/semilla.js` (montos y nombres reales).
Si algún día publicas el repositorio, vacía ese archivo antes (haz que `semilla()` devuelva
`datosVacios()`). Si ya usabas una versión anterior, tus datos se conservan y se actualizan solos.

## Compatibilidad

Funciona sin conexión, sin librerías externas y con scripts normales (no módulos), así que abre
con doble clic. Está pensada para las versiones recientes de Chrome, Edge, Firefox y Safari
(incluidos iPhone y Android). Respeta la opción "reducir movimiento" del sistema: si la activas,
no hay animaciones.

## Archivos

```
index.html        estructura de la página
style.css         sistema visual (tema oscuro, animaciones, celular y PC)
js/iconos.js      iconos vectoriales propios
js/util.js        pesos, fechas, quincenas y piezas de HTML
js/semilla.js     datos iniciales
js/datos.js       estado, localStorage, migración de versiones, exportar / importar
js/ui.js          ventana emergente, avisos, animaciones y reloj
js/cuentas.js     cuentas, movimientos y transferencias
js/finanzas.js    quincenas, alertas, deudas, fijos, gastos diarios, por cobrar
js/pendientes.js  matriz de Eisenhower, metas y rutina
js/negocio.js     pedidos, ventas y ganancia
js/analisis.js    proyección de caja, gráfico y lecturas de Jarvis
js/tablero.js     pantalla de Inicio
js/app.js         navegación y eventos
```
