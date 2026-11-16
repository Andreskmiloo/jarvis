# jarvis · Ojo de Dios

Mi asistente personal para la vida. Primer módulo: **Ojo de Dios**, un lector de zonas de Bogotá en 3D con datos públicos lo más recientes posible (2026), mis lugares y mis gustos.

## Qué hace
- **Mapa 3D con relieve real** (cerros orientales incluidos) y edificios en volumen. Tema blanco y negro por defecto; botón ◐ para tema Matrix. Botón 2D/3D y giro ⟳.
- **Zona**: buscas un lugar o localidad y la cámara "cae" sobre él. Muestra localidad, UPZ, barrio, estrato vigente, valor del suelo m² y uso predominante **de 2026**, clima y aire ahora, transporte y parques a menos de 500 m, semáforos en falla y cámaras cercanas, y webcams públicas.
- **Vivo**: semáforos en falla en tiempo real (se refresca cada 60 s), siniestros de tránsito de los últimos 30 días, cámaras de tráfico y fotodetección (ubicación y estado), sismos recientes.
- **Zonas de calor en cámara lenta**: cúpulas por localidad que crecen y cambian de color hora a hora, con palpitación de radar (o manta continua). Modos: siniestros 30 días, PM2.5, lluvia prevista, radar de lluvia real. Play/pausa, línea de tiempo y velocidad ×0,5 a ×4.
- **Gustos**: busca en OpenStreetMap lo que te gusta (vóley, helado, café…) con horario y si cobra; marca "ya fui" o "quiero ir".
- **Lugares**: tus sitios guardados en el navegador; exportar/importar JSON.
- **Capas**: datos oficiales de Catastro/IDECA (TransMilenio, SITP, Metro, parques IDRD, cultura, coropletas de estrato y valor del suelo…).

## Correrlo
```bash
npm install
npm run dev
```
Tests: `npm test` · Build: `npm run build`.

### Webcams en vivo (opcional)
Las cámaras del Distrito (C4, tráfico, fotodetección) **no transmiten al público**. Para ver webcams públicas dentro del mapa, saca una clave gratuita en https://api.windy.com/keys y créala en `.env`:
```bash
cp .env.example .env
```
y llena `VITE_WINDY_KEY`. Sin clave, la ficha de zona enlaza al mapa de webcams de Windy centrado en el punto.

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

## Datos personales
- `data/perfil-gustos.json`: perfil de gustos (lo llena la sesión de gustos, rama `claude/perfil-gustos`). Si existe, el mapa lo usa.
- `data/mis-lugares.json`: lugares iniciales opcionales; **ignorado por git** para no publicar tu rutina.

## Límites conocidos
- Sin video público de cámaras de Bogotá.
- La malla de aire es de ~11 km: tendencia de ciudad, no calle por calle.
- Estrato: la estratificación vigente es la del decreto de 2018; no existe una más nueva.
