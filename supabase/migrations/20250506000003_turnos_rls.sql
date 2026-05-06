-- =============================================================
-- Turnos — habilitar lectura/alta/edición desde el cliente
--
-- Helpers (is_superadmin, is_staff, current_usuario_municipio,
-- current_vecino_id) se asume que ya existen — fueron creados por
-- migrations anteriores. Si current_vecino_id no está, ejecutar
-- antes la migration 20250506000002_hc_consultas_rls.sql.
--
-- Ejecutar en el SQL Editor de Supabase (rol postgres).
-- =============================================================

alter table public.turnos enable row level security;

-- Limpiar policies viejas / posibles duplicados.
drop policy if exists "turnos_vecino_lee_propios"        on public.turnos;
drop policy if exists "turnos_vecino_crea_propios"       on public.turnos;
drop policy if exists "turnos_vecino_actualiza_propios"  on public.turnos;
drop policy if exists "turnos_staff_all"                 on public.turnos;
drop policy if exists "turnos staff lee municipio"       on public.turnos;
drop policy if exists "turnos staff crea"                on public.turnos;
drop policy if exists "turnos staff actualiza"           on public.turnos;

-- SELECT: superadmin todos, staff de su municipio, vecino sus propios.
create policy "turnos staff lee municipio"
on public.turnos
for select
to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
  or (vecino_id = public.current_vecino_id())
);

-- INSERT: superadmin + staff dentro de su municipio.
create policy "turnos staff crea"
on public.turnos
for insert
to authenticated
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- UPDATE: superadmin + staff dentro de su municipio.
create policy "turnos staff actualiza"
on public.turnos
for update
to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'turnos';

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'turnos'
order by policyname;
