create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default 'false'::jsonb
);
alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;
grant all on public.site_settings to service_role;
insert into public.site_settings(key,value) values ('public_browsing_enabled','false') on conflict (key) do nothing;
