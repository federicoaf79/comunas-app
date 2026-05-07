-- =============================================================
-- Portal Público — habilitar flujos sin login
--
-- 1. Agrega columna `motivo text` a turnos (textarea opcional del
--    formulario público).
-- 2. Anon SELECT en `dependencias` (resolución de tipo→id desde el form).
-- 3. Anon SELECT/INSERT en `vecinos` (registro automático cuando un
--    DNI nuevo saca turno; también lookup por DNI desde "Consultar mi turno").
-- 4. Anon SELECT/INSERT en `turnos` (sacar y consultar turno).
-- 5. RPC `consultas_publicas_por_vecino(dni, telefono)` con SECURITY
--    DEFINER — devuelve sólo motivo/fecha/médico, NUNCA diagnóstico
--    ni receta. Verifica DNI cruzado con teléfono guardado en vecinos.
--
-- Nota de seguridad: anon SELECT en vecinos es una concesión deliberada
-- para que los flujos del portal funcionen sin auth. Si en el futuro
-- la privacidad lo requiere, reemplazar por una RPC equivalente.
--
-- Ejecutar en SQL Editor de Supabase (rol postgres).
-- =============================================================

-- 1. Columna motivo en turnos
alter table public.turnos add column if not exists motivo text;

-- 2. dependencias: SELECT anon
alter table public.dependencias enable row level security;
drop policy if exists "dependencias public read" on public.dependencias;
create policy "dependencias public read"
on public.dependencias
for select
to anon, authenticated
using (true);

-- 3. vecinos: SELECT + INSERT anon
alter table public.vecinos enable row level security;
drop policy if exists "vecinos anon insert" on public.vecinos;
drop policy if exists "vecinos anon select" on public.vecinos;
create policy "vecinos anon insert"
on public.vecinos
for insert
to anon
with check (true);
create policy "vecinos anon select"
on public.vecinos
for select
to anon
using (true);

-- 4. turnos: SELECT + INSERT anon
alter table public.turnos enable row level security;
drop policy if exists "turnos anon insert" on public.turnos;
drop policy if exists "turnos anon select" on public.turnos;
create policy "turnos anon insert"
on public.turnos
for insert
to anon
with check (true);
create policy "turnos anon select"
on public.turnos
for select
to anon
using (true);

-- 5. RPC consultas_publicas_por_vecino — verifica DNI + teléfono
create or replace function public.consultas_publicas_por_vecino(
  p_dni      text,
  p_telefono text
)
returns table (
  id            uuid,
  fecha         timestamptz,
  motivo        text,
  medico_nombre text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- Comparación de teléfono "tolerante": ignora +, espacios, guiones,
  -- paréntesis. Suficiente para el flujo público.
  select v.id into v_id
  from public.vecinos v
  where v.dni = p_dni
    and regexp_replace(coalesce(v.telefono, ''), '[^0-9]', '', 'g')
        like '%' || regexp_replace(p_telefono, '[^0-9]', '', 'g') || '%'
  limit 1;

  if v_id is null then return; end if;

  return query
    select c.id, c.fecha, c.motivo,
           coalesce(u.nombre, '—') as medico_nombre
    from public.hc_consultas c
    left join public.usuarios u on u.id = c.medico_id
    where c.vecino_id = v_id
    order by c.fecha desc
    limit 3;
end;
$$;

grant execute on function public.consultas_publicas_por_vecino(text, text) to anon, authenticated;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

-- columna motivo presente
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'turnos' and column_name = 'motivo';

-- RLS habilitado
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('vecinos', 'turnos', 'dependencias');

-- policies vigentes
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public' and tablename in ('vecinos', 'turnos', 'dependencias')
order by tablename, policyname;

-- RPC creado
select proname, prosecdef as security_definer, pg_get_userbyid(proowner) as owner
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'consultas_publicas_por_vecino';
