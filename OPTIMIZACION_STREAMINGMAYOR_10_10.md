# Optimización StreamingMayor — 12 de agosto de 2026

Objetivo de esta versión: reducir al máximo el consumo innecesario de Vercel y Supabase sin modificar el diseño visual, sin ralentizar las recargas automáticas y manteniendo el stock actualizado en tiempo real.

## Cambios principales

### Recargas automáticas

- La pantalla de resultado comprueba una recarga pendiente cada 5 segundos mientras la pestaña está visible.
- No se solapan comprobaciones de la misma recarga.
- Al ocultar la pestaña se detienen las comprobaciones y al volver se valida de inmediato.
- La API de estado reutiliza la recarga ya consultada al intentar la acreditación automática.
- La validación del JWT usa `getClaims()`: con claves asimétricas Supabase puede verificar localmente y reutilizar el JWKS en invocaciones calientes; con firma simétrica conserva automáticamente la validación segura remota.
- El cliente administrativo de Supabase se reutiliza dentro de una invocación caliente de Vercel en vez de reconstruirse en cada llamada.
- El cruce bancario trae únicamente las columnas necesarias.
- El cron continúa cada minuto (`*/1 * * * *`) para no sacrificar rapidez.

### Reconciliación bancaria

- La reconciliación de pagos no usados se hace por lotes: carga pagos pendientes, agrupa los montos y obtiene las recargas candidatas en una consulta en vez de lanzar una consulta por cada pago.
- La reparación de cruces incompletos ya no revisa pagos históricos terminados; solo considera reservas sin finalizar y antiguas.
- Se mantiene el mecanismo de reserva/confirmación para evitar que dos recargas reclamen el mismo pago.

### Catálogo y stock

- El catálogo se carga una vez y búsqueda, categorías y paginación trabajan en memoria.
- Se añadieron suscripciones Realtime para `products`, `product_variants` y `product_components`.
- Un cambio normal de stock/precio actualiza directamente el producto o variante afectada en memoria, sin volver a descargar todo el catálogo.
- Si un cambio puede afectar un combo o la estructura del catálogo, se hace una resincronización silenciosa completa.
- Después del checkout queda una resincronización de respaldo; si Realtime ya actualizó el stock, esa consulta se cancela automáticamente.
- Cuando la pestaña está oculta no se realizan resincronizaciones de catálogo; si quedó un cambio pendiente se procesa al volver.

### Consultas y polling no crítico

- Eliminado el polling periódico de promociones de recargas.
- Eliminado el polling periódico de alertas del sidebar administrativo; conserva carga inicial y actualización por eventos/foco.
- Eliminadas consultas duplicadas de perfil/rol entre `AuthGuard`, `Navbar`, portada y `UserDropdown`.
- `Navbar` reutiliza la caché de perfil/rol generada por `UserDropdown`.
- Eliminadas consultas `select("*")` en `app`, `components` y `lib`; se solicitan columnas explícitas.
- Eliminado código muerto de promociones dentro del módulo administrativo de recargas.
- Las estrellas decorativas pausan sus temporizadores cuando la pestaña está oculta.

### Vercel

- La configuración del cron quedó correctamente nombrada como `vercel.json` (antes estaba como `vercel.json.txt`).
- El cron bancario conserva frecuencia de un minuto.

## Paso necesario en Supabase

Aplicar la migración:

`supabase/migrations/20260812074200_catalog_stock_realtime.sql`

También se incluye `APLICAR_REALTIME_STOCK.sql` en la raíz para poder copiarlo directamente en el SQL Editor de Supabase.

La migración es idempotente y agrega a la publicación `supabase_realtime` las tablas:

- `public.products`
- `public.product_variants`
- `public.product_components`

## Validación

- `tsc --noEmit`: correcto, 0 errores.
- ESLint de los archivos optimizados: 0 errores. Permanecen únicamente avisos existentes por etiquetas `<img>` y dos dependencias de hooks en la edición administrativa de productos.
- Se conservaron las etiquetas `<img>` para no introducir cambios de renderizado o dimensiones visuales.
- `next build` no pudo terminar en este entorno porque Next intentó descargar `@next/swc-linux-x64-gnu` y el entorno no tiene acceso a Internet. La comprobación de TypeScript sí completó correctamente.

## Archivos deliberadamente excluidos del ZIP de entrega

Por seguridad y peso no se incluyen `node_modules`, `.next`, `.git`, archivos `.env` con credenciales, logs locales, locks del worker ni `tsconfig.tsbuildinfo`. Se conserva `.env.example` y `package-lock.json`. Vercel instalará las dependencias desde `package-lock.json` y debe usar las variables configuradas en el proyecto de Vercel/Supabase.
