# jarvis · Ojo de Dios

Mi asistente personal para la vida. Primer módulo: **Ojo de Dios**, un lector de zonas de Bogotá en 3D con datos públicos lo más recientes posible (2026), mis lugares y mis gustos.

## Qué hace
- **Acceso y Tierra 3D**: al abrir ves la Tierra como esfera (imagen satelital Sentinel-2 2024 y atmósfera) girando detrás del login; al entrar, la cámara vuela del espacio a Bogotá como en Google Earth. El botón 🌍 te lleva de nuevo a la Tierra completa y otra vez a Bogotá. ⏻ cierra sesión.
- **Mapa 3D con relieve real** (cerros orientales incluidos) y edificios en volumen. Tema blanco y negro por defecto; botón ◐ para tema Matrix. Botón 2D/3D y giro ⟳.
- **Mi casa** (botón ⌂): la marcas con tu ubicación o tocando el mapa. Se guarda solo en tu navegador; cada ficha dice a cuántos km estás de casa y tus lugares se ordenan por distancia.
- **Vista desde el satélite** (botón 🛰): Sentinel-2 de 2026 (10 m), MODIS del día (NASA), nubes en vivo de GOES-East cada 10 min (NASA/NOAA) y detalle de Esri (enero 2024, rotulado).
- **Zona**: buscas un lugar o localidad y la cámara "cae" sobre él. Muestra localidad, UPZ, barrio, estrato vigente, valor del suelo m² y uso predominante **de 2026**, clima y aire ahora, transporte y parques a menos de 500 m, semáforos en falla y cámaras cercanas, y webcams públicas.
- **Ciudad en capas 3D** (pestaña Capas): Bogotá como una pila de láminas flotando sobre el relieve real; cada lámina es una capa de datos de toda la ciudad (estrato, uso y valor del suelo 2026, densidad de población, árboles, comparendos, TransMilenio, Metro, ciclovía, UPZ, localidades) y se ondula con los cerros y valles. Prendes o apagas láminas, ajustas separación y relieve, las juntas o separas con animación, y con ⤓ bajas una al suelo. "Modelo de ciudad" cambia lo de abajo: Mapa, Satélite 2026, Relieve o Edificios 3D.
- **Controles de vidrio**: panel, botones y menús semitransparentes con desenfoque y animaciones suaves.
- **Pines con figura**: cada punto es un alfiler parado sobre el mapa con el icono de lo que es: 📷 cámara, 🎥 webcam en vivo, 📸 fotomulta, 🚦 semáforo en falla, 🛍 centro comercial, 🚌 TransMilenio, 🚇 Metro, 🌳 parque, ⚽ cancha, 🏐 vóley, 🏀 baloncesto, 🍦 heladería, ☕ café, 🏛 museo, 🎭 teatro, 🎬 cine, ⭐/✅ tus lugares. Se apagan en Capas.
- **Centros comerciales** encendidos desde el inicio: los 257 del nomenclátor oficial de Bogotá más los de OpenStreetMap, guardados con la página.
- **Aviones en vivo**: posición ADS-B real (OpenSky Network) cada 15 s, dibujados en 3D sobre la sabana y animados entre lecturas. Necesitan el puente gratis (abajo).
- **Vivo**: semáforos en falla en tiempo real (se refresca cada 60 s), siniestros de tránsito de los últimos 30 días, cámaras de tráfico y fotodetección (ubicación y estado), sismos recientes.
- **Zonas de calor en cámara lenta**: cúpulas por localidad que crecen y cambian de color hora a hora, con palpitación de radar (o manta continua). Modos: siniestros 30 días, PM2.5, lluvia prevista, radar de lluvia real. Play/pausa, línea de tiempo y velocidad ×0,5 a ×4.
- **Gustos**: lo que te gusta (vóley, fútbol, helado, café…) sale al instante de los **lugares guardados** con la página (`public/data/lugares/`, con horario y si cobra cuando OpenStreetMap lo tiene); "Buscar en vivo" consulta Overpass y, si no responde, Photon. Marca "ya fui" o "quiero ir".
- **Lugares**: tus sitios guardados en el navegador; exportar/importar JSON.
- **Capas**: datos oficiales de Catastro/IDECA (TransMilenio, SITP, Metro, parques IDRD, cultura, coropletas de estrato y valor del suelo…).

