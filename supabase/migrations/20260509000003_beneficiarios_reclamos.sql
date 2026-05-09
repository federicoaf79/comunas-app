-- =============================================================
-- Tablas para los módulos genéricos de dependencias:
--   - beneficiarios (Ayuda Social)
--   - reclamos      (Obras Públicas y otros)
--
-- RLS:
--   beneficiarios: SELECT/INSERT/UPDATE/DELETE solo staff del
--                  municipio + superadmin. Datos sensibles —
--                  no se expone a anon.
--   reclamos:      INSERT anon (denuncia pública desde el portal),
--                  SELECT/UPDATE/DELETE solo staff del municipio
--                  + superadmin.
--
-- Helpers asumidos: public.is_staff(), public.is_admin_comuna(),
-- public.is_superadmin(), public.current_usuario_municipio().
--
-- Ejecutar en SQL Editor de Supabase (rol postgres).
-- =============================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. beneficiarios — Ayuda Social
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.beneficiarios (
  id            uuid primary key default gen_random_uuid(),
  municipio_id  uuid not null references public.municipios(id) on delete cascade,
  vecino_id     uuid not null references public.vecinos(id)    on delete cascade,
  tipo_ayuda    text,
  descripcion   text,
  estado        text not null default 'activo'
                check (estado in ('activo','suspendido','baja')),
  fecha_inicio  date not null default current_date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_beneficiarios_municipio
  on public.beneficiarios (municipio_id);
create index if not exists idx_beneficiarios_vecino
  on public.beneficiarios (vecino_id);

drop trigger if exists trg_beneficiarios_updated_at on public.beneficiarios;
create trigger trg_beneficiarios_updated_at
  before update on public.beneficiarios
  for each row execute function public.set_updated_at();

alter table public.beneficiarios enable row level security;

drop policy if exists "beneficiarios_staff_select" on public.beneficiarios;
drop policy if exists "beneficiarios_staff_insert" on public.beneficiarios;
drop policy if exists "beneficiarios_staff_update" on public.beneficiarios;
drop policy if exists "beneficiarios_staff_delete" on public.beneficiarios;

create policy "beneficiarios_staff_select"
on public.beneficiarios for select to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

create policy "beneficiarios_staff_insert"
on public.beneficiarios for insert to authenticated
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

create policy "beneficiarios_staff_update"
on public.beneficiarios for update to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

create policy "beneficiarios_staff_delete"
on public.beneficiarios for delete to authenticated
using (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
);

-- ─────────────────────────────────────────────────────────────────
-- 2. reclamos — Obras Públicas y denuncias ciudadanas
-- ─────────────────────────────────────────────────────────────────

create table if not exists public.reclamos (
  id            uuid primary key default gen_random_uuid(),
  municipio_id  uuid not null references public.municipios(id) on delete cascade,
  vecino_id     uuid references public.vecinos(id) on delete set null,
  tipo          text,
  descripcion   text not null,
  ubicacion     text,
  estado        text not null default 'abierto'
                check (estado in ('abierto','en_proceso','resuelto','cerrado','rechazado')),
  prioridad     text not null default 'normal'
                check (prioridad in ('baja','normal','alta','urgente')),
  canal         text not null default 'presencial'
                check (canal in ('presencial','telefono','web','whatsapp')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_reclamos_municipio_estado
  on public.reclamos (municipio_id, estado);
create index if not exists idx_reclamos_vecino
  on public.reclamos (vecino_id);

drop trigger if exists trg_reclamos_updated_at on public.reclamos;
create trigger trg_reclamos_updated_at
  before update on public.reclamos
  for each row execute function public.set_updated_at();

alter table public.reclamos enable row level security;

drop policy if exists "reclamos_anon_insert"   on public.reclamos;
drop policy if exists "reclamos_staff_select"  on public.reclamos;
drop policy if exists "reclamos_staff_insert"  on public.reclamos;
drop policy if exists "reclamos_staff_update"  on public.reclamos;
drop policy if exists "reclamos_staff_delete"  on public.reclamos;

-- INSERT anon — habilita la presentación de denuncias públicas
-- desde el portal sin login. El vecino puede dejar vecino_id null
-- (anónimo) o linkearse vía DNI desde la sesión de "mi cuenta".
create policy "reclamos_anon_insert"
on public.reclamos for insert to anon
with check (true);

-- INSERT authenticated — el staff puede registrar reclamos
-- presenciales en nombre del vecino.
create policy "reclamos_staff_insert"
on public.reclamos for insert to authenticated
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- SELECT solo staff — los reclamos NO se exponen a anon (privacidad
-- del denunciante; un vecino puede ver los suyos vía RPC dedicada
-- en una iteración futura).
create policy "reclamos_staff_select"
on public.reclamos for select to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

create policy "reclamos_staff_update"
on public.reclamos for update to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

create policy "reclamos_staff_delete"
on public.reclamos for delete to authenticated
using (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
);

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('beneficiarios','reclamos');

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename in ('beneficiarios','reclamos')
order by tablename, cmd, policyname;
