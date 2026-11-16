---
name: ofertas
description: Busca las mejores ofertas y cupones de un producto en todas las tiendas (Colombia, internacionales, mercados chinos confiables, Marketplace Bogotá) y publica una página con la comparación. Uso: /ofertas <producto>
---

# /ofertas <producto>

1. Lanza el subagente `cazador-ofertas` con el producto que pidió el usuario (`$ARGUMENTS`). Si el
   usuario pide varios productos, lanza un subagente por producto en paralelo.
2. Cuando termine, toma el `.html` que generó en `ofertas/resultados/` y publícalo con la herramienta
   Artifact (icono `tag`, descripción de una frase con el producto y la mejor tienda). Si ya existe un
   artifact para ese mismo producto en esta sesión, republícalo en la misma ruta.
3. Responde al usuario con la mejor oferta, el top 3, cupones aplicables y el enlace a la página.
4. Pregunta en una línea si quiere agregarlo a su lista de deseos con un precio objetivo (`/deseos`).
