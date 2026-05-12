-- =============================================================
-- 20260512_sprint2_portal_cms
--
-- Sprint 2 — Portal Web: nuevas secciones y CMS.
--
-- Esta migration es IDEMPOTENTE: el cliente ya creó las tablas y
-- columnas manualmente en su instancia, así que cada bloque usa
-- IF NOT EXISTS / DROP-CREATE para que se pueda re-ejecutar sin
-- ensuciar el estado.
--
-- Cambios:
--   1. Tabla `autoridades` (id, municipio_id, nombre, cargo,
--      descripcion, foto_url, orden, activo, created_at).
--   2. Columnas extra en `dependencias` para enriquecer la página
--      pública de detalle.
--   3. RLS:
--      - SELECT anon en `autoridades` (solo activas).
--      - INSERT/UPDATE/DELETE staff del propio municipio.
--      - Agrega 'historia_municipio' al whitelist anon de
--        configuracion_portal.
-- =============================================================

-- 1. Tabla autoridades ----------------------------------------
create table if not exists public.autoridades (
  id            uuid primary key default gen_random_uuid(),
  municipio_id  uuid not null references public.municipios(id) on delete cascade,
  nombre        text not null,
  cargo         text not null,
  descripcion   text,
  foto_url      text,
  orden         integer not null default 0,
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

create index if not exists idx_autoridades_municipio
  on public.autoridades (municipio_id, orden);

alter table public.autoridades enable row level security;

-- SELECT anon — solo autoridades activas (el portal público las
-- muestra sin sesión).
drop policy if exists "autoridades_anon_select" on public.autoridades;
create policy "autoridades_anon_select"
on public.autoridades
for select
to anon
using (activo = true);

-- SELECT staff — ven todas las del propio municipio (activas + inactivas).
drop policy if exists "autoridades_staff_select" on public.autoridades;
create policy "autoridades_staff_select"
on public.autoridades
for select
to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- INSERT / UPDATE / DELETE staff del propio municipio.
drop policy if exists "autoridades_staff_write" on public.autoridades;
create policy "autoridades_staff_write"
on public.autoridades
for all
to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- 2. Columnas extra en dependencias ---------------------------
alter table public.dependencias
  add column if not exists descripcion_larga text,
  add column if not exists servicios         text[] not null default '{}'::text[],
  add column if not exists fotos             text[] not null default '{}'::text[],
  add column if not exists canal_atencion    text,
  add column if not exists email_contacto   text,
  add column if not exists whatsapp          text;

-- 3. Whitelist anon — incluir historia_municipio --------------
drop policy if exists configuracion_portal_anon_select on public.configuracion_portal;
drop policy if exists configuracion_portal_anon_read   on public.configuracion_portal;

create policy configuracion_portal_anon_select
on public.configuracion_portal
for select
to anon
using (clave in (
  'fuentes_rss',
  'redes_sociales',
  'datos_municipio',
  'identidad_visual',
  'historia_municipio'
));

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'autoridades'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'dependencias'
  and column_name in ('descripcion_larga','servicios','fotos','canal_atencion','email_contacto','whatsapp')
order by column_name;

select policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename in ('autoridades','configuracion_portal')
order by tablename, policyname;
