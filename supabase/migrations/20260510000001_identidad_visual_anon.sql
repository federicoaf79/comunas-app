-- =============================================================
-- 20260510000001_identidad_visual_anon
--
-- Agrega 'identidad_visual' al whitelist de claves que el rol anon
-- puede leer en configuracion_portal. Valor esperado:
--   { logo_url: text, favicon_url: text }
--
-- Lo necesitan: header del portal (PortalPublico.jsx), header del
-- sistema admin (AppShell.jsx) y la página de login — todas leen
-- por anon antes de que haya sesión válida.
-- =============================================================

drop policy if exists configuracion_portal_anon_select on public.configuracion_portal;

create policy configuracion_portal_anon_select
on public.configuracion_portal
for select
to anon
using (clave in ('fuentes_rss', 'redes_sociales', 'datos_municipio', 'identidad_visual'));
