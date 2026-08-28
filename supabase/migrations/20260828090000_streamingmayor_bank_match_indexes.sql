-- Índices específicos para el cron de recargas Bre-B.
-- Reducen el trabajo de las consultas que solo consideran pagos recientes y disponibles.

create index if not exists wallet_topups_active_bank_match_idx
  on public.wallet_topups (amount, created_at desc)
  where status = 'PENDING' and provider = 'BREB_LLAVES';

create index if not exists bank_payment_notifications_available_match_idx
  on public.bank_payment_notifications (created_at desc, amount)
  where provider = 'BREB_LLAVES'
    and is_used = false
    and matched_topup_id is null;

create index if not exists bank_payment_notifications_repair_idx
  on public.bank_payment_notifications (updated_at asc)
  where is_used = false and matched_topup_id is not null;
