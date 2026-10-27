# Visualización COP / USD

Las operaciones, recargas, precios guardados, pedidos y descuentos de saldo siguen en COP. No se alteran las tablas ni las APIs que procesan compras.

## Uso

En el menú de usuario, seleccionar **Moneda → USD**. La preferencia se guarda en el navegador. En las pantallas administrativas se muestran siempre COP.

- Productos y totales: USD con un decimal, redondeado hacia arriba.
- Saldo e historial de billetera: USD con dos decimales, redondeado hacia abajo sobre el valor absoluto.
- El carrito muestra también el total exacto en COP que se descontará. Cada importe visual se convierte por separado; la suma de importes redondeados puede diferir del total convertido.
- Las instrucciones e importes para transferencias de recarga permanecen identificados en COP.
- Si no hay una tasa válida disponible, USD queda deshabilitado y se muestra COP. Si falla una actualización, la caché conserva la última respuesta válida.

## Tasa y programación

Fuente: [Google Finance USD/COP](https://www.google.com/finance/quote/USD-COP).

Se toma el precio principal USD/COP publicado por Google Finance. La primera consulta inicializa la tasa y las siguientes actualizaciones se realizan a partir de las 08:00 de Colombia. Se muestra la fecha y hora de consulta. Google puede cambiar su cotización durante el día; la tienda conserva la captura diaria.

[vercel.json](./vercel.json) programa `/api/cron/exchange-rate` a las `13:00 UTC` (08:00 Colombia). Requiere desplegar en Vercel y configurar `CRON_SECRET` en el entorno de producción. El secreto es el mismo mecanismo que utiliza el cron de recargas existente; no se modifica ese endpoint. La precisión de ejecución depende del plan y del servicio de cron del alojamiento.

La caché persistente de Next conserva la última consulta exitosa y revalida al recibir tráfico después del límite diario. Los navegadores abiertos consultan la tasa cada minuto y al volver a la pestaña. Esto permite recuperar la actualización si el cron se retrasa. No se modifica el precio base al actualizar la tasa.

## Verificaciones realizadas

- Ejemplos solicitados y límites exactos de redondeo.
- Más de 29.000 combinaciones de importes y tasas, comprobando que el precio USD cubra COP y el saldo visual no exceda el real.
- Respuesta real de Google Finance y rechazo de HTML sin la cotización principal.
- TypeScript y ESLint sobre los archivos de la integración.

La publicación y la ejecución del cron en producción se comprueban después del despliegue.

Google Finance se lee desde su página pública. Si cambia el formato o rechaza la consulta, se conserva la última tasa válida; sin una tasa previa disponible, se muestran COP. No se sustituye por otra fuente silenciosamente.
