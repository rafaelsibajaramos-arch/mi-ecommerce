# StreamingMayor — corrección rápida y ligera

Esta versión parte del proyecto original enviado por el propietario y conserva su diseño visual.

## Qué se corrigió

- Se restauraron exactamente el logo, la tipografía y la navegación originales.
- Se eliminó la caché de 60 segundos que retrasaba la actualización del stock.
- El catálogo vuelve a consultar Supabase directamente y muestra una caché visual corta mientras valida datos nuevos.
- Cuando se guarda stock, el catálogo se marca como actualizado y se recarga con datos frescos al volver al inicio.
- Las licencias se insertan por lotes de hasta 500, no una por una.
- Al guardar un producto ya no se vuelve a descargar inmediatamente todo el producto, variantes, componentes y licencias.
- El panel de recargas consulta menos filas y no descarga el cuerpo completo de los correos.
- El refresco automático de recargas solo funciona con la pestaña visible y se ejecuta cada 120 segundos.
- Las promociones se actualizan cada 180 segundos y solo cuando la pestaña está visible.
- Se agregaron índices de bajo costo para reducir lecturas de disco.

## Instalación

1. Haz una copia del proyecto actual.
2. Reemplaza el proyecto completo por esta carpeta.
3. Crea `.env.local` y `.env.bank-parser` con tus variables actuales. No copies esos archivos a GitHub.
4. En Supabase SQL Editor ejecuta una sola vez `EJECUTAR_EN_SUPABASE.sql`.
5. Ejecuta:

```bash
npm install
npm run build
npm run dev
```

6. Prueba el inicio, el logo, el ingreso, la edición de un producto, la carga de stock, una compra y las recargas automáticas.

## Importante

No se cambió la identidad visual del proyecto. Los archivos originales de Navbar, branding, estilos globales y layout se conservaron sin modificaciones.
