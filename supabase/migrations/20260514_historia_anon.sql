-- =============================================================
-- 20260514_historia_anon
--
-- Garantiza que `historia_municipio` esté en el whitelist de
-- claves anon de configuracion_portal. Es idempotente — la migration
-- re-declara la policy completa (Postgres no soporta agregar valores
-- a un IN existente; hay que reemplazar la policy entera).
--
-- Historia ya venía incluida desde 20260512_sprint2_portal_cms.sql,
-- pero en algunos environments la policy quedó en una versión vieja
-- (solo fuentes_rss/redes_sociales/datos_municipio) — esta migration
-- la re-sincroniza con el estado canónico actual.
--
-- IMPORTANTE: si se agregan claves nuevas más adelante, hay que
-- actualizar ESTE archivo Y el último de la serie de _anon.sql para
-- mantener el whitelist coherente. Centralizar en una única migration
-- "whitelist canónico" sería ideal en un próximo refactor.
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

-- 1) Policy quedó con todas las claves del whitelist.
select policyname, qual
from pg_policies
where schemaname = 'public'
  and tablename  = 'configuracion_portal'
  and policyname = 'configuracion_portal_anon_select';

-- 2) Para Real Sayana — qué claves tiene cargadas actualmente
-- (filtrar después si el slug existe; si no, la query devuelve []).
select clave
from public.configuracion_portal
where municipio_id = (
  select id from public.municipios where slug = 'real-sayana' limit 1
)
order by clave;
