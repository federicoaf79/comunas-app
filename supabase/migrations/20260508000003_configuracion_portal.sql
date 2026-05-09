-- =============================================================
-- configuracion_portal — clave/valor jsonb por municipio
--
-- Almacena settings configurables del Portal Ciudadano en formato
-- (clave, valor) por municipio. La primera clave en uso es
-- 'fuentes_rss' que guarda el array de fuentes RSS externas
-- mostradas en la sección "Noticias de Argentina" del portal.
--
-- Forma del valor para clave='fuentes_rss':
--   [
--     {
--       "key":            "infobae",
--       "label":          "Infobae",
--       "url":            "https://www.infobae.com/argentina-rss.xml",
--       "home":           "https://www.infobae.com/",
--       "active":         true,
--       "palabras_clave": ["santiago", "norte argentino"]
--     },
--     ...
--   ]
--
-- RLS:
--   - SELECT: anon + authenticated. El portal público necesita leer
--     `fuentes_rss` para renderizar la sección. La info no es
--     sensible (URLs públicas + palabras clave configurables).
--   - INSERT/UPDATE/DELETE: staff (admin_comuna / operador / superadmin).
--     Solo pueden tocar la fila de su propio municipio. Superadmin
--     puede tocar cualquiera.
--
-- Ejecutar en SQL Editor de Supabase (rol postgres).
-- =============================================================

create table if not exists public.configuracion_portal (
  id            uuid primary key default gen_random_uuid(),
  municipio_id  uuid references public.municipios(id) on delete cascade,
  clave         text not null,
  valor         jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (municipio_id, clave)
);

create index if not exists idx_configuracion_portal_municipio_clave
  on public.configuracion_portal (municipio_id, clave);

-- Trigger para updated_at — usa el helper set_updated_at() ya
-- presente desde la migration inicial.
drop trigger if exists trg_configuracion_portal_updated_at on public.configuracion_portal;
create trigger trg_configuracion_portal_updated_at
  before update on public.configuracion_portal
  for each row execute function public.set_updated_at();

-- ─── RLS ───────────────────────────────────────────────────────
alter table public.configuracion_portal enable row level security;

drop policy if exists "configuracion_portal_public_read" on public.configuracion_portal;
drop policy if exists "configuracion_portal_staff_lee"  on public.configuracion_portal;
drop policy if exists "configuracion_portal_staff_inserta" on public.configuracion_portal;
drop policy if exists "configuracion_portal_staff_actualiza" on public.configuracion_portal;
drop policy if exists "configuracion_portal_staff_borra"  on public.configuracion_portal;

-- SELECT — anon + authenticated. El portal lee anónimo, los
-- operadores leen las filas de su municipio (vía la misma policy).
create policy "configuracion_portal_public_read"
on public.configuracion_portal
for select
to anon, authenticated
using (true);

-- INSERT — staff del municipio + superadmin
create policy "configuracion_portal_staff_inserta"
on public.configuracion_portal
for insert
to authenticated
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- UPDATE — staff del municipio + superadmin
create policy "configuracion_portal_staff_actualiza"
on public.configuracion_portal
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

-- DELETE — staff del municipio + superadmin
create policy "configuracion_portal_staff_borra"
on public.configuracion_portal
for delete
to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'configuracion_portal'
order by ordinal_position;

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'configuracion_portal'
order by cmd, policyname;
