-- =============================================================
-- 20260513_dependencias_portal_extras
--
-- Portal Ciudadano — campos extra en `dependencias` para
-- enriquecer la landing pública /portal/dependencia/:tipo
-- (o /portal/dependencia/:slug). Las columnas son OPCIONALES:
-- la landing las consume sólo si están cargadas, y degrada de
-- forma elegante cuando faltan.
--
-- Campos agregados:
--   - horario_atencion  text   Texto libre tipo
--                              "Lun a Vie · 8:00 – 20:00".
--   - telefono          text   Clickeable como tel: en la UI;
--                              acepta dígitos puros o formato
--                              libre (ej. "+54 385 4 123-456").
--   - direccion         text   Calle y altura; se usa para el
--                              embed de Google Maps.
--   - slug              text   Slug URL-friendly opcional para
--                              /portal/dependencia/:slug,
--                              además del :tipo legacy.
--
-- El archivo se conserva en el repo a modo de REFERENCIA. La
-- instancia de Supabase ya tiene las columnas creadas a mano
-- desde el Editor SQL; este script queda para que futuros devs
-- puedan replayar el esquema desde cero de forma idempotente.
-- =============================================================

-- ============================================================
-- 1. COLUMNAS EXTRA EN DEPENDENCIAS
-- ============================================================

alter table public.dependencias
  add column if not exists horario_atencion text,
  add column if not exists telefono         text,
  add column if not exists direccion        text,
  add column if not exists slug             text;

-- ============================================================
-- 2. ÍNDICE PARA RESOLUCIÓN POR SLUG
-- ============================================================

-- La landing pública resuelve la dependencia por (municipio_id,
-- slug). Como `slug` puede ser NULL (campo opcional), NO se
-- aplica UNIQUE: el índice acelera el lookup sin forzar la
-- unicidad a nivel DB. La unicidad por municipio queda como
-- convención de carga desde el panel de staff.
create index if not exists idx_dependencias_slug
  on public.dependencias (municipio_id, slug);

-- ============================================================
-- 3. VERIFICACIÓN
-- ============================================================

-- Columnas nuevas presentes.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'dependencias'
  and column_name in ('horario_atencion','telefono','direccion','slug')
order by column_name;

-- Índice creado.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'dependencias'
  and indexname = 'idx_dependencias_slug';
