-- =============================================================
-- COMUNAS — schema inicial
-- CRM/ERP municipal para comisiones de Santiago del Estero
-- =============================================================

create extension if not exists "pgcrypto";

-- =============================================================
-- 1. TABLAS
-- =============================================================

-- Municipios (comisiones municipales)
create table public.municipios (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  slug        text not null unique,
  provincia   text not null default 'Santiago del Estero',
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Dependencias (organismos del municipio: intendencia, CAPS, juzgado, etc.)
-- capa: 1 = núcleo institucional / 2 = servicios secundarios
create table public.dependencias (
  id            uuid primary key default gen_random_uuid(),
  municipio_id  uuid not null references public.municipios(id) on delete cascade,
  nombre        text not null,
  tipo          text not null,
  capa          smallint not null default 1 check (capa between 1 and 3),
  parent_id     uuid references public.dependencias(id) on delete set null,
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Usuarios (staff del municipio). id = auth.users.id
create table public.usuarios (
  id                uuid primary key references auth.users(id) on delete cascade,
  municipio_id      uuid references public.municipios(id) on delete set null,
  roles             text[] not null default '{}'::text[],
  dependencias_ids  uuid[] not null default '{}'::uuid[],
  nombre            text not null,
  email             text not null,
  telefono          text,
  activo            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Vecinos (ciudadanos del municipio).
-- user_id es nullable: muchos vecinos están en el padrón sin acceso al portal.
create table public.vecinos (
  id            uuid primary key default gen_random_uuid(),
  municipio_id  uuid not null references public.municipios(id) on delete cascade,
  user_id       uuid unique references auth.users(id) on delete set null,
  dni           text,
  apellido      text not null,
  nombre        text not null,
  fecha_nac     date,
  sexo          text check (sexo in ('F','M','X')),
  telefono      text,
  email         text,
  direccion     text,
  localidad     text,
  notas         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (municipio_id, dni)
);

-- HC: consultas (historia clínica del CAPS)
create table public.hc_consultas (
  id              uuid primary key default gen_random_uuid(),
  municipio_id    uuid not null references public.municipios(id) on delete cascade,
  vecino_id       uuid not null references public.vecinos(id) on delete cascade,
  dependencia_id  uuid not null references public.dependencias(id) on delete restrict,
  medico_id       uuid references public.usuarios(id) on delete set null,
  fecha           timestamptz not null default now(),
  motivo          text,
  diagnostico     text,
  indicaciones    text,
  signos_vitales  jsonb,
  created_by      uuid references public.usuarios(id) on delete set null,
  created_at      timestamptz not null default now()
);

-- HC: documentos adjuntos (storage_path apunta a Supabase Storage)
create table public.hc_documentos (
  id            uuid primary key default gen_random_uuid(),
  municipio_id  uuid not null references public.municipios(id) on delete cascade,
  vecino_id     uuid not null references public.vecinos(id) on delete cascade,
  consulta_id   uuid references public.hc_consultas(id) on delete set null,
  tipo          text not null check (tipo in ('estudio','receta','informe','imagen','otro')),
  descripcion   text,
  storage_path  text not null,
  mime_type     text,
  uploaded_by   uuid references public.usuarios(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- Médicos: agenda (slots semanales recurrentes)
create table public.medicos_agenda (
  id              uuid primary key default gen_random_uuid(),
  municipio_id    uuid not null references public.municipios(id) on delete cascade,
  medico_id       uuid not null references public.usuarios(id) on delete cascade,
  dependencia_id  uuid not null references public.dependencias(id) on delete cascade,
  dia_semana      smallint not null check (dia_semana between 0 and 6),
  hora_inicio     time not null,
  hora_fin        time not null check (hora_fin > hora_inicio),
  duracion_min    smallint not null default 20 check (duracion_min > 0),
  vigente_desde   date not null default current_date,
  vigente_hasta   date,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- Turnos
create table public.turnos (
  id              uuid primary key default gen_random_uuid(),
  municipio_id    uuid not null references public.municipios(id) on delete cascade,
  vecino_id       uuid not null references public.vecinos(id) on delete cascade,
  medico_id       uuid references public.usuarios(id) on delete set null,
  dependencia_id  uuid not null references public.dependencias(id) on delete restrict,
  fecha           date not null,
  hora_inicio     time not null,
  hora_fin        time,
  estado          text not null default 'reservado'
                  check (estado in ('reservado','confirmado','atendido','ausente','cancelado')),
  motivo          text,
  notas           text,
  created_by      uuid references public.usuarios(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- SMS log (Twilio)
create table public.sms_log (
  id            uuid primary key default gen_random_uuid(),
  municipio_id  uuid not null references public.municipios(id) on delete cascade,
  vecino_id     uuid references public.vecinos(id) on delete set null,
  telefono      text not null,
  mensaje       text not null,
  estado        text not null default 'queued'
                check (estado in ('queued','sent','delivered','failed','undelivered')),
  twilio_sid    text,
  error_code    text,
  error_message text,
  enviado_por   uuid references public.usuarios(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Denuncias / reclamos
create table public.denuncias (
  id              uuid primary key default gen_random_uuid(),
  municipio_id    uuid not null references public.municipios(id) on delete cascade,
  vecino_id       uuid references public.vecinos(id) on delete set null,
  dependencia_id  uuid references public.dependencias(id) on delete set null,
  tipo            text not null,
  asunto          text not null,
  descripcion     text not null,
  ubicacion       text,
  estado          text not null default 'abierta'
                  check (estado in ('abierta','en_proceso','resuelta','cerrada','rechazada')),
  asignado_a      uuid references public.usuarios(id) on delete set null,
  resolucion      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Noticias / anuncios públicos
create table public.noticias (
  id                 uuid primary key default gen_random_uuid(),
  municipio_id       uuid not null references public.municipios(id) on delete cascade,
  titulo             text not null,
  resumen            text,
  contenido          text not null,
  imagen_url         text,
  publicado          boolean not null default false,
  fecha_publicacion  timestamptz,
  autor_id           uuid references public.usuarios(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Reservas del SUM (Salón de Usos Múltiples)
create table public.sum_reservas (
  id              uuid primary key default gen_random_uuid(),
  municipio_id    uuid not null references public.municipios(id) on delete cascade,
  vecino_id       uuid not null references public.vecinos(id) on delete cascade,
  dependencia_id  uuid references public.dependencias(id) on delete set null,
  fecha           date not null,
  hora_inicio     time not null,
  hora_fin        time not null check (hora_fin > hora_inicio),
  motivo          text not null,
  cant_personas   integer,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','aprobada','rechazada','cancelada','realizada')),
  aprobado_por    uuid references public.usuarios(id) on delete set null,
  notas_admin     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- =============================================================
-- 2. ÍNDICES
-- =============================================================

create index idx_dependencias_municipio       on public.dependencias (municipio_id);
create index idx_usuarios_municipio           on public.usuarios (municipio_id);
create index idx_usuarios_roles_gin           on public.usuarios using gin (roles);
create index idx_usuarios_deps_gin            on public.usuarios using gin (dependencias_ids);
create index idx_vecinos_municipio            on public.vecinos (municipio_id);
create index idx_vecinos_apellido_nombre      on public.vecinos (apellido, nombre);
create index idx_vecinos_dni                  on public.vecinos (dni);
create index idx_vecinos_user_id              on public.vecinos (user_id);
create index idx_hc_consultas_vecino          on public.hc_consultas (vecino_id);
create index idx_hc_consultas_medico          on public.hc_consultas (medico_id);
create index idx_hc_consultas_municipio_fecha on public.hc_consultas (municipio_id, fecha desc);
create index idx_hc_docs_vecino               on public.hc_documentos (vecino_id);
create index idx_hc_docs_consulta             on public.hc_documentos (consulta_id);
create index idx_agenda_medico                on public.medicos_agenda (medico_id);
create index idx_agenda_dep_dia               on public.medicos_agenda (dependencia_id, dia_semana);
create index idx_turnos_vecino                on public.turnos (vecino_id);
create index idx_turnos_medico                on public.turnos (medico_id);
create index idx_turnos_dep_fecha             on public.turnos (dependencia_id, fecha);
create index idx_turnos_municipio_fecha       on public.turnos (municipio_id, fecha);
create index idx_sms_municipio_fecha          on public.sms_log (municipio_id, created_at desc);
create index idx_sms_vecino                   on public.sms_log (vecino_id);
create index idx_denuncias_municipio_estado   on public.denuncias (municipio_id, estado);
create index idx_denuncias_vecino             on public.denuncias (vecino_id);
create index idx_denuncias_asignado           on public.denuncias (asignado_a);
create index idx_noticias_municipio_pub       on public.noticias (municipio_id, publicado, fecha_publicacion desc);
create index idx_sum_municipio_fecha          on public.sum_reservas (municipio_id, fecha);
create index idx_sum_vecino                   on public.sum_reservas (vecino_id);

-- =============================================================
-- 3. TRIGGERS updated_at
-- =============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_usuarios_updated_at     before update on public.usuarios     for each row execute function public.set_updated_at();
create trigger trg_vecinos_updated_at      before update on public.vecinos      for each row execute function public.set_updated_at();
create trigger trg_turnos_updated_at       before update on public.turnos       for each row execute function public.set_updated_at();
create trigger trg_sms_log_updated_at      before update on public.sms_log      for each row execute function public.set_updated_at();
create trigger trg_denuncias_updated_at    before update on public.denuncias    for each row execute function public.set_updated_at();
create trigger trg_noticias_updated_at     before update on public.noticias     for each row execute function public.set_updated_at();
create trigger trg_sum_reservas_updated_at before update on public.sum_reservas for each row execute function public.set_updated_at();

-- =============================================================
-- 4. HELPERS RLS
-- SECURITY DEFINER + search_path bloqueado para evitar recursión
-- en las policies de la tabla `usuarios`.
-- =============================================================

create or replace function public.current_usuario_municipio()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select municipio_id from public.usuarios where id = auth.uid() and activo = true;
$$;

create or replace function public.current_vecino_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.vecinos where user_id = auth.uid();
$$;

create or replace function public.has_role(_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _role = any(coalesce(
    (select roles from public.usuarios where id = auth.uid() and activo = true),
    '{}'::text[]
  ));
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select 'superadmin' = any(coalesce(
    (select roles from public.usuarios where id = auth.uid() and activo = true),
    '{}'::text[]
  ));
$$;

create or replace function public.is_admin_comuna()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select 'admin_comuna' = any(coalesce(
    (select roles from public.usuarios where id = auth.uid() and activo = true),
    '{}'::text[]
  ));
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios
    where id = auth.uid() and activo = true
      and roles && array['superadmin','admin_comuna','operador']
  );
$$;

create or replace function public.in_dep(_dep_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _dep_id = any(coalesce(
    (select dependencias_ids from public.usuarios where id = auth.uid() and activo = true),
    '{}'::uuid[]
  ));
$$;

create or replace function public.current_vecino_municipio()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select municipio_id from public.vecinos where user_id = auth.uid();
$$;

-- =============================================================
-- 5. ENABLE RLS
-- =============================================================

alter table public.municipios      enable row level security;
alter table public.dependencias    enable row level security;
alter table public.usuarios        enable row level security;
alter table public.vecinos         enable row level security;
alter table public.hc_consultas    enable row level security;
alter table public.hc_documentos   enable row level security;
alter table public.medicos_agenda  enable row level security;
alter table public.turnos          enable row level security;
alter table public.sms_log         enable row level security;
alter table public.denuncias       enable row level security;
alter table public.noticias        enable row level security;
alter table public.sum_reservas    enable row level security;

-- =============================================================
-- 6. POLICIES
-- =============================================================

-- ---------- municipios ----------
create policy "municipios_select_propio" on public.municipios
for select using (
  public.is_superadmin()
  or id = public.current_usuario_municipio()
  or id = public.current_vecino_municipio()
);

create policy "municipios_super_all" on public.municipios
for all using (public.is_superadmin())
with check (public.is_superadmin());

-- ---------- dependencias ----------
create policy "dependencias_select" on public.dependencias
for select using (
  public.is_superadmin()
  or municipio_id = public.current_usuario_municipio()
  or municipio_id = public.current_vecino_municipio()
);

create policy "dependencias_admin" on public.dependencias
for all using (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
);

-- ---------- usuarios ----------
create policy "usuarios_self_select" on public.usuarios
for select using (
  id = auth.uid()
  or public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
);

create policy "usuarios_self_update" on public.usuarios
for update using (id = auth.uid())
with check (id = auth.uid());

create policy "usuarios_admin_all" on public.usuarios
for all using (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
);

-- ---------- vecinos ----------
create policy "vecinos_self_select" on public.vecinos
for select using (user_id = auth.uid());

create policy "vecinos_self_update" on public.vecinos
for update using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "vecinos_staff_all" on public.vecinos
for all using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- ---------- hc_consultas ----------
create policy "hc_consultas_vecino_lee_propias" on public.hc_consultas
for select using (vecino_id = public.current_vecino_id());

create policy "hc_consultas_staff" on public.hc_consultas
for all using (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
  or (public.is_staff() and municipio_id = public.current_usuario_municipio() and public.in_dep(dependencia_id))
)
with check (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
  or (public.is_staff() and municipio_id = public.current_usuario_municipio() and public.in_dep(dependencia_id))
);

-- ---------- hc_documentos ----------
create policy "hc_docs_vecino_lee" on public.hc_documentos
for select using (vecino_id = public.current_vecino_id());

create policy "hc_docs_staff" on public.hc_documentos
for all using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- ---------- medicos_agenda ----------
create policy "agenda_select_publico_municipio" on public.medicos_agenda
for select using (
  public.is_superadmin()
  or municipio_id = public.current_usuario_municipio()
  or municipio_id = public.current_vecino_municipio()
);

create policy "agenda_write_admin_o_propia" on public.medicos_agenda
for all using (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
  or (medico_id = auth.uid() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
  or (medico_id = auth.uid() and municipio_id = public.current_usuario_municipio())
);

-- ---------- turnos ----------
create policy "turnos_vecino_lee_propios" on public.turnos
for select using (vecino_id = public.current_vecino_id());

create policy "turnos_vecino_crea_propios" on public.turnos
for insert with check (vecino_id = public.current_vecino_id());

create policy "turnos_vecino_actualiza_propios" on public.turnos
for update using (vecino_id = public.current_vecino_id())
with check (vecino_id = public.current_vecino_id());

create policy "turnos_staff_all" on public.turnos
for all using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- ---------- sms_log ----------
create policy "sms_log_staff" on public.sms_log
for all using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- ---------- denuncias ----------
create policy "denuncias_vecino_propias" on public.denuncias
for select using (vecino_id = public.current_vecino_id());

create policy "denuncias_vecino_crea" on public.denuncias
for insert with check (vecino_id = public.current_vecino_id());

create policy "denuncias_staff" on public.denuncias
for all using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- ---------- noticias ----------
create policy "noticias_publicadas_publicas" on public.noticias
for select using (publicado = true);

create policy "noticias_staff_lee_todo" on public.noticias
for select using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

create policy "noticias_admin_escribe" on public.noticias
for all using (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_admin_comuna() and municipio_id = public.current_usuario_municipio())
);

-- ---------- sum_reservas ----------
create policy "sum_vecino_lee_propias" on public.sum_reservas
for select using (vecino_id = public.current_vecino_id());

create policy "sum_vecino_crea" on public.sum_reservas
for insert with check (vecino_id = public.current_vecino_id());

create policy "sum_staff" on public.sum_reservas
for all using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
)
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- =============================================================
-- 7. SEED — Real Sayana (municipio piloto)
-- 5 dependencias: 3 de capa 1 (institucionales) + 2 de capa 2 (servicios)
-- =============================================================

do $seed$
declare
  v_municipio_id uuid;
begin
  insert into public.municipios (nombre, slug, provincia, activo)
  values ('Real Sayana', 'real-sayana', 'Santiago del Estero', true)
  returning id into v_municipio_id;

  insert into public.dependencias (municipio_id, nombre, tipo, capa) values
    (v_municipio_id, 'Intendencia Real Sayana',       'intendencia',  1),
    (v_municipio_id, 'CAPS Real Sayana',              'caps',         1),
    (v_municipio_id, 'Juzgado de Paz',                'juzgado',      1),
    (v_municipio_id, 'Oficina de Tierras y Catastro', 'catastro',     2),
    (v_municipio_id, 'Bromatología',                  'bromatologia', 2);
end
$seed$;
