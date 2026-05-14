-- =============================================================
-- 20260514_obras
--
-- Tabla `obras` — registro de obras públicas municipales
-- (pavimentación, refacciones edilicias, paseos, etc.) que alimenta:
--   - el widget "Obras en curso" del dashboard admin,
--   - la futura página /admin/obras-publicas con el listado completo.
--
-- Estados (CHECK constraint):
--   planificacion · en_ejecucion · demorada · finalizada · cancelada
--
-- Tipos de financiamiento (CHECK constraint):
--   municipal · provincial · nacional · mixto
--
-- RLS: cada usuario ve solo las obras de su municipio; superadmin
-- ve todo. La policy NO usa helpers — resuelve municipio_id por
-- subquery directa contra public.usuarios (mismo criterio que las
-- migrations recientes, para evitar el bug de "cuelga si los
-- helpers RLS no se crearon").
--
-- El archivo está en el repo a modo de REFERENCIA. La instancia
-- de Supabase lo ejecuta a mano (Editor SQL) y verifica con la
-- query final que la tabla y la policy estén creadas.
-- =============================================================

create table if not exists public.obras (
  id                     uuid default gen_random_uuid() primary key,
  municipio_id           uuid references public.municipios(id),
  nombre                 text not null,
  descripcion            text,
  dependencia_id         uuid references public.dependencias(id),
  estado                 text default 'planificacion'
    check (estado in ('planificacion','en_ejecucion','demorada','finalizada','cancelada')),
  porcentaje_avance      int  default 0
    check (porcentaje_avance between 0 and 100),
  fecha_inicio           date,
  fecha_fin_estimada     date,
  fecha_fin_real         date,
  presupuesto_total      numeric(14,2),
  gasto_acumulado        numeric(14,2) default 0,
  -- Nota: el spec original tenía CHECK (tipo IN ...) en lugar de
  -- CHECK (tipo_financiamiento IN ...) — corregido acá para que
  -- el constraint no falle al crear la tabla.
  tipo_financiamiento    text
    check (tipo_financiamiento in ('municipal','provincial','nacional','mixto')),
  partida_presupuestaria text,
  responsable_id         uuid references public.usuarios(id),
  cantidad_obreros       int  default 0,
  tiene_seguro           boolean default false,
  tiene_permisos         boolean default false,
  observaciones          text,
  created_at             timestamptz default now()
);

create index if not exists idx_obras_municipio_estado_inicio
  on public.obras (municipio_id, estado, fecha_inicio desc);

alter table public.obras enable row level security;

drop policy if exists "obras_municipio" on public.obras;
create policy "obras_municipio" on public.obras
  using (
    municipio_id = (select municipio_id from public.usuarios where id = auth.uid())
    or exists (
      select 1 from public.usuarios
      where id = auth.uid() and 'superadmin' = any(roles)
    )
  )
  with check (
    municipio_id = (select municipio_id from public.usuarios where id = auth.uid())
    or exists (
      select 1 from public.usuarios
      where id = auth.uid() and 'superadmin' = any(roles)
    )
  );

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'obras'
order by ordinal_position;

select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'obras';
