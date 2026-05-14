-- =============================================================
-- 20260514_hero_slides_anon
--
-- Agrega 'hero_slides' al whitelist de claves anon de
-- configuracion_portal. Valor esperado:
--   [ { imagen_url, titulo, activo } ]
-- (ver src/lib/portalDefaults.js → HERO_SLIDES_DEFAULT).
--
-- Reemplaza el carrusel-strip horizontal (clave `hero_carousel`)
-- por slides de FONDO del Hero. La clave hero_carousel queda
-- huérfana pero no la borramos — quien tenga una fila vieja la
-- puede seguir leyendo sin error.
--
-- Re-declara la policy entera con el whitelist canónico, igual
-- patrón que las _anon.sql anteriores.
-- =============================================================

drop policy if exists configuracion_portal_anon_select on public.configuracion_portal;

create policy configuracion_portal_anon_select
on public.configuracion_portal
for select
to anon
using (clave in (
  'fuentes_rss',
  'redes_sociales',
  'datos_municipio',
  'identidad_visual',
  'historia_municipio',
  'hero_carousel',
  'hero_slides',
  'tramites_portal'
));

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename  = 'configuracion_portal'
  and policyname = 'configuracion_portal_anon_select';
