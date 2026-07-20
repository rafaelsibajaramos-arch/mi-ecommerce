# Cambios de optimización para Nano

## Catálogo

- Nueva API `app/api/catalog/route.ts` con caché de servidor.
- Paginación real y filtros en servidor.
- Cálculo de stock de productos, variantes y combos dentro de la respuesta cacheada.

## Billetera y pedidos de clientes

- Nueva API resumida de billetera por período.
- Movimientos paginados; ya no se descarga todo el historial.
- Pedidos paginados y licencias consultadas solo para la página visible.

## Administración

- Pedidos paginados desde la API administrativa.
- Usuarios paginados directamente en Supabase.
- Recargas, banco, alertas y promociones con columnas explícitas y límites.
- Se eliminó `raw_body` de los listados bancarios.
- Menor frecuencia de actualización automática y suspensión en segundo plano.
- Reordenamiento de productos mediante un solo `upsert`.

## Autenticación y navegación

- `proxy.ts` no realiza consultas de red.
- Menos consultas repetidas a Auth y `profiles`.
- Branding y rol administrativo con caché local controlada.

## Base de datos

- `EJECUTAR_EN_SUPABASE.sql` agrega índices idempotentes para las consultas frecuentes.

## Validaciones realizadas

- TypeScript: aprobado.
- Compilación de producción con Next.js 16 y Webpack: aprobada usando variables de entorno de prueba.
- Las credenciales reales no forman parte del paquete.
