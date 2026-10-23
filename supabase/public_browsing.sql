  -- Mantiene el esquema y los permisos existentes de branding.
  alter table public.site_settings add column if not exists public_browsing_enabled boolean not null default false;
  create or replace function public.protect_public_browsing_setting()
  returns trigger language plpgsql set search_path = public as $$
  begin
    if current_user in ('postgres', 'service_role') or auth.role() = 'service_role' then return new; end if;
    if TG_OP = 'INSERT' then
      if new.public_browsing_enabled then raise exception 'Solo el servidor puede modificar este ajuste'; end if;
    elsif new.public_browsing_enabled is distinct from old.public_browsing_enabled then
      raise exception 'Solo el servidor puede modificar este ajuste';
    end if;
    return new;
  end;
  $$;
  drop trigger if exists protect_public_browsing_setting on public.site_settings;
  create trigger protect_public_browsing_setting before insert or update on public.site_settings for each row execute function public.protect_public_browsing_setting();
