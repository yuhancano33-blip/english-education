-- SPEC-006 §3: límite de peticiones HTTP por usuario (Fase 5).
-- Contador por ventana fija de un minuto. Lo usa solo el backend.

create table public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  count        int         not null default 1,
  primary key (key, window_start)
);

-- RLS sin políticas: los roles del cliente no pueden leer ni escribir
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- Suma una petición a la ventana actual y dice si se permite.
-- El upsert es atómico: peticiones simultáneas no se pierden.
create function public.check_rate_limit(
  p_key            text,
  p_limit          int,
  p_window_seconds int default 60
)
returns table (allowed boolean, current_count int, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count  int;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  return query select
    v_count <= p_limit,
    v_count,
    v_window + make_interval(secs => p_window_seconds);
end;
$$;

revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;
