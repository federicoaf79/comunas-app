-- =============================================================
-- 20260514_audit_log
--
-- Bitácora de auditoría append-only para todo el sistema
-- COMUNAS. Registra eventos relevantes generados tanto por el
-- frontend (login/logout, accesos a módulos sensibles, exports)
-- como por flujos de negocio (alta/edición/aprobación/rechazo
-- de turnos, gastos, vecinos, expedientes, etc).
--
-- Diseño:
--   - Tabla única `audit_log` con campos genéricos
--     (accion, entidad, entidad_id) + metadata jsonb para el
--     payload específico de cada evento.
--   - Append-only: no hay policy de UPDATE ni DELETE. Una vez
--     escrita la fila, queda inmutable desde la API.
--   - INSERT permitido a cualquier autenticado, pero forzando
--     `actor_id = auth.uid()` vía WITH CHECK — un usuario no
--     puede registrar eventos a nombre de otro.
--   - SELECT acotado por municipio para admin_comuna; el
--     superadmin ve toda la bitácora.
--
-- Acciones tipificadas (texto libre, pero convención):
--   login | logout | create | update | approve | reject
--   delete | export | access
--
-- El archivo se conserva en el repo a modo de REFERENCIA. La
-- instancia de Supabase lo ejecuta a mano (Editor SQL) y
-- verifica que la tabla, índices y policies estén creadas antes
-- de habilitar el cliente de auditoría en el frontend.
-- =============================================================

-- ============================================================
-- 1. TABLA AUDIT_LOG
-- ============================================================

create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  municipio_id uuid references public.municipios(id),
  actor_id     uuid references public.usuarios(id),
  actor_email  text,                 -- snapshot del email del actor en el momento
  accion       text not null,        -- 'login' | 'logout' | 'create' | 'update' | 'approve' | 'reject' | 'delete' | 'export' | 'access'
  entidad      text,                 -- nombre de tabla afectada (turnos, gastos, vecinos, …) o módulo (sala_pa, administracion)
  entidad_id   text,                 -- pk de la fila tocada (text porque puede ser uuid o id custom)
  descripcion  text,                 -- texto libre legible humano
  metadata     jsonb not null default '{}'::jsonb,
  ip           text,                 -- best effort, puede ser null en clients sin acceso
  user_agent   text,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 2. ÍNDICES
-- ============================================================

-- Listado por municipio ordenado por fecha desc — patrón típico
-- del panel de auditoría de admin_comuna.
create index if not exists idx_audit_log_municipio_created
  on public.audit_log (municipio_id, created_at desc);

-- Filtrado "todo lo que hizo el usuario X" en orden cronológico
-- inverso.
create index if not exists idx_audit_log_actor_created
  on public.audit_log (actor_id, created_at desc);

-- Filtrado por tipo de acción (ej. todos los `export` recientes).
create index if not exists idx_audit_log_accion
  on public.audit_log (accion, created_at desc);

-- Lookup directo de "qué pasó con la fila X de la tabla Y".
create index if not exists idx_audit_log_entidad
  on public.audit_log (entidad, entidad_id);

-- ============================================================
-- 3. RLS
-- ============================================================

alter table public.audit_log enable row level security;

-- Limpieza de policies previas con el mismo nombre, para que el
-- script sea idempotente.
drop policy if exists "audit_log select admin_comuna mismo muni" on public.audit_log;
drop policy if exists "audit_log select superadmin todo"         on public.audit_log;
drop policy if exists "audit_log insert self actor"              on public.audit_log;

-- 3.1 SELECT — admin_comuna lee la bitácora de su propio
--     municipio. Usa el helper has_role() ya existente en el
--     resto de policies del proyecto.
create policy "audit_log select admin_comuna mismo muni"
on public.audit_log
for select
to authenticated
using (
  public.has_role('admin_comuna')
  and municipio_id = (
    select municipio_id from public.usuarios where id = auth.uid()
  )
);

-- 3.2 SELECT — superadmin ve toda la auditoría sin filtros.
create policy "audit_log select superadmin todo"
on public.audit_log
for select
to authenticated
using (public.is_superadmin());

-- 3.3 INSERT — cualquier autenticado puede registrar eventos,
--     pero SÓLO a su propio nombre. Esto permite que el frontend
--     loguee acciones del propio usuario sin pasar por un
--     endpoint server-side, manteniendo la integridad del actor.
create policy "audit_log insert self actor"
on public.audit_log
for insert
to authenticated
with check (actor_id = auth.uid());

-- IMPORTANTE: no se crean policies de UPDATE ni DELETE.
-- La bitácora es append-only desde la API. Cualquier limpieza
-- o retención se hace con el rol `postgres` directamente, fuera
-- del flujo normal de la aplicación.

-- ============================================================
-- 4. VERIFICACIÓN
-- ============================================================

-- Columnas de la tabla.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'audit_log'
order by ordinal_position;

-- Índices creados.
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'audit_log'
order by indexname;

-- Policies vigentes (debería listar 3: 2 SELECT + 1 INSERT,
-- ninguna de UPDATE/DELETE).
select policyname, cmd, permissive, roles
from pg_policies
where schemaname = 'public' and tablename = 'audit_log'
order by policyname;
