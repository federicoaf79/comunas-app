-- =============================================================
-- 20260724_vales_electronicos_fase0
--
-- Fase 0 del sprint Vales Electrónicos — módulo activable por
-- tenant vía modulos_config (mismo mecanismo que sala_pa/juez_paz).
-- Diseño aditivo: tablas nuevas, sin tocar nada existente.
--
-- Revisado y confirmado con el usuario antes de aplicar (ver
-- vales_rls_proposal.sql, iteración v2, sesión 2026-07-24).
-- =============================================================

-- =============================================================
-- 1. TABLAS
-- =============================================================

-- proveedores — comercios adheridos al programa de vales.
create table if not exists public.proveedores (
  id           uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references public.municipios(id) on delete cascade,
  nombre       text not null,
  categoria    text,
  telefono     text,
  direccion    text,
  activo       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists idx_proveedores_municipio on public.proveedores(municipio_id);

-- proveedor_accesos — qué vecinos operan la cuenta de un proveedor
-- (dueño/responsable del comercio, o un empleado secundario).
create table if not exists public.proveedor_accesos (
  id           uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores(id) on delete cascade,
  vecino_id    uuid not null references public.vecinos(id) on delete cascade,
  rol          text not null check (rol in ('responsable', 'secundario')),
  activo       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists idx_proveedor_accesos_proveedor on public.proveedor_accesos(proveedor_id);
create index if not exists idx_proveedor_accesos_vecino    on public.proveedor_accesos(vecino_id);
-- Un vecino no debería tener dos filas de acceso al mismo proveedor.
create unique index if not exists uq_proveedor_accesos_proveedor_vecino
  on public.proveedor_accesos(proveedor_id, vecino_id);

-- vales — el vale electrónico en sí.
create table if not exists public.vales (
  id                 uuid primary key default gen_random_uuid(),
  municipio_id       uuid not null references public.municipios(id) on delete cascade,
  vecino_id          uuid not null references public.vecinos(id) on delete restrict,
  proveedor_id       uuid not null references public.proveedores(id) on delete restrict,
  descripcion        text not null,
  monto              numeric,
  cantidad           numeric,
  unidad             text,
  codigo             text not null unique,
  estado             text not null default 'emitido'
                       check (estado in ('emitido', 'abierto', 'canjeado', 'vencido', 'cancelado')),
  vigencia_horas     integer not null default 48
                       check (vigencia_horas in (24, 48, 72)),
  emitido_en         timestamptz not null default now(),
  emitido_por        uuid not null references public.usuarios(id) on delete restrict,
  abierto_en         timestamptz,
  vence_apertura_en  timestamptz,
  canjeado_en        timestamptz,
  -- on delete set null (no restrict): es una referencia de auditoría
  -- ("quién canjeó"), no la identidad núcleo del vale (esa es
  -- vecino_id/proveedor_id, que sí son restrict) — no bloquea borrar
  -- un vecino-proveedor viejo solo porque canjeó algo alguna vez.
  canjeado_por       uuid references public.vecinos(id) on delete set null,

  -- Exactamente uno de los dos caminos completo: monto SOLO, o
  -- cantidad+unidad SOLOS. La validación fuerte del form vive en el
  -- cliente (Fase 1+); este CHECK es un piso de integridad en la DB
  -- por si un bug de UI intenta guardar ambos o ninguno.
  constraint chk_vales_monto_o_cantidad check (
    (monto is not null and cantidad is null     and unidad is null)
    or
    (monto is null     and cantidad is not null and unidad is not null)
  )
);

create index if not exists idx_vales_municipio  on public.vales(municipio_id);
create index if not exists idx_vales_vecino      on public.vales(vecino_id);
create index if not exists idx_vales_proveedor   on public.vales(proveedor_id);
create index if not exists idx_vales_estado      on public.vales(estado);

-- =============================================================
-- 2. Permiso puntual de emisión — usuarios.puede_emitir_vales
--
-- NO es una capacidad de todo staff del municipio: es un permiso que
-- admin_comuna otorga a un usuario puntual (toggle en Usuarios.jsx,
-- Fase 0 más abajo en el código JS). Columna booleana simple, mismo
-- patrón que la ya existente `usuarios.activo` — se descartó
-- extender `dependencias_acceso` (jsonb) porque ese mecanismo está
-- modelado específicamente para capacidades POR DEPENDENCIA (Sala
-- PA, Juzgado, SUM) y Vales no es una dependencia.
-- =============================================================
alter table public.usuarios
  add column if not exists puede_emitir_vales boolean not null default false;

-- =============================================================
-- 3. Helper — ¿está activo el módulo 'vales' para este municipio?
--
-- Falla CERRADO si no hay fila en modulos_config — a diferencia del
-- fallback "todo activo" de useTieneModulo() en el front (esa es una
-- concesión de UX para no romper el sidebar en instancias legacy;
-- acá se trata de RLS sobre datos que mueven valor real, así que se
-- prefiere fail-closed).
-- =============================================================
create or replace function public.modulo_vales_activo(p_municipio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.modulos_config
    where municipio_id = p_municipio_id
      and modulo = 'vales'
      and activo = true
  );
$$;

-- =============================================================
-- 4. RLS — proveedores
-- =============================================================
alter table public.proveedores enable row level security;

-- Staff CRUD, propio municipio + módulo activo. NO exige
-- puede_emitir_vales -- gestionar proveedores no es emitir vales.
create policy "proveedores_staff_all" on public.proveedores
  for all
  using (
    public.is_superadmin()
    or (
      public.is_staff()
      and municipio_id = public.current_usuario_municipio()
      and public.modulo_vales_activo(municipio_id)
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_staff()
      and municipio_id = public.current_usuario_municipio()
      and public.modulo_vales_activo(municipio_id)
    )
  );

-- Vecino: SELECT de proveedores activos de su propio municipio.
-- Necesario para que el embed proveedor:proveedor_id(...) funcione
-- al listar sus vales (no estaba en el pedido explícito).
create policy "proveedores_vecino_select_activos" on public.proveedores
  for select
  using (
    activo = true
    and municipio_id = (select v.municipio_id from public.vecinos v where v.id = public.current_vecino_id())
  );

-- =============================================================
-- 5. RLS — proveedor_accesos
-- =============================================================
alter table public.proveedor_accesos enable row level security;

-- Staff CRUD vía el proveedor (mismo municipio + módulo activo).
-- Tampoco exige puede_emitir_vales -- dar de alta a un operador de
-- comercio es gestión de proveedores, no emisión.
create policy "proveedor_accesos_staff_all" on public.proveedor_accesos
  for all
  using (
    public.is_superadmin()
    or exists (
      select 1 from public.proveedores p
      where p.id = proveedor_accesos.proveedor_id
        and p.municipio_id = public.current_usuario_municipio()
        and public.modulo_vales_activo(p.municipio_id)
    )
  )
  with check (
    public.is_superadmin()
    or exists (
      select 1 from public.proveedores p
      where p.id = proveedor_accesos.proveedor_id
        and p.municipio_id = public.current_usuario_municipio()
        and public.modulo_vales_activo(p.municipio_id)
    )
  );

-- Vecino: SELECT de sus propios accesos (para que el front sepa "soy
-- operador de tal proveedor"). Sin INSERT/UPDATE/DELETE para vecino
-- — solo staff gestiona accesos.
create policy "proveedor_accesos_vecino_select_self" on public.proveedor_accesos
  for select
  using (vecino_id = public.current_vecino_id());

-- =============================================================
-- 6. RLS — vales
-- =============================================================
alter table public.vales enable row level security;

-- SELECT / UPDATE / DELETE: cualquier staff del municipio con el
-- módulo activo -- SIN exigir puede_emitir_vales (ese permiso solo
-- gatea la emisión/INSERT, no ver o cancelar vales existentes).
create policy "vales_staff_select" on public.vales
  for select
  using (
    public.is_superadmin()
    or (
      public.is_staff()
      and municipio_id = public.current_usuario_municipio()
      and public.modulo_vales_activo(municipio_id)
    )
  );

create policy "vales_staff_update" on public.vales
  for update
  using (
    public.is_superadmin()
    or (
      public.is_staff()
      and municipio_id = public.current_usuario_municipio()
      and public.modulo_vales_activo(municipio_id)
    )
  )
  with check (
    public.is_superadmin()
    or (
      public.is_staff()
      and municipio_id = public.current_usuario_municipio()
      and public.modulo_vales_activo(municipio_id)
    )
  );

create policy "vales_staff_delete" on public.vales
  for delete
  using (
    public.is_superadmin()
    or (
      public.is_staff()
      and municipio_id = public.current_usuario_municipio()
      and public.modulo_vales_activo(municipio_id)
    )
  );

-- INSERT (emitir): ADEMÁS exige puede_emitir_vales = true en la fila
-- del usuario que emite. Junto con el gate de sidebar/ruta en el
-- front, esto impide que cualquier operador emita vales sin que
-- admin_comuna se lo haya habilitado explícitamente.
create policy "vales_staff_insert" on public.vales
  for insert
  with check (
    public.is_superadmin()
    or (
      public.is_staff()
      and municipio_id = public.current_usuario_municipio()
      and public.modulo_vales_activo(municipio_id)
      and exists (
        select 1 from public.usuarios u
        where u.id = auth.uid()
          and u.activo = true
          and u.puede_emitir_vales = true
      )
    )
  );

-- Vecino (beneficiario): SELECT de sus propios vales. Sin UPDATE —
-- los cambios de estado van por RPC (canjear_vale/abrir_vale más
-- abajo), nunca por UPDATE directo desde el cliente.
create policy "vales_vecino_select_propios" on public.vales
  for select
  using (vecino_id = public.current_vecino_id());

-- Vecino con acceso a un proveedor: SELECT de los vales de SU
-- proveedor, en ventana válida (emitido o abierto, no vencido).
-- Necesario para que la pantalla del proveedor muestre el detalle
-- de un vale escaneado ANTES de llamar a canjear_vale(). Tampoco
-- tiene UPDATE — el canje es exclusivamente vía RPC.
create policy "vales_proveedor_select_ventana" on public.vales
  for select
  using (
    exists (
      select 1 from public.proveedor_accesos pa
      where pa.proveedor_id = vales.proveedor_id
        and pa.vecino_id    = public.current_vecino_id()
        and pa.activo       = true
    )
    and estado in ('emitido', 'abierto')
    and (vence_apertura_en is null or now() <= vence_apertura_en)
  );

-- =============================================================
-- 7. RPC: canjear_vale — ÚNICO camino para marcar un vale canjeado.
--
-- SECURITY DEFINER: corre con los privilegios del dueño de la
-- función, no con los del rol `authenticated` -- por eso NO hace
-- falta (ni conviene) una policy de UPDATE en `vales` para el rol
-- vecino/proveedor: sin esa policy, un UPDATE directo a la tabla
-- queda bloqueado por RLS y el ÚNICO camino de escritura posible
-- para ese rol es esta función. Column-scoping real, no por
-- convención de cliente.
--
-- Identidad de quien ejecuta: se deriva de current_vecino_id()
-- (auth.uid() de la sesión), NO se recibe como parámetro -- aceptar
-- un p_vecino_id del cliente permitiría que alguien reclame ser
-- otro vecino con solo cambiar el payload del RPC.
--
-- Validación atómica, en este orden exacto:
--   1) el vale existe
--   2) quien ejecuta tiene proveedor_accesos activo para EL
--      proveedor de ESE vale
--   3) el vale está en estado 'abierto' (ni 'emitido' sin abrir,
--      ni 'canjeado', ni 'vencido', ni 'cancelado')
--   4) no pasó vence_apertura_en
-- Si cualquiera falla: excepción clara, no se actualiza nada.
-- =============================================================
create or replace function public.canjear_vale(p_codigo text)
returns public.vales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vale    public.vales;
  v_exec_id uuid := public.current_vecino_id();
