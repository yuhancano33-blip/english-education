-- SPEC-002 / SPEC-005 / SPEC-006: sesiones de voz (Fase 2).
-- La tabla messages llega en la Fase 3, cuando se guardan los turnos.

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.session_mode as enum ('free', 'tutor');
create type public.session_status as enum ('active', 'completed', 'interrupted');

-- ---------------------------------------------------------------------------
-- Tabla
-- ---------------------------------------------------------------------------
create table public.chat_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users_profile (id) on delete cascade,
  title            text,
  mode             public.session_mode   not null,
  status           public.session_status not null default 'active',
  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  duration_seconds int check (duration_seconds between 0 and 420),
  audio_path       text,
  audio_mime       text check (audio_mime in ('audio/webm', 'audio/mp4')),
  summary          jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chat_sessions_ended_consistent
    check ((status = 'active') = (ended_at is null))
);

create index chat_sessions_user_created_at
  on public.chat_sessions (user_id, created_at desc);

-- Una sola sesión activa por usuario (SPEC-006 §3)
create unique index chat_sessions_one_active_per_user
  on public.chat_sessions (user_id) where status = 'active';

create trigger chat_sessions_set_updated_at
  before update on public.chat_sessions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: el dueño aprobado lee sus sesiones; todas las escrituras van por el
-- backend (service_role). pending/rejected no tienen acceso (SPEC-006 §5).
-- ---------------------------------------------------------------------------
create function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users_profile
    where id = auth.uid() and status = 'approved'
  );
$$;

alter table public.chat_sessions enable row level security;

create policy "chat_sessions: el dueño aprobado lee las suyas"
  on public.chat_sessions for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_approved()));

revoke insert, update, delete on public.chat_sessions from anon, authenticated;
revoke all on public.chat_sessions from anon;

-- ---------------------------------------------------------------------------
-- Inicio de sesión de voz (SPEC-002 §2, SPEC-006 §3), en una transacción:
--   1. marca interrupted las sesiones activas abandonadas (> p_stale_after_seconds)
--   2. rechaza si ya hay una activa
--   3. rechaza si se alcanzó el límite diario (día en p_timezone)
--   4. crea la sesión
-- outcome: created | not_approved | active_exists | limit_reached
-- ---------------------------------------------------------------------------
create function public.start_voice_session(
  p_user_id             uuid,
  p_mode                public.session_mode,
  p_daily_limit         int,
  p_stale_after_seconds int  default 600,
  p_timezone            text default 'America/Bogota'
)
returns table (outcome text, session_id uuid, resets_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day_start timestamptz;
  v_count     int;
  v_id        uuid;
begin
  if not exists (
    select 1 from public.users_profile where id = p_user_id and status = 'approved'
  ) then
    return query select 'not_approved'::text, null::uuid, null::timestamptz;
    return;
  end if;

  update public.chat_sessions
     set status = 'interrupted', ended_at = now()
   where user_id = p_user_id
     and status = 'active'
     and started_at < now() - make_interval(secs => p_stale_after_seconds);

  if exists (
    select 1 from public.chat_sessions where user_id = p_user_id and status = 'active'
  ) then
    return query select 'active_exists'::text, null::uuid, null::timestamptz;
    return;
  end if;

  v_day_start := date_trunc('day', now() at time zone p_timezone) at time zone p_timezone;

  select count(*) into v_count
    from public.chat_sessions
   where user_id = p_user_id and started_at >= v_day_start;

  if v_count >= p_daily_limit then
    return query select 'limit_reached'::text, null::uuid, v_day_start + interval '1 day';
    return;
  end if;

  insert into public.chat_sessions (user_id, mode)
  values (p_user_id, p_mode)
  returning id into v_id;

  return query select 'created'::text, v_id, null::timestamptz;
exception
  -- Dos peticiones simultáneas: el índice único deja pasar solo una
  when unique_violation then
    return query select 'active_exists'::text, null::uuid, null::timestamptz;
end;
$$;

revoke execute on function public.start_voice_session(uuid, public.session_mode, int, int, text)
  from public, anon, authenticated;
grant execute on function public.start_voice_session(uuid, public.session_mode, int, int, text)
  to service_role;
