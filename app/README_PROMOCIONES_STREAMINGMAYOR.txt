CAMBIO: Módulo independiente de promociones de recarga para StreamingMayor

Copiar cada archivo en la misma ruta dentro del proyecto StreamingMayor.

Archivos incluidos:
- components/admin/AdminSidebar.tsx
  Agrega el botón "Promociones" al menú lateral, debajo de "Recargas automáticas".

- app/admin/promociones-recargas/page.tsx
  Nueva pantalla independiente para crear, editar, activar, pausar y programar promociones.

- app/api/admin/topup-promotions/route.ts
  API admin para listar promociones, crear, editar y pausar/activar.

- app/admin/recargas-automaticas/page.tsx
  Muestra bono aplicado en el historial y deja acceso directo al nuevo módulo.

- lib/topupPromotions.ts
  Motor de cálculo de promoción vigente.

- lib/bankTopups.ts
  Aplica la promoción después del match/aprobación automática o manual.

- lib/walletTopups.ts
  Aplica el bono en wallet solo una vez mediante RPC.

- app/api/admin/recargas-automaticas/data/route.ts
  Incluye columnas de bono/promoción en el historial.

- app/api/admin/wallet/topups/void/route.ts
  Al anular una recarga aprobada, descuenta saldo base + bono aplicado.

- supabase/migrations/20260620120000_wallet_topup_promotions.sql
  SQL completo con tabla, columnas, función RPC, grants y políticas RLS.

Ruta nueva:
/admin/promociones-recargas

Después de copiar:
1. Ejecuta el SQL en Supabase para el proyecto de StreamingMayor.
2. Reinicia el proyecto.
3. Entra como admin a /admin/promociones-recargas.
4. Crea una promoción, por ejemplo: mínimo 30000, porcentaje 10%, activa.

Validación recomendada:
npx tsc --noEmit
