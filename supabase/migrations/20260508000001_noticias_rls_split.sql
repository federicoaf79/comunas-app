-- =============================================================
-- Noticias — split de la policy "for all" en INSERT/UPDATE/DELETE
--
-- La policy anterior permitía INSERT/UPDATE/DELETE solo a
-- admin_comuna y superadmin. El CMS del admin ahora también deja
-- a operadores y al rol futuro `admin_portal_web` crear/editar
-- noticias, pero la eliminación queda exclusivamente en manos de
-- admin_comuna y superadmin (regla de gobierno editorial).
--
-- Reemplaza la policy "noticias staff escribe" por tres policies
-- separadas — una por verbo SQL — para poder dar permisos
-- distintos a INSERT/UPDATE vs DELETE.
--
-- Helpers asumidos (definidos en 20250505000001_comunas_schema):
--   public.is_staff(), public.is_admin_comuna(),
--   public.is_superadmin(), public.current_usuario_municipio()
--
-- Ejecutar en el SQL Editor de Supabase (rol postgres).
-- =============================================================

alter table public.noticias enable row level security;

-- Limpiar la policy combinada vieja y cualquier otra duplicada
-- de runs previas.
drop policy if exists "noticias staff escribe"  on public.noticias;
drop policy if exists "noticias staff insert"   on public.noticias;
drop policy if exists "noticias staff update"   on public.noticias;
drop policy if exists "noticias admin delete"   on public.noticias;

-- INSERT — staff (admin_comuna, operador, admin_portal_web) en su
-- municipio. Superadmin pasa por encima de cualquier filtro.
create policy "noticias staff insert"
on public.noticias
for insert
to authenticated
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- UPDATE — mismas reglas que INSERT. with_check garantiza que
-- staff no pueda mover una fila a otro municipio.
create policy "noticias staff update"
on public.noticias
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

-- DELETE — solo admin_comuna en su municipio o superadmin.
-- Operadores y admin_portal_web NO pueden borrar.
create policy "noticias admin delete"
on public.noticias
for delete
to authenticated
using (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'noticias'
order by cmd, policyname;
