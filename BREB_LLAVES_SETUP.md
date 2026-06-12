# Configuración de recargas automáticas por Bre-B / Llaves

Este proyecto quedó configurado para usar un solo método de pago automático: **Bre-B / Llaves**.

## 1. Configurar la llave destino visible al cliente

Edita el archivo:

```txt
app/recargas-automaticas/page.tsx
```

Busca:

```ts
const BREB_DESTINATION = "Bre-B / Llaves - 3117664491";
```

Cámbialo por tu llave real.

## 2. Aplicar la migración en Supabase

Ejecuta en Supabase SQL Editor el archivo:

```txt
supabase/migrations/20260610183000_bank_transfer_topups.sql
```

Esto crea la tabla `bank_payment_notifications`, agrega columnas a `wallet_topups` y crea el bucket `receipts`.

## 3. Probar cruce automático con un pago simulado

En Supabase SQL Editor ejecuta:

```sql
insert into public.bank_payment_notifications (
  provider,
  sender_email,
  subject,
  message_id,
  transaction_reference,
  amount,
  payer_origin,
  normalized_payer_origin,
  paid_at
)
values (
  'BREB_LLAVES',
  'alertasynotificaciones@bancolombia.com.co',
  'Prueba pago recibido Bre-B',
  'test-' || gen_random_uuid(),
  'BREB-TEST-' || extract(epoch from now())::text,
  11000,
  '3001234567',
  '3001234567',
  now()
);
```

Luego en `/recargas-automaticas` reporta:

```txt
Monto: 11000
Llave/celular origen: 3001234567
```

Debe aprobar automáticamente si el usuario está logueado y el comprobante se sube correctamente.

## 4. Configurar parser de correos

Variables necesarias:

```env
BANK_IMAP_HOST=imap.gmail.com
BANK_IMAP_PORT=993
BANK_IMAP_USER=alertas@tudominio.com
BANK_IMAP_PASSWORD=tu_password_o_app_password
BANK_ALLOWED_SENDERS=alertasynotificaciones@bancolombia.com.co
NEXT_PUBLIC_SUPABASE_URL=tu_url_supabase
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
```

Ejecutar:

```bash
python scripts/bank-email-parser.py
```

En Windows, si `python` no funciona, prueba:

```powershell
py scripts/bank-email-parser.py
```
