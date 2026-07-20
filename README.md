# StreamingMayor optimizado para Supabase Nano / Free

Proyecto completo optimizado a partir de la versión entregada el 20 de julio de 2026.
Mantiene catálogo, combos, licencias, pedidos, billetera, recargas automáticas,
promociones y administración.

## Instalación completa

1. Haz una copia de seguridad del proyecto actual.
2. Reemplaza el proyecto completo por esta carpeta.
3. Copia manualmente tus variables actuales a un archivo `.env.local` usando `.env.example` como guía.
4. No copies archivos antiguos llamados `datos`, `.next`, `node_modules` ni credenciales dentro del código.
5. En el Supabase correcto, abre SQL Editor y ejecuta una sola vez:

   `EJECUTAR_EN_SUPABASE.sql`

6. Instala dependencias:

   ```bash
   npm install
   ```

7. Valida el proyecto:

   ```bash
   npm run build
   ```

8. Inicia localmente:

   ```bash
   npm run dev
   ```

9. Comprueba catálogo, compra simple, combo, billetera, pedidos y recarga de prueba.
10. Publica el proyecto y conserva el cron actual apuntando a:

    `/api/cron/bank-parser`

## Qué reduce la carga de Supabase

- Catálogo público cacheado durante 60 segundos.
- Productos entregados por página, sin descargar todo el catálogo al navegador.
- Pedidos del cliente y del administrador paginados desde el servidor.
- Billetera filtrada y paginada por fecha desde el servidor.
- Usuarios administrativos paginados desde Supabase.
- Recargas automáticas actualizadas cada 2 minutos y solo con la pestaña visible.
- Promociones actualizadas cada 3 minutos y solo con la pestaña visible.
- Alertas del menú administrativo actualizadas cada 3 minutos.
- Listados bancarios sin descargar el cuerpo completo del correo.
- Límites estrictos en consultas administrativas.
- Menos validaciones repetidas de sesión, perfil y rol.
- Orden de productos guardado en una sola operación.
- Índices específicos para productos, pedidos, billetera, banco y promociones.

## Comportamiento esperado

- Los cambios públicos de productos pueden tardar hasta 60 segundos en reflejarse por el caché.
- El cron bancario sigue funcionando aunque el panel administrativo esté cerrado.
- La página administrativa puede actualizarse manualmente cuando necesites información inmediata.

## Archivos no incluidos por seguridad

- `.env.local`
- `.env.bank-parser`
- contraseñas de Gmail
- claves privadas de Supabase
- secretos del cron
- `node_modules`
- `.next`

Nunca subas esos secretos a GitHub ni los pegues dentro de archivos del proyecto.
