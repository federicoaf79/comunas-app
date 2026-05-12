-- =============================================================
-- 20260512000003_oc_borrador_y_link_gasto
--
-- Flujo SubAdmin → Comuna → Inventario:
--   - SubAdmin crea una "Solicitud de insumos" → orden en estado
--     'borrador'.
--   - El borrador no aparece en la cola de aprobación del Admin
--     Comuna hasta que el SubAdmin lo "Envía a aprobación"
--     (estado='pendiente').
--   - Al aprobar, useUpdateOrdenEstado crea (o promueve) un gasto.
--     Para que la promoción funcione sin duplicar, agregamos
--     ordenes_compra.gasto_id como FK opcional al gasto asociado.
--
-- Cambios:
--   1. CHECK de ordenes_compra.estado incluye 'borrador'.
--   2. Nueva columna ordenes_compra.gasto_id → gastos(id) NULLABLE.
--   3. Índice por (municipio_id, estado) para el listado por cola.
--
-- Idempotente.
-- =============================================================

-- 1. Permitir 'borrador' en el CHECK de estado ----------------
do $$
declare
  c_name text;
begin
  -- Buscamos el CHECK existente sobre la columna estado. Su nombre
  -- depende de cómo se creó la tabla (puede ser autogen o explícito).
  select con.conname
    into c_name
  from pg_constraint con
  join pg_class    cls on cls.oid = con.conrelid
  join pg_namespace ns on ns.oid = cls.relnamespace
  where ns.nspname = 'public'
    and cls.relname = 'ordenes_compra'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%estado%'
  limit 1;

  if c_name is not null then
    execute format('alter table public.ordenes_compra drop constraint %I', c_name);
  end if;
end$$;

alter table public.ordenes_compra
  add constraint ordenes_compra_estado_check
  check (estado in ('borrador','pendiente','aprobada','rechazada'));

-- 2. Columna gasto_id (FK a gastos) ---------------------------
alter table public.ordenes_compra
  add column if not exists gasto_id uuid
    references public.gastos(id) on delete set null;

-- 3. Índices --------------------------------------------------
create index if not exists idx_ordenes_compra_estado
  on public.ordenes_compra (municipio_id, estado, fecha desc);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select conname, pg_get_constraintdef(oid) as definicion
from pg_constraint
where conrelid = 'public.ordenes_compra'::regclass
  and contype  = 'c';

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'ordenes_compra'
  and column_name in ('estado','gasto_id')
order by column_name;
