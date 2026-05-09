-- =============================================================
-- configuracion_portal — restringir SELECT anon a claves públicas.
--
-- La policy original (`configuracion_portal_public_read`) dejaba a
-- anon leer CUALQUIER clave de la tabla. Eso filtraba secretos
-- como el API key de Plan-B (clave 'planb_config').
--
-- Esta migration:
--   1. Reemplaza la policy "para todos" por una más estrecha que
--      solo permite a anon leer las claves del whitelist
--      ('fuentes_rss', 'redes_sociales', 'datos_municipio').
--   2. Agrega una policy SELECT separada para authenticated staff
--      que ve TODAS las claves del municipio (incluida planb_config).
--      Superadmin ve todo.
--
-- Helpers asumidos: public.is_staff(), public.is_superadmin(),
-- public.current_usuario_municipio() — definidos en la migration
-- inicial 20250505000001_comunas_schema.
--
-- Ejecutar en SQL Editor de Supabase (rol postgres).
-- =============================================================

alter table public.configuracion_portal enable row level security;

-- Limpieza del SELECT anterior y de cualquier nombre alternativo
-- por si quedaron rastros de runs previos.
drop policy if exists "configuracion_portal_public_read" on public.configuracion_portal;
drop policy if exists "configuracion_portal_anon_read"   on public.configuracion_portal;
drop policy if exists "configuracion_portal_staff_read"  on public.configuracion_portal;

-- SELECT anon — solo claves del whitelist, ninguna de ellas guarda
-- credenciales o datos sensibles. Cualquier clave nueva con
-- secretos NO debe agregarse a esta lista.
create policy "configuracion_portal_anon_read"
on public.configuracion_portal
for select
to anon
using (clave in ('fuentes_rss', 'redes_sociales', 'datos_municipio'));

-- SELECT authenticated staff — ven todas las claves del municipio
-- (planb_config inclusive, porque la usan en /admin/config-general).
-- Superadmin pasa por encima del filtro por municipio.
create policy "configuracion_portal_staff_read"
on public.configuracion_portal
for select
to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- Las policies de INSERT / UPDATE / DELETE existentes
-- (configuracion_portal_staff_inserta / _actualiza / _borra) ya
-- están restringidas a staff + superadmin desde la migration
-- 20260508000003 — no se modifican.

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'configuracion_portal'
order by cmd, policyname;
