-- =============================================================
-- 20260514_vecinos_hc_obligatorios
--
-- Sala PA: campos obligatorios para crear la primera Historia
-- Clínica de un vecino. Las columnas se agregan a `public.vecinos`
-- y todas son NULLABLE — el enforcement de "obligatorio" lo hace
-- la UI al crear el vecino desde Sala PA (TurnoPresencialModal).
-- Permitir NULL evita romper los vecinos antiguos cargados antes
-- de Sala PA y permite el banner "HC incompleta — completá los
-- campos antes de continuar" para esos casos.
--
-- Campos agregados:
--   grupo_sanguineo            text (CHECK con valores válidos)
--   alergias                   text[] (array, puede ser vacío)
--   sin_alergias_conocidas     boolean (checkbox de confirmación
--                                       cuando alergias = [])
--   contacto_emergencia_nombre   text
--   contacto_emergencia_telefono text
--
-- Nota: la columna `sexo` ya existe con CHECK ('F','M','X'). La
-- UI muestra 'X' como "Otro" — no se altera el constraint para
-- no migrar datos viejos.
-- =============================================================

alter table public.vecinos
  add column if not exists grupo_sanguineo text
    check (grupo_sanguineo in ('A+','A-','B+','B-','AB+','AB-','O+','O-'));

alter table public.vecinos
  add column if not exists alergias text[] default '{}'::text[];

alter table public.vecinos
  add column if not exists sin_alergias_conocidas boolean default false;

alter table public.vecinos
  add column if not exists contacto_emergencia_nombre text;

alter table public.vecinos
  add column if not exists contacto_emergencia_telefono text;

-- Índice por dni dentro del municipio ya existe vía UNIQUE
-- (municipio_id, dni) — no agrego otro.

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'vecinos'
  and column_name in (
    'grupo_sanguineo',
    'alergias',
    'sin_alergias_conocidas',
    'contacto_emergencia_nombre',
    'contacto_emergencia_telefono'
  )
order by column_name;
