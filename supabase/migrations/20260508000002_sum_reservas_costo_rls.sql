-- =============================================================
-- SUM reservas — columna `costo` + RLS
--
-- 1. Agrega la columna `costo numeric(12,2) default 0` a la tabla
--    sum_reservas. Se usa para registrar el costo cobrado por la
--    reserva (puede ser 0 para eventos institucionales / ONG).
-- 2. Habilita RLS y aplica policies:
--    - SELECT: staff (admin_comuna / operador) en su municipio o
--      superadmin global.
--    - INSERT: igual a SELECT.
--    - UPDATE: solo admin_comuna en su municipio o superadmin
--      (cambios de estado: aprobar/rechazar/realizar).
--    - DELETE: solo admin_comuna en su municipio o superadmin.
--
-- Helpers asumidos (definidos en 20250505000001_comunas_schema):
--   public.is_staff(), public.is_admin_comuna(),
--   public.is_superadmin(), public.current_usuario_municipio()
--
-- Ejecutar en SQL Editor de Supabase (rol postgres).
-- =============================================================

-- 1. Columna costo (idempotente)
alter table public.sum_reservas
  add column if not exists costo numeric(12,2) not null default 0;

-- 2. RLS
alter table public.sum_reservas enable row level security;

-- Limpieza de policies previas con cualquier nombre conocido.
drop policy if exists "sum_reservas_staff_lee"      on public.sum_reservas;
drop policy if exists "sum_reservas_staff_inserta"  on public.sum_reservas;
drop policy if exists "sum_reservas_admin_actualiza" on public.sum_reservas;
drop policy if exists "sum_reservas_admin_borra"    on public.sum_reservas;

-- SELECT — staff del municipio + superadmin
create policy "sum_reservas_staff_lee"
on public.sum_reservas
for select
to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- INSERT — staff del municipio + superadmin
create policy "sum_reservas_staff_inserta"
on public.sum_reservas
for insert
to authenticated
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- UPDATE — solo admin_comuna del municipio o superadmin
create policy "sum_reservas_admin_actualiza"
on public.sum_reservas
for update
to authenticated
using (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
);

-- DELETE — solo admin_comuna del municipio o superadmin
create policy "sum_reservas_admin_borra"
on public.sum_reservas
for delete
to authenticated
using (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

-- columna costo presente
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'sum_reservas' and column_name = 'costo';

-- RLS habilitado
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'sum_reservas';

-- policies vigentes
select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'sum_reservas'
order by cmd, policyname;
