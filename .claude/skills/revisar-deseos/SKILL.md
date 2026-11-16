---
name: revisar-deseos
description: Revisa todos los productos de la lista de deseos, actualiza su historial de precios y avisa si alguno bajó de precio o llegó al objetivo. Lo ejecuta la tarea programada diaria.
---

# /revisar-deseos

1. Lee `ofertas/lista-deseos.yaml`. Si está vacía, dilo y termina.
2. Para cada producto (en paralelo, un subagente `cazador-ofertas` por producto, máximo 5 a la vez) busca
   el mejor precio final. Para la revisión diaria basta con: `node ofertas/buscar.js` + búsqueda web en Mercado
   Libre, Alkosto/Éxito y la tienda donde estuvo el mejor precio la última vez. Cupones solo si el precio bajó.
3. Agrega una entrada a `ofertas/historial.json`:
   ```json
   {"actualizado": "<ISO>", "productos": {"<nombre>": {"objetivo_cop": 0, "historial": [
     {"fecha": "<ISO>", "precio_cop": 0, "tienda": "", "url": ""}]}}}
   ```
   (`precio_cop` = mejor precio final estimado). Mantén como máximo 180 entradas por producto.
4. Detecta alertas: precio ≤ objetivo, o bajó ≥5% frente a la revisión anterior, o es el mínimo histórico.
5. `node ofertas/pagina.js --deseos` y republica `ofertas/resultados/lista-deseos.html` como Artifact
   (misma ruta/URL).
6. Commit de `ofertas/historial.json` y push.
7. Resume: productos con alerta primero (producto, precio, tienda, enlace, cuánto bajó), luego el resto en
   una línea cada uno. Si hay alertas, el resumen debe empezar con "🔔 Bajó de precio:" para que la
   notificación sea clara.