begin
  if v_exec_id is null then
    raise exception 'Sesión de vecino no encontrada';
  end if;

  -- FOR UPDATE: lockea la fila. Si dos terminales escanean el mismo
  -- vale casi al mismo tiempo, la segunda transacción espera a que
  -- la primera confirme/falle antes de re-leer el estado ya
  -- actualizado -- evita doble canje en carrera.
  select * into v_vale
  from public.vales
  where codigo = p_codigo
  for update;

  if not found then
    raise exception 'Vale no encontrado';
  end if;

  if not exists (
    select 1 from public.proveedor_accesos pa
    where pa.proveedor_id = v_vale.proveedor_id
      and pa.vecino_id    = v_exec_id
      and pa.activo       = true
  ) then
    raise exception 'No tenés acceso a este proveedor';
  end if;

  if v_vale.estado <> 'abierto' then
    raise exception 'Vale no canjeable (estado actual: %)', v_vale.estado;
  end if;

  if v_vale.vence_apertura_en is null or now() > v_vale.vence_apertura_en then
    raise exception 'Venció la ventana de canje';
  end if;

  update public.vales
  set estado       = 'canjeado',
      canjeado_en  = now(),
      canjeado_por = v_exec_id
  where id = v_vale.id
  returning * into v_vale;

  return v_vale;
