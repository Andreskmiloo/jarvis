# AGENTS.md — guía para agentes de código (Codex, Claude, etc.)

Repositorio personal en español con **dos apps independientes**. Todo el texto visible para el usuario va
en español de Colombia. Lee la sección de la app que vas a tocar antes de cambiar algo.

| App | Dónde vive | Qué es |
|---|---|---|
| **Jarvis** | raíz: `index.html`, `style.css`, `js/*.js` | Centro de control personal (finanzas, cuentas, pendientes, negocio). App web estática. |
| **Cazador de ofertas** | `ofertas/`, `.claude/` | Agente que busca el precio más bajo de un producto en tiendas de Colombia e internacionales y lo muestra en una página tipo vitrina. |

Las dos apps no comparten código ni estilos. No mezcles sus sistemas visuales sin que el dueño lo decida.

---

## 1. Jarvis (raíz)

Detalles de funcionamiento en `README.md`. Reglas que no se pueden romper:

- **Sin dependencias ni paso de compilación**: scripts normales (no módulos ES), sin librerías externas.
  Debe abrir con doble clic en `index.html` y funcionar sin conexión.
- **Datos solo en el navegador** (`localStorage`), con exportar/importar respaldo en JSON. Conserva la
  migración de versiones de `js/datos.js`: nunca rompas datos guardados de versiones anteriores.
- Respeta `prefers-reduced-motion` (sin animaciones si el sistema lo pide). Funciona en celular y PC.
- Sistema visual: tablero oscuro con acentos dorados (`style.css`). El orden de carga de `js/` importa
  (ver la lista de archivos en `README.md`).
- Probar: abrir `index.html` en un navegador (o Playwright con `file://`) a 400 px y 1280 px; revisar la
  consola sin errores; exportar e importar un respaldo.

---

## 2. Cazador de ofertas (`ofertas/` y `.claude/`)

### Cómo fluye
```
ofertas/buscar.js     una consulta → tiendas VTEX (Nike CO, Olímpica, Jumbo, Arturo Calle…), Falabella
                      (lee __NEXT_DATA__), Amazon y AliExpress con Playwright, Mercado Libre solo con
                      ML_ACCESS_TOKEN, TRM oficial (datos.gov.co). Imprime JSON.
ofertas/barrido.js    varias consultas de buscar.js en paralelo + caché de 6 h (ofertas/.cache, ignorada
                      por git) + lectura de fichas técnicas de los mejores candidatos.
.claude/agents/cazador-ofertas.md
                      instrucciones del agente: barrido + búsqueda web + cupones → arma el REPORTE JSON
                      (gamas, puntaje calidad-precio, top 3, la más barata) en ofertas/resultados/.
ofertas/pagina.js     reporte.json → página HTML estática con la vitrina (sin flags)
                      reporte.json --solo-json salida.json → versión para la base de datos (≤30 ofertas,
                      fotos pequeñas incrustadas, <250 KB).
                      --deseos → página de la lista de deseos.
ofertas/buscador.html la app del buscador. Se publica como Artifact en claude.ai (privado del dueño).
ofertas/tiendas.yaml  catálogo de tiendas por categoría y sección `como_buscar` (qué vía usar en cada tienda).
.claude/skills/       comandos /ofertas, /deseos, /revisar-deseos para Claude Code.
```
Desde la página, el botón **Buscar** guarda la búsqueda en la base de datos del Artifact y dispara una
tarea programada en claude.ai (`fire_trigger` del conector "Claude Code Remote"). Esa tarea abre una sesión
de Claude que ejecuta el agente y escribe el resultado en la base de datos; la página lo muestra en vivo.

### Esquema del reporte (`ofertas/resultados/*.json`)
- Raíz: `consulta`, `categoria`, `fecha` (ISO), `trm {valor, vigencia}`, `requisito`, `top3[] {url, etiqueta,
  por_que}`, `gamas {economica, media, alta, premium}` (texto), `recomendacion {url, texto}`, `resultados[]`,
  `cupones[] {tienda, codigo, descripcion, vigencia, url}`, `descartados[]`, `consejos[]`, `no_cubiertas[]`.
- `resultados[]`: `tienda`, `origen` (`nacional|internacional|local`), `producto`, `modelo`, `marca`,
  `spec_clave`, `gama` (`economica|media|alta|premium`), `puntaje_cp` (0–100), `precio_cop`,
  `precio_antes_cop`, `precio_final_estimado_cop`, `impuestos_estimados_cop`, `envio_cop`, `envio_gratis`,
  `cupon`, `descuento_pct`, `condicion` (`nuevo|usado`), `garantia_local`, `entrega`, `calificacion`,
  `vendidos`, `vendedor`, `url`, `imagen`, `fuente` (`directa|web`), `alertas[]`, `tambien_en[] {tienda,
  precio_cop, url}`. Campos opcionales: la vitrina debe tolerar que falten (calcula `gama` por cuartiles y
  `puntaje_cp` si no vienen).

### Base de datos del Artifact (no está en el repo; solo como referencia)
- `busquedas/<id>`: `{consulta, categoria, estado: pendiente|buscando|listo|error, fase, error, creado,
  terminado, deseo_id, reporte}` (el `reporte` es la salida de `pagina.js --solo-json`).
- `perfil/yo`: `{deseos[], metas[], logros[]}` — lo edita el usuario en la página.
- `perfil/aprendido`: `{marcas, tallas, presupuesto, tiendas, intereses, evitar, sugerencias[], descartados}`.
- `config/app`: `{trigger_id}`.
- Cada documento ≤ 256 KB. Solo lectura y escritura del dueño.

