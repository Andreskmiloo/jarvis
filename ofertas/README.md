# Cazador de ofertas

Busca el precio final más bajo de cualquier producto en tiendas de Colombia/Bogotá, tiendas
internacionales y mercados chinos confiables, con cupones y promociones bancarias, y publica una
página con la comparación.

## Comandos (en Claude Code dentro de este repo)

| Comando | Qué hace |
|---|---|
| `/ofertas tenis Nike Air Force 1` | Busca en todas las tiendas de la categoría y publica la página de resultados |
| `/deseos agregar patineta Xiaomi 4 Lite 1000000` | Vigila un producto con precio objetivo |
| `/deseos listar` / `/deseos quitar <producto>` | Ver o quitar productos vigilados |
| `/revisar-deseos` | Revisa precios de la lista y avisa si bajaron (lo corre la tarea diaria) |

## Cómo busca

1. **Directo (`ofertas/buscar.js`)**, rápido y exacto:
   - API pública VTEX: Nike Colombia, Arturo Calle, Studio F, Vélez, Offcorss, Olímpica, Jumbo, Pepe Ganga, Panamericana
   - Navegador headless: Falabella, Amazon, AliExpress
   - Mercado Libre (y TuCarro) con API oficial si defines `ML_ACCESS_TOKEN`
   - TRM oficial del día (Superfinanciera / datos.gov.co)
2. **Búsqueda web** para el resto de `ofertas/tiendas.yaml`: Alkosto, Ktronix, Éxito, Shein, Temu,
   Farfetch, eBay, Decathlon, tiendas de bicis y patinetas, TuCarro, CarroYa, Kavak, Facebook Marketplace, etc.
3. **Cupones**: Cuponation, Picodi, cuponeras oficiales, promos bancarias y eventos (Black Friday, Día sin IVA…).
4. Calcula **precio final** = precio + envío + impuestos de importación estimados − cupón, y marca alertas
   (precios sospechosos, vendedores sin reputación, usados).

Categorías: tecnología, ropa y calzado, deportes, movilidad (bicis, patinetas y motos eléctricas),
vehículos, hogar, belleza y salud, mercado, mercados chinos confiables.

Uso directo del buscador:

```bash
node ofertas/buscar.js "patineta electrica xiaomi" --categoria movilidad --max 6
```

## Agregar tiendas

Edita `ofertas/tiendas.yaml` y agrega una línea en la categoría. Si la tienda usa VTEX
(prueba `https://<dominio>/api/catalog_system/pub/products/search/?ft=prueba`), agrégala también a la
lista `VTEX` de `ofertas/buscar.js` para consultarla directo.

## Conectar Mercado Libre (recomendado)

La API de Mercado Libre exige token. Para activarla:
1. Crea una aplicación gratis en https://developers.mercadolibre.com.co (Mis aplicaciones → Crear).
2. Obtén un access token (OAuth) y guárdalo como variable de entorno `ML_ACCESS_TOKEN` en el entorno
   de Claude Code (nunca en el repo).

## Archivos

- `ofertas/tiendas.yaml`: catálogo de tiendas por categoría
- `ofertas/buscar.js`: buscador directo (una consulta)
- `ofertas/barrido.js`: varias consultas en paralelo, caché de 6 horas y fichas técnicas
- `ofertas/buscador.html`: la página del buscador (se publica como Artifact en claude.ai)
- `ofertas/pagina.js`: genera la página de cada búsqueda (mismo diseño de vitrina) y el JSON para la base de datos del buscador
- `ofertas/resultados/`: búsquedas guardadas
- `ofertas/lista-deseos.yaml`, `ofertas/historial.json`: productos vigilados e historial de precios
- `.claude/agents/cazador-ofertas.md`: instrucciones del agente
- `.claude/skills/*`: comandos `/ofertas`, `/deseos`, `/revisar-deseos`
