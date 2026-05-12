-- =============================================================
-- 20260513_vecinos_zona
--
-- CRM Vecinal — agregar columna `zona` a la tabla `vecinos`
-- para distinguir entre vecinos del casco urbano y los de las
-- zonas rurales del municipio. El listado de Vecinos y los
-- módulos de reclamos/beneficiarios la usan como filtro rápido.
--
-- Dominio:
--   zona ∈ { 'urbano', 'rural' }   (default: 'urbano')
--
-- El archivo se conserva en el repo a modo de REFERENCIA. La
-- instancia de Supabase ya tiene la columna creada a mano desde
-- el Editor SQL; este script queda para que futuros devs puedan
-- replayar el esquema desde cero de forma idempotente.
-- =============================================================

-- ============================================================
-- 1. COLUMNA ZONA
-- ============================================================

alter table public.vecinos
  add column if not exists zona text not null default 'urbano';

-- ============================================================
-- 2. CHECK CONSTRAINT
-- ============================================================

-- El CHECK se agrega aparte porque `add column ... check (...)`
-- no es idempotente cuando la columna ya existe. Drop + create
-- garantiza que el constraint quede siempre con la misma forma.
alter table public.vecinos
  drop constraint if exists vecinos_zona_check;

alter table public.vecinos
  add constraint vecinos_zona_check
  check (zona in ('urbano', 'rural'));

-- ============================================================
-- 3. ÍNDICE PARA FILTRADO
-- ============================================================

-- (municipio_id, zona) es el patrón típico de la UI: listado
-- de vecinos del municipio actual filtrado por zona.
create index if not exists idx_vecinos_municipio_zona
  on public.vecinos (municipio_id, zona);

-- ============================================================
-- 4. VERIFICACIÓN
-- ============================================================

-- Columna zona presente con default 'urbano'.
select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'vecinos' and column_name = 'zona';

-- CHECK constraint vigente.
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.vecinos'::regclass and conname = 'vecinos_zona_check';

-- Índice creado.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'vecinos' and indexname = 'idx_vecinos_municipio_zona';
