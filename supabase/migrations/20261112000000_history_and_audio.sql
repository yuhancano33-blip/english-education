-- SPEC-003 / SPEC-005 / SPEC-006: historial, transcripciones, audio y consentimiento (Fase 3).

-- ---------------------------------------------------------------------------
-- Consentimiento de grabación (SPEC-006 §7)
-- ---------------------------------------------------------------------------
alter table public.users_profile
  add column recording_consent_at timestamptz;

-- ---------------------------------------------------------------------------
-- Turnos de la transcripción
-- ---------------------------------------------------------------------------
create type public.message_sender as enum ('user', 'assistant');

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions (id) on delete cascade,
  turn_index int  not null check (turn_index >= 0),
  sender     public.message_sender not null,
  content    text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now(),
  -- También sirve de índice (session_id, turn_index) y permite reenviar un turno
  -- sin duplicarlo (upsert)
  constraint messages_session_turn_unique unique (session_id, turn_index)
);

alter table public.messages enable row level security;

create policy "messages: el dueño aprobado lee los de sus sesiones"
  on public.messages for select to authenticated
  using (
    (select public.is_approved())
    and exists (
      select 1 from public.chat_sessions s
      where s.id = messages.session_id and s.user_id = (select auth.uid())
    )
  );

revoke insert, update, delete on public.messages from anon, authenticated;
revoke all on public.messages from anon;

-- ---------------------------------------------------------------------------
-- Audio de las sesiones (SPEC-002 §5, SPEC-005 Storage)
-- Bucket privado; subidas y descargas con URLs firmadas que emite el backend.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('session-audio', 'session-audio', false, 10485760, array['audio/webm', 'audio/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cada usuario aprobado solo puede leer su carpeta {user_id}/. No hay políticas
-- de escritura: las subidas solo son posibles con la URL firmada del backend.
create policy "session-audio: el dueño aprobado lee su carpeta"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'session-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (select public.is_approved())
  );
