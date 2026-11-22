---
name: deseos
description: Administra la lista de deseos de productos vigilados (agregar, quitar, listar, cambiar precio objetivo). Uso: /deseos agregar <producto> [precio objetivo] | /deseos quitar <producto> | /deseos listar
---

# /deseos

Archivo: `ofertas/lista-deseos.yaml` (lista `productos` con `nombre`, `categoria`, `objetivo_cop`, `agregado`).

- **agregar**: añade el producto. Clasifica la categoría según `ofertas/tiendas.yaml`. Si el usuario no da
  precio objetivo, pregunta o propone uno (10–15% bajo el mejor precio actual). Interpreta "1.2 millones",
  "1'200.000", "1200k" como 1200000. Luego corre `/ofertas` para ese producto y registra el mejor precio en
  `ofertas/historial.json` (ver formato en `/revisar-deseos`).
- **quitar**: elimínalo de la lista (conserva su historial).
- **listar**: muestra la lista con último precio y objetivo leyendo `ofertas/historial.json`.

Después de cualquier cambio: `node ofertas/pagina.js --deseos`, publica `ofertas/resultados/lista-deseos.html`
como Artifact (icono `list`; misma ruta para que conserve el enlace), y haz commit de `ofertas/lista-deseos.yaml`
y `ofertas/historial.json` con un mensaje corto en español, y push a la rama actual.
