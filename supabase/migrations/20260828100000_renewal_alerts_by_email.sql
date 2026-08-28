-- Permite crear una sola alerta de renovacion pendiente por cuenta y producto.
drop index if exists public.license_alerts_one_pending_renewal_account_idx;

create unique index if not exists license_alerts_one_pending_renewal_account_idx
  on public.license_alerts (product_id, lower(manual_license_text))
  where task_type = 'manual'
    and status = 'pending'
    and product_id is not null
    and manual_license_text is not null;