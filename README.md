# Jarvis

Mi asistente personal: una app web sencilla, en español, sin servidor. Guarda todo en el navegador
(`localStorage`) y se respalda con un archivo JSON.

## Qué tiene

- **Tablero**: lo que vence esta semana (con botón ✓ para marcarlo ahí mismo), cuánto me queda libre
  en cada quincena, quién me debe y el progreso de mis metas.
- **Finanzas**: ingresos por quincena, deudas, fijos, gastos diarios, por cobrar y alertas de los
  próximos 7 días.
- **Pendientes y metas**: matriz de Eisenhower (urgente / importante) y metas con barra de progreso.
- **Presencia Parfums**: pedidos (cliente, perfume, precio, costo, ganancia, estado) y avance hacia
  la meta de $10.000.000.

## Cómo usarla

Abre `index.html` con doble clic. No hay que instalar nada.

Los datos se guardan **solo en ese navegador y en ese aparato**. Para pasarlos al celular (o a otro
computador) usa **Tablero → Exportar respaldo** y luego **Importar respaldo** en el otro lado.
Exporta de vez en cuando: si borras los datos del navegador, se pierden.

Para usarla en el celular, publica estos archivos en cualquier hosting de páginas estáticas
(Netlify, Cloudflare Pages, GitHub Pages…); sigue siendo "sin servidor".

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
`datosVacios()`).

## Archivos

```
index.html        estructura de la página
style.css         tema oscuro y diseño para celular y PC
js/util.js        pesos, fechas, quincenas y piezas de HTML
js/semilla.js     datos iniciales
js/datos.js       estado, localStorage, exportar / importar
js/finanzas.js    quincenas, alertas, deudas, fijos, gastos diarios, por cobrar
js/pendientes.js  matriz de Eisenhower y metas
js/parfums.js     pedidos y ganancia
js/tablero.js     página principal
js/app.js         navegación y eventos
```

Son scripts normales (no módulos) para que funcione abriendo el archivo directamente.
