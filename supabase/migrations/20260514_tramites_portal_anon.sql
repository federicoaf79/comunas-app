-- =============================================================
-- 20260514_tramites_portal_anon
--
-- Agrega 'tramites_portal' al whitelist de claves de
-- configuracion_portal que el rol anon puede leer. Valor esperado:
-- array de objetos { id, titulo, descripcion, icono, tipo, url, activo }
-- — ver src/lib/portalDefaults.js (TRAMITES_PORTAL_DEFAULT).
--
-- Lo necesita /portal/tramites (TramitesPortal.jsx). Sin esta
-- migration, el SELECT desde el portal queda silenciado por RLS y
-- el componente cae a los defaults locales.
--
-- Sigue a 20260514_hero_carousel_anon.sql — re-declara el policy
-- entero porque Postgres no permite agregar valores a un IN existente
-- (hay que recrear la policy completa).
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
