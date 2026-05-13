-- =============================================================
-- 20260514_turnos_especialidad
--
-- Sprint 3 — Especialidad médica en los turnos del CIC.
--
-- Agrega `especialidad text default 'general'` a public.turnos
-- para que Sala PA pueda diferenciar visualmente turnos de
-- Medicina General, Obstetricia, Ecografía y Posta Sanitaria
-- Rural en el calendario semanal y al crear nuevos turnos.
--
-- Valores soportados por la UI (texto libre, sin CHECK por
-- ahora para no bloquear casos futuros tipo 'pediatra'):
--   general | obstetra | ecografia | posta_rural
--
-- El archivo está en el repo a modo de REFERENCIA. La instancia
-- de Supabase lo ejecuta a mano (Editor SQL) y verifica que la
-- columna esté creada antes de actualizar el frontend.
-- =============================================================

alter table public.turnos
  add column if not exists especialidad text default 'general';

-- Backfill: las filas existentes quedan con NULL hasta el default.
-- Llenamos explícitamente para que las queries que filtran por
-- especialidad no caigan en null por descuido.
update public.turnos
  set especialidad = 'general'
where especialidad is null;

create index if not exists idx_turnos_especialidad
  on public.turnos (dependencia_id, especialidad, fecha_hora desc);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'turnos'
  and column_name = 'especialidad';

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'turnos'
  and indexname = 'idx_turnos_especialidad';
