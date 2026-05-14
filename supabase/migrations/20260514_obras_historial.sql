-- =============================================================
-- 20260514_obras_historial
--
-- Sigue a 20260514_obras.sql. Agrega:
--   1. Columna `forma_pago` a obras (licitacion | cotizacion | compra_directa)
--   2. Tabla `obras_historial` para registrar cada cambio de estado
--      o nota de seguimiento, con fecha, usuario y nota libre.
--
-- El historial lo escribe la mutación de update desde el frontend:
-- cada vez que cambia el `estado` o el `porcentaje_avance` se inserta
-- una fila acá con el usuario que hizo el cambio. La UI lo lee
-- en el detalle de la obra y lo muestra como tabla cronológica.
-- =============================================================

-- 1) Columna forma_pago. CHECK separado para soportar NULL (las
--    obras antiguas que no la tengan cargada quedan con NULL).
alter table public.obras
  add column if not exists forma_pago text
    check (forma_pago in ('licitacion','cotizacion','compra_directa'));

-- 2) Tabla obras_historial.
create table if not exists public.obras_historial (
  id               uuid default gen_random_uuid() primary key,
  obra_id          uuid not null references public.obras(id) on delete cascade,
  usuario_id       uuid references public.usuarios(id),
  estado_anterior  text,
  estado_nuevo     text,
  avance_anterior  int,
  avance_nuevo     int,
  nota             text,
  created_at       timestamptz default now()
);

create index if not exists idx_obras_historial_obra_fecha
  on public.obras_historial (obra_id, created_at desc);

alter table public.obras_historial enable row level security;

drop policy if exists "obras_historial_municipio" on public.obras_historial;
create policy "obras_historial_municipio" on public.obras_historial
  using (
    exists (
      select 1
      from public.obras o
      join public.usuarios u on u.id = auth.uid()
      where o.id = obras_historial.obra_id
        and (o.municipio_id = u.municipio_id or 'superadmin' = any(u.roles))
    )
  )
  with check (
    exists (
      select 1
      from public.obras o
      join public.usuarios u on u.id = auth.uid()
      where o.id = obras_historial.obra_id
        and (o.municipio_id = u.municipio_id or 'superadmin' = any(u.roles))
    )
  );

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'obras'
  and column_name = 'forma_pago';

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'obras_historial'
order by ordinal_position;

select policyname, cmd
from pg_policies
where schemaname = 'public' and tablename = 'obras_historial';
