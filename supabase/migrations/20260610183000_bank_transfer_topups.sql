-- Recargas Bre-B / Llaves + validación por correos oficiales.

create table if not exists public.bank_payment_notifications (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'BREB_LLAVES',
  sender_email text,
  subject text,
  message_id text unique,
  transaction_reference text not null unique,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'COP',
  payer_origin text not null,
  normalized_payer_origin text not null,
  paid_at timestamptz,
  raw_body text,
  parser_version text not null default 'v1',
  is_used boolean not null default false,
  matched_topup_id uuid,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_payment_notifications_match_idx
  on public.bank_payment_notifications (provider, amount, normalized_payer_origin, is_used, paid_at desc);

create index if not exists bank_payment_notifications_reference_idx
  on public.bank_payment_notifications (transaction_reference);

alter table public.wallet_topups
  add column if not exists payer_origin text,
  add column if not exists normalized_payer_origin text,
  add column if not exists destination_account text,
  add column if not exists receipt_url text,
  add column if not exists matched_bank_payment_id uuid references public.bank_payment_notifications(id),
  add column if not exists matched_bank_reference text,
  add column if not exists approved_by uuid,
  add column if not exists admin_note text;

create index if not exists wallet_topups_bank_match_idx
  on public.wallet_topups (status, amount, normalized_payer_origin, created_at desc);

-- Bucket público para que el admin pueda ver comprobantes desde la URL guardada.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', true)
on conflict (id) do update set public = excluded.public;

-- Permite que usuarios autenticados suban comprobantes a su carpeta.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Authenticated users can upload receipt images'
  ) then
    create policy "Authenticated users can upload receipt images"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'receipts');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anyone can read receipt images'
  ) then
    create policy "Anyone can read receipt images"
    on storage.objects for select
    to public
    using (bucket_id = 'receipts');
  end if;
end $$;