### Reglas de `ofertas/buscador.html` (se rompe en claude.ai si no se cumplen)
- **Un solo archivo**, sin `<!doctype>`, `<html>`, `<head>` ni `<body>` (el visor los agrega). Empieza con
  `<title>`, la meta `claude:viewport-fit-sides`, las fuentes y un único `<style>`.
- **CSP**: scripts externos solo de cdnjs.cloudflare.com, cdn.jsdelivr.net/npm o unpkg.com con versión exacta;
  hojas de estilo solo de Google Fonts; **imágenes solo `data:`** (por eso `safeImg()` y las fotos incrustadas);
  sin `fetch` a otros sitios, sin iframes, sin `alert/confirm/prompt`, sin `window.print`.
- `window.claude.use('db')` y `use('mcp')` pueden devolver `null` (fuera de claude.ai, o sin permiso):
  la página debe funcionar y explicar qué falta. Maneja los códigos de error de `callTool` por separado.
- Colores solo como tokens en `:root`, redefinidos para oscuro en `@media (prefers-color-scheme: dark)` con
  `:root:not([data-theme="light"])` y otra vez en `:root[data-theme="dark"]`; `body` con fondo explícito.
- Responsive: debe verse bien a 400 px sin scroll horizontal; margen lateral con
  `padding-left/right: max(16px, env(safe-area-inset-*))`; tablas y carriles con su propio `overflow-x`.
- `localStorage` siempre dentro de `try/catch` (solo para preferencias de vista).
- **`<script id="vitrina">` debe seguir autocontenido** (expone `window.Vitrina`) y el CSS debe estar en **un
  solo `<style>`**: `pagina.js` los copia por expresión regular para generar las páginas estáticas.
- Respeta `prefers-reduced-motion` y da foco visible a todo lo que se puede tocar.

### Cómo probar sin claude.ai
```bash
node --check ofertas/buscar.js ofertas/barrido.js ofertas/pagina.js
node ofertas/pagina.js ofertas/resultados/2026-11-16-patineta-500wh.json   # crea el .html al lado
```
La página generada usa la misma vitrina que `buscador.html` y abre sin `window.claude`: ábrela con Playwright
(Chromium ya instalado; `require('playwright')`) a 400 px y 1200 px, en `colorScheme: 'light'` y `'dark'`, y
revisa que `document.documentElement.scrollWidth` no supere el ancho. Para `buscador.html` completo, envuélvelo
en `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>…</body></html>`
e inyecta un `window.claude` falso con `addInitScript` (un `db` simulado con `collection().orderBy().limit().onSnapshot()`
y `doc().onSnapshot()`). Búsqueda real rápida: `node ofertas/buscar.js "audifonos sony" --max 4`.
Los `.html` de `ofertas/resultados/` están en `.gitignore`; no los subas.

### Lo que un agente de código NO puede hacer aquí
Publicar o republicar el Artifact, leer o escribir su base de datos, ni disparar la tarea programada: eso
solo funciona desde una sesión de Claude del dueño. Después de cambiar `ofertas/buscador.html`, avisa en el PR
que hay que pedirle a Claude que lo republique.

### Convenciones
- Pesos colombianos con `toLocaleString('es-CO')`; fechas en zona `America/Bogota`.
- Tipografía Space Grotesk (títulos y precios) + Inter (texto); acento verde, etiqueta de precio amarilla,
  insignias "Mejor calidad-precio" (verde) y "La más barata" (amarilla). Sin emojis como marcadores de sección.
- Nunca inventes precios, cupones ni enlaces en datos de ejemplo presentados como reales.
- No guardes tokens ni claves en el repo (Mercado Libre usa la variable `ML_ACCESS_TOKEN`).

### Problemas conocidos (buen punto de partida para auditar)
1. **Código muerto** en `ofertas/pagina.js`: `fila()` y `reporte()` (tabla vieja) ya no se usan; solo
   `deseos()`, `spark()` y la constante `CSS` sirven a la página de lista de deseos, que aún usa el diseño viejo.
2. **La lógica de gamas, `puntaje_cp`, `top3` y "una tarjeta por modelo"** se armó con scripts sueltos fuera
   del repo. Conviene un `ofertas/armar.js` reutilizable y una fórmula única y documentada de `puntaje_cp`.
3. **AliExpress**: el precio del listado es el "desde" de la variante más pequeña; las páginas de producto
   salen en blanco con navegador headless; algunas fotos fallan al redimensionarlas (quedan iniciales).
4. **Fuentes bloqueadas**: Mercado Libre (requiere token o búsqueda web), Alkosto/Ktronix (buscador),
   Éxito (API VTEX 403), Shein/Temu, Facebook Marketplace. Ver `como_buscar` en `tiendas.yaml`.
5. **Unidades**: consultas como "800wh" se han interpretado como 800 W; falta normalizar Wh/W/GB/MHz.
6. **Sin pruebas automáticas**: candidatos claros son `prep()` de la vitrina (gamas por cuartiles,
   puntaje), `estimarImpuestos()` y los extractores de `buscar.js` con HTML/JSON de muestra.
7. **Accesibilidad**: revisar contraste de chips e insignias en ambos temas, foco en tarjetas y carriles con
   scroll horizontal, etiquetas ARIA de los carriles por gama.
8. **Fotos en base64** dentro de los documentos de la base de datos (funciona, pero pesa).
