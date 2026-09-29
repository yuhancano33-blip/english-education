-- SPEC-004 / SPEC-005 / SPEC-006: control de acceso y aprobaciones.
-- Perfiles, solicitudes de acceso, RLS, resolución atómica, Realtime y aviso por email.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'user');
create type public.user_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.users_profile (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  role         public.user_role   not null default 'user',
  status       public.user_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- SPEC-004 §1: los administradores tienen siempre estado approved
  constraint users_profile_admins_approved check (role <> 'admin' or status = 'approved')
);

create table public.access_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users_profile (id) on delete cascade,
  status      public.user_status not null default 'pending',
  resolved_by uuid references public.users_profile (id) on delete set null,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  constraint access_requests_resolution_consistent
    check ((status = 'pending') = (resolved_at is null))
);

-- Una sola solicitud pending por usuario
create unique index access_requests_one_pending_per_user
  on public.access_requests (user_id) where status = 'pending';
create index access_requests_status_created_at
  on public.access_requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_profile_set_updated_at
  before update on public.users_profile
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Registro: perfil pending + solicitud de acceso
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users_profile (id, email) values (new.id, new.email);
  insert into public.access_requests (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper para RLS (security definer para evitar recursión en las políticas)
-- ---------------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users_profile
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Solo lectura desde el cliente. Ninguna política de insert/update/delete:
-- nadie puede cambiar su role ni su status desde el navegador (SPEC-006 §1).
-- ---------------------------------------------------------------------------
alter table public.users_profile   enable row level security;
alter table public.access_requests enable row level security;

create policy "users_profile: leer el propio perfil"
  on public.users_profile for select to authenticated
  using (id = (select auth.uid()));

create policy "users_profile: admins leen todos"
  on public.users_profile for select to authenticated
  using ((select public.is_admin()));

create policy "access_requests: solo admins leen"
  on public.access_requests for select to authenticated
  using ((select public.is_admin()));

-- Defensa en profundidad: sin permisos de escritura para los roles del cliente
revoke insert, update, delete on public.users_profile   from anon, authenticated;
revoke insert, update, delete on public.access_requests from anon, authenticated;
revoke all on public.users_profile, public.access_requests from anon;

-- ---------------------------------------------------------------------------
-- Resolución atómica de solicitudes (SPEC-004 §2)
-- Solo se aplica si la solicitud sigue pending: si dos admins actúan a la vez,
-- prevalece la primera decisión. Solo la llama el backend (service_role).
-- ---------------------------------------------------------------------------
create function public.resolve_access_request(
  p_request_id uuid,
  p_admin_id   uuid,
  p_decision   public.user_status
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'invalid decision: %', p_decision using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.users_profile where id = p_admin_id and role = 'admin'
  ) then
    raise exception 'resolver is not an admin' using errcode = '42501';
  end if;

  update public.access_requests
     set status = p_decision, resolved_by = p_admin_id, resolved_at = now()
   where id = p_request_id and status = 'pending'
  returning access_requests.user_id into v_user_id;

  if v_user_id is null then
    if exists (select 1 from public.access_requests where id = p_request_id) then
      return 'already_resolved';
    end if;
    return 'not_found';
  end if;

  update public.users_profile
     set status = p_decision
   where id = v_user_id and role <> 'admin';

  return 'resolved';
end;
$$;

-- ---------------------------------------------------------------------------
-- Alta de administradores (SPEC-004): solo con permisos de servidor.
-- Uso: supabase/scripts/promote_admin.sql
-- ---------------------------------------------------------------------------
create function public.promote_to_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from public.users_profile where lower(email) = lower(p_email);
  if v_user_id is null then
    raise exception 'no existe un perfil con el email %', p_email using errcode = 'P0002';
  end if;

  update public.users_profile set role = 'admin', status = 'approved' where id = v_user_id;

  update public.access_requests
     set status = 'approved', resolved_by = v_user_id, resolved_at = now()
   where user_id = v_user_id and status = 'pending';
end;
$$;

-- Las funciones privilegiadas no se exponen a los roles del cliente
revoke execute on function public.handle_new_user()                  from public, anon, authenticated;
revoke execute on function public.resolve_access_request(uuid, uuid, public.user_status) from public, anon, authenticated;
revoke execute on function public.promote_to_admin(text)             from public, anon, authenticated, service_role;
grant  execute on function public.resolve_access_request(uuid, uuid, public.user_status) to service_role;

-- ---------------------------------------------------------------------------
-- Realtime: sala de espera (perfil propio) y notificaciones a admins.
-- Realtime respeta las políticas RLS anteriores.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.users_profile, public.access_requests;

-- ---------------------------------------------------------------------------
-- Aviso por email a los administradores (SPEC-004 §2)
-- El trigger llama al backend con pg_net. URL y secreto viven en Supabase
-- Vault por entorno ('access_webhook_url', 'access_webhook_secret'); si no
-- están configurados o algo falla, el registro del usuario sigue adelante.
-- ---------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

create function public.notify_access_request_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'access_webhook_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'access_webhook_secret';

  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('request_id', new.id),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'notify_access_request_created: %', sqlerrm;
  return new;
end;
$$;

revoke execute on function public.notify_access_request_created() from public, anon, authenticated;

create trigger on_access_request_created
  after insert on public.access_requests
  for each row execute function public.notify_access_request_created();