end;
$$;

revoke all on function public.canjear_vale(text) from public;
grant execute on function public.canjear_vale(text) to authenticated;

-- =============================================================
-- 8. RPC: abrir_vale — transición emitido→abierto.
--
-- La ejecuta el VECINO BENEFICIARIO (dueño del vale), no el
-- proveedor. La UI debe mostrar un pop-up de confirmación ("vas a
-- tener 30 minutos para canjear este vale") ANTES de llamar a esta
-- función -- la función en sí no pide confirmación, solo ejecuta la
-- transición una vez que el vecino ya confirmó en la UI.
--
-- IDEMPOTENTE: si el vale YA está 'abierto' y sigue dentro de la
-- ventana de 30 min, devuelve la fila tal cual sin tocar
-- abierto_en/vence_apertura_en -- el vecino puede volver a pedir el
-- QR las veces que quiera (ej. si se aleja esperando al proveedor)
-- sin reiniciar el reloj. Solo la PRIMERA llamada exitosa (desde
-- 'emitido') setea esos timestamps.
--
-- Chequeo adicional derivado del schema original (vigencia_horas):
-- un vale 'emitido' cuya ventana total (emitido_en + vigencia_horas)
-- ya pasó se trata como vencido y NO se abre, aunque nadie haya
-- corrido todavía el proceso que le ponga estado='vencido' en la
-- columna (ver nota de "estado calculado al vuelo" para Fase 1+).
-- =============================================================
create or replace function public.abrir_vale(p_codigo text)
returns public.vales
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vale    public.vales;
  v_exec_id uuid := public.current_vecino_id();
begin
  if v_exec_id is null then
    raise exception 'Sesión de vecino no encontrada';
  end if;

  select * into v_vale
  from public.vales
  where codigo = p_codigo
  for update;

  if not found then
    raise exception 'Vale no encontrado';
  end if;

  if v_vale.vecino_id <> v_exec_id then
    raise exception 'Este vale no te pertenece';
  end if;

  -- Idempotencia: ya abierto y dentro de ventana → devolver tal cual.
  if v_vale.estado = 'abierto' then
    if v_vale.vence_apertura_en is not null and now() <= v_vale.vence_apertura_en then
      return v_vale;
    else
      raise exception 'Venció la ventana de canje';
    end if;
  end if;

  if v_vale.estado <> 'emitido' then
    raise exception 'Vale no se puede abrir (estado actual: %)', v_vale.estado;
  end if;

  if now() > v_vale.emitido_en + (v_vale.vigencia_horas || ' hours')::interval then
    raise exception 'Vale vencido';
  end if;

  update public.vales
  set estado            = 'abierto',
      abierto_en        = now(),
      vence_apertura_en = now() + interval '30 minutes'
  where id = v_vale.id
  returning * into v_vale;

  return v_vale;
end;
$$;

revoke all on function public.abrir_vale(text) from public;
grant execute on function public.abrir_vale(text) to authenticated;
