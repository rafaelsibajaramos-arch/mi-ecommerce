-- Índices de bajo costo para reducir lecturas de disco y CPU en instancias Nano.
-- Todos son idempotentes y pueden ejecutarse varias veces.

create index if not exists products_active_sort_idx
  on public.products (is_active, sort_order, created_at desc);

create index if not exists product_variants_product_active_sort_idx
  on public.product_variants (product_id, is_active, sort_order);

create index if not exists product_components_product_sort_idx
  on public.product_components (product_id, sort_order);

create index if not exists orders_user_active_created_idx
  on public.orders (user_id, created_at desc)
  where coalesce(is_reverted, false) = false;

create index if not exists order_items_order_id_idx
  on public.order_items (order_id);

create index if not exists product_licenses_assigned_order_user_idx
  on public.product_licenses (assigned_order_id, assigned_user_id, status);

create index if not exists wallet_transactions_user_created_idx
  on public.wallet_transactions (user_id, created_at desc);

create index if not exists wallet_topups_status_created_idx
  on public.wallet_topups (status, created_at desc);

create index if not exists wallet_topups_user_created_idx
  on public.wallet_topups (user_id, created_at desc);

create index if not exists bank_payment_notifications_available_idx
  on public.bank_payment_notifications (created_at desc)
  where is_used = false and matched_topup_id is null;

create index if not exists bank_payment_notifications_created_idx
  on public.bank_payment_notifications (created_at desc);

create index if not exists wallet_topup_alerts_status_created_idx
  on public.wallet_topup_alerts (status, created_at desc);

create index if not exists wallet_topup_promotions_active_idx
  on public.wallet_topup_promotions (status, min_amount, created_at desc)
  where deleted_at is null;