## Correrlo
```bash
npm install
npm run dev
```
Tests: `npm test` · Build: `npm run build`.

## Lugares guardados
`node scripts/guardar-lugares.mjs` descarga de OpenStreetMap (Overpass) los lugares de cada gusto de `src/intereses/catalogo.json` y los guarda en `public/data/lugares/<gusto>.json`; los centros comerciales se completan con el nomenclátor oficial. Vóley, fútbol y baloncesto salen de las canchas con su etiqueta de deporte. El workflow lo corre en cada publicación y cada lunes; si Overpass falla se conserva la copia anterior. `--solo=voley,helado` refresca solo algunos; `--conservar` no repite los que ya están.

## Acceso (usuario y contraseña)
La pantalla de acceso es un **candado de cortesía**: la página es estática y pública, así que no protege datos de verdad (tus lugares y tu casa siguen solo en tu navegador). En el código no está la contraseña, solo su huella SHA-256. Para cambiarla:
```bash
printf 'ojo-de-dios:NUEVA_CONTRASEÑA' | sha256sum
```
y pega el resultado en `HUELLA` de `src/acceso.ts` (usuarios en `USUARIOS`).

## Rendimiento
- Desde el espacio no hay relieve (no se nota y cuesta mucho); se enciende al llegar a escala de ciudad.
- Las animaciones (cúpulas, pulso de semáforos, aviones) se pausan mientras mueves el mapa y solo corren si hay algo en la vista.
- Los pines son una capa de símbolos: no se recalculan al hacer zoom.
- Una sola fuente de relieve para terreno y sombras; en celular, menos resolución de pantalla y edificios 3D desde más cerca.

## Publicación (GitHub Pages)
El workflow `.github/workflows/pages.yml` prueba, construye y publica en cada push a `main` o a `claude/bogota-heat-map-5w1g6k`. Pasos únicos en GitHub (requieren ser dueño del repo):
1. Settings → General → Danger Zone → Change visibility → **Public** (Pages gratis solo en repos públicos).
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Settings → Environments → **github-pages** → Deployment branches: agrega `claude/bogota-heat-map-5w1g6k` (o fusiona a `main`).
4. Actions → "Publicar Ojo de Dios" → Re-run. Queda en https://andreskmiloo.github.io/jarvis/

Nada personal se publica: casa, lugares, cámaras propias y gustos viven en tu navegador o en archivos ignorados por git.

## Aviones en vivo: activar el puente (5 minutos, gratis)
OpenSky Network tiene los aviones sobre Bogotá en tiempo real, pero no deja leer sus datos desde otras páginas (CORS). Un Cloudflare Worker hace de puente:
1. Crea una cuenta gratis en https://dash.cloudflare.com.
2. **Workers & Pages → Create → Create Worker** (plantilla "Hello World") → **Deploy**.
3. **Edit code**: borra todo, pega [`workers/aviones-proxy.js`](workers/aviones-proxy.js) → **Deploy**. Copia la URL (`https://algo.tu-usuario.workers.dev`).
4. En GitHub: Settings → Secrets and variables → Actions → pestaña **Variables** → New repository variable → `VITE_AVIONES_URL` = esa URL.
5. Actions → "Publicar Ojo de Dios" → Run workflow.

El puente solo consulta la caja de Bogotá y guarda cada lectura 10 s para todos los visitantes. Opcional: con una cuenta de OpenSky, agrega en el Worker las variables `OPENSKY_USER` y `OPENSKY_PASS` para tener más consultas al día.

## Cámaras dentro del mapa
En el mapa aparecen, con su pin 3D y color, **todas las cámaras con ubicación pública** (pestaña Vivo → Cámaras):
| Tipo | Cantidad | Fuente | ¿Video? |
|---|---|---|---|
| Webcam pública Teusaquillo (mira al sur, cerros y centro) | 1 | Windy | **Sí, en vivo** al tocarla |
| Tráfico · Centro de Gestión de Tránsito | 110 | Secretaría de Movilidad | No público |
| Fotodetección | 128 | SIMUR | No público |
| Videodetectores de semáforos (apagados por defecto) | 1.784 | SIMUR (solo ubicación) | No público |
| Vigilancia mapeada por la comunidad | varía | OpenStreetMap | No |

**Tráfico en vivo**: botón Waze en cada ficha de zona y en la pestaña Vivo (mapa en vivo de Waze con accidentes y trancones).

Las cámaras del Distrito (C4, Centro de Gestión de Tránsito, fotodetección) **no transmiten al público**. Otras formas de tener video dentro:
1. **Mis cámaras** (pestaña Vivo): pega un live de YouTube, un enlace HLS `.m3u8` o una imagen que se refresca, y ubícala en el mapa. Se reproduce en un visor flotante. Cámaras IP caseras que solo dan RTSP necesitan un puente: [go2rtc](https://github.com/AlexxIT/go2rtc) en tu red (expone HLS) o transmitir a YouTube Live.
2. **Webcams públicas de Windy** (ver abajo).
3. **Acceso oficial**: modelo de derecho de petición en [`docs/derecho-de-peticion-camaras.md`](docs/derecho-de-peticion-camaras.md).

### Webcams en vivo (opcional)
Las cámaras del Distrito (C4, tráfico, fotodetección) **no transmiten al público**. Para ver webcams públicas dentro del mapa, saca una clave gratuita en https://api.windy.com/keys y créala en `.env`:
```bash
cp .env.example .env
```
y llena `VITE_WINDY_KEY`. Para la página publicada, ponla como secreto del repo (Settings → Secrets and variables → Actions → `VITE_WINDY_KEY`). Sin clave, la ficha de zona enlaza al mapa de webcams de Windy centrado en el punto.

## Fuentes y frescura
| Fuente | Datos | Actualización |
|---|---|---|
| Secretaría de Movilidad (ArcGIS) | Estado de 1.747 semáforos | Tiempo real |
| SIMUR · Centro de Gestión de Tránsito | Siniestros | Últimos 30 días |
| Catastro Bogotá / IDECA | Localidad, UPZ, barrio, valor del suelo y uso (filtrados a 2026), estrato vigente, equipamientos | Anual / vigente |
| Open-Meteo | Clima, aire (CAMS), lluvia | Horario + pronóstico |
| RainViewer | Radar de lluvia | Cada 10 min |
| USGS | Sismos | Minutos |
| OpenFreeMap / OpenStreetMap | Mapa vectorial, gustos, búsqueda | Continuo |
| AWS Terrain Tiles | Relieve | Fijo |
| Sentinel-2 (ESA) · Microsoft Planetary Computer | Imagen satelital 10 m | Escenas de 2026 (cada ~5 días; se usa la más reciente con ≤25 % nubes) |
| NASA GIBS · MODIS Terra | Color real del día | Diario |
| NASA GIBS · GOES-East GeoColor | Nubes y luces nocturnas | Cada 10 min |
| OpenSky Network (vía puente) | Aviones ADS-B | Cada 10–15 s |
| Windy Webcams | Webcam Teusaquillo | Imagen cada ~10 min, reproductor 24 h |
| Waze Live Map | Tráfico y reportes | Tiempo real |
| Esri World Imagery | Detalle 31 cm | Enero 2024 (opcional) |

## Datos personales
- `data/perfil-gustos.json`: perfil de gustos (lo llena la sesión de gustos, rama `claude/perfil-gustos`). Si existe, el mapa lo usa.
- `data/mis-lugares.json`: lugares iniciales opcionales; **ignorado por git** para no publicar tu rutina.

## Límites conocidos
- Sin video público de cámaras de Bogotá.
- La malla de aire es de ~11 km: tendencia de ciudad, no calle por calle.
- Estrato: la estratificación vigente es la del decreto de 2018; no existe una más nueva.
