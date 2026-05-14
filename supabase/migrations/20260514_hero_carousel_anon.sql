-- =============================================================
-- 20260514_hero_carousel_anon
--
-- Agrega 'hero_carousel' al whitelist de claves que el rol anon
-- puede leer en configuracion_portal. Valor esperado:
--   {
--     "activo": bool,
--     "velocidad_segundos": int,
--     "mostrar_titulo": bool,
--     "mostrar_categoria": bool
--   }
--
-- Lo necesita el HeroCarousel del portal público (PortalPublico.jsx).
-- Si la clave no está cargada, el componente cae a los defaults del
-- frontend — la migration solo destraba la lectura cuando el admin
-- la persiste desde /admin/config-portal.
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
  'hero_carousel'
));

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename  = 'configuracion_portal'
  and policyname = 'configuracion_portal_anon_select';
