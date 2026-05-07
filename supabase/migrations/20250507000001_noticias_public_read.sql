-- =============================================================
-- Noticias — lectura pública (anon) de noticias publicadas
--
-- El Portal Vecinal corre sin auth y necesita listar las noticias
-- en estado='publicada'. Esta migration habilita SELECT a anon
-- restringido a esas filas. La lectura del resto (borradores) y
-- la edición sigue siendo sólo para staff.
--
-- Asume que la tabla `noticias` ya existe con al menos las
-- columnas: id, municipio_id, estado (text), publicado_at
-- (timestamptz), titulo, resumen, contenido, categoria,
-- imagen_url, autor.
--
-- Ejecutar en el SQL Editor de Supabase (rol postgres).
-- =============================================================

alter table public.noticias enable row level security;

-- Limpiar policies viejas / posibles duplicados.
drop policy if exists "noticias_publicadas_publicas"  on public.noticias;
drop policy if exists "noticias_staff_lee_todo"       on public.noticias;
drop policy if exists "noticias_admin_escribe"        on public.noticias;
drop policy if exists "noticias publicas read"        on public.noticias;
drop policy if exists "noticias staff lee todo"       on public.noticias;
drop policy if exists "noticias staff escribe"        on public.noticias;

-- SELECT pública (anon + authenticated) para noticias publicadas.
create policy "noticias publicas read"
on public.noticias
for select
to anon, authenticated
using (estado = 'publicada');

-- SELECT extendido para staff: ven publicadas Y borradores
-- de su municipio. Combina con la anterior por OR.
create policy "noticias staff lee todo"
on public.noticias
for select
to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- INSERT/UPDATE/DELETE para superadmin + admin_comuna en su municipio.
create policy "noticias staff escribe"
on public.noticias
for all
to authenticated
using (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'noticias';

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'noticias'
order by policyname;
