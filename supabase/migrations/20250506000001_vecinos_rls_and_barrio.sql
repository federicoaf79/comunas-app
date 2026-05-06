-- =============================================================
-- CRM Vecinal — habilitar lectura/alta desde el cliente
--
-- 1. Helpers SECURITY DEFINER que faltaban en la DB
--    (is_admin_comuna, is_staff, current_usuario_municipio).
-- 2. Agregar columna `barrio` a vecinos (la UI la usa para
--    filtrar y guardar).
-- 3. Habilitar RLS en vecinos y crear las 2 policies pedidas:
--    - SELECT: staff lee vecinos de su municipio (superadmin: todos).
--    - INSERT: admin_comuna crea en su municipio (superadmin: cualquiera).
--
-- Ejecutar en el SQL Editor de Supabase (rol postgres).
-- =============================================================

-- ============================================================
-- 1. HELPERS SECURITY DEFINER
-- ============================================================

create or replace function public.is_admin_comuna()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select 'admin_comuna' = any(
    coalesce(
      (select roles from public.usuarios where id = auth.uid() and activo = true),
      '{}'::text[]
    )
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios
    where id = auth.uid() and activo = true
      and roles && array['superadmin','admin_comuna','operador']
  );
$$;

create or replace function public.current_usuario_municipio()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select municipio_id from public.usuarios where id = auth.uid() and activo = true;
$$;

grant execute on function public.is_admin_comuna()           to anon, authenticated;
grant execute on function public.is_staff()                  to anon, authenticated;
grant execute on function public.current_usuario_municipio() to anon, authenticated;

-- ============================================================
-- 2. COLUMNA BARRIO + ÍNDICE
-- ============================================================

alter table public.vecinos add column if not exists barrio text;
create index if not exists idx_vecinos_barrio on public.vecinos (municipio_id, barrio);

-- ============================================================
-- 3. RLS + POLICIES
-- ============================================================

alter table public.vecinos enable row level security;

-- Limpiar posibles policies viejas (de la migration original o de
-- intentos previos de este mismo fix).
drop policy if exists "vecinos_self_select"               on public.vecinos;
drop policy if exists "vecinos_self_update"               on public.vecinos;
drop policy if exists "vecinos_staff_all"                 on public.vecinos;
drop policy if exists "vecinos_select_staff"              on public.vecinos;
drop policy if exists "vecinos_insert_admin"              on public.vecinos;
drop policy if exists "vecinos staff lee municipio"       on public.vecinos;
drop policy if exists "vecinos admin crea en municipio"   on public.vecinos;

-- SELECT: staff lee vecinos de su municipio. Superadmin lee todos.
create policy "vecinos staff lee municipio"
on public.vecinos
for select
to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- INSERT: admin_comuna crea en su municipio. Superadmin en cualquiera.
create policy "vecinos admin crea en municipio"
on public.vecinos
for insert
to authenticated
with check (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
);

-- ============================================================
-- 4. VERIFICACIÓN
-- ============================================================

-- Helpers nuevos creados como SECURITY DEFINER y owner postgres.
select proname, prosecdef as security_definer, pg_get_userbyid(proowner) as owner
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('is_admin_comuna','is_staff','current_usuario_municipio');

-- Columna barrio presente.
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'vecinos' and column_name = 'barrio';

-- Policies vigentes en vecinos.
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'vecinos'
order by policyname;
