-- =============================================================
-- Fix RLS en usuarios — re-armado mínimo
--
-- Contexto: las policies originales llamaban a helpers SECURITY
-- DEFINER que no se crearon correctamente en la DB. Resultado:
-- las queries a `usuarios` quedaban colgadas (recursión / falta
-- de bypass). Este script crea los helpers básicos, re-habilita
-- RLS y deja sólo las dos policies necesarias.
--
-- Ejecutar en el SQL Editor de Supabase (postgres role) — la
-- ownership de postgres + SECURITY DEFINER es lo que hace que
-- las funciones bypaseen la RLS de la propia tabla `usuarios`
-- y no caigan en recursión infinita.
-- =============================================================

-- ============================================================
-- 1. HELPERS SECURITY DEFINER
-- ============================================================

create or replace function public.has_role(_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _role = any(
    coalesce(
      (select roles from public.usuarios where id = auth.uid() and activo = true),
      '{}'::text[]
    )
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select 'superadmin' = any(
    coalesce(
      (select roles from public.usuarios where id = auth.uid() and activo = true),
      '{}'::text[]
    )
  );
$$;

-- Permitir invocación desde el cliente (anon key + JWT autenticado).
grant execute on function public.has_role(text) to anon, authenticated;
grant execute on function public.is_superadmin() to anon, authenticated;

-- ============================================================
-- 2. RE-HABILITAR RLS EN USUARIOS
-- ============================================================

alter table public.usuarios enable row level security;

-- ============================================================
-- 3. POLICIES (sólo las necesarias)
--
-- Limpiamos las que pudieron quedar rotas de migrations
-- anteriores y dejamos sólo dos policies de SELECT, ambas
-- PERMISSIVE — se combinan con OR.
-- ============================================================

drop policy if exists "usuarios_self_select"              on public.usuarios;
drop policy if exists "usuarios_self_update"              on public.usuarios;
drop policy if exists "usuarios_admin_all"                on public.usuarios;
drop policy if exists "usuario puede leer su propio perfil" on public.usuarios;
drop policy if exists "usuario lee su propio perfil"      on public.usuarios;
drop policy if exists "superadmin lee todos los usuarios" on public.usuarios;

-- Cada usuario lee su propio perfil. No usa helpers — chequeo
-- directo contra el JWT, cero riesgo de recursión.
create policy "usuario lee su propio perfil"
on public.usuarios
for select
to authenticated
using (auth.uid() = id);

-- Superadmin lee todos los perfiles del sistema.
create policy "superadmin lee todos los usuarios"
on public.usuarios
for select
to authenticated
using (public.is_superadmin());

-- ============================================================
-- 4. VERIFICACIÓN (opcional — devuelve info de control)
-- ============================================================

-- Helpers creados y son SECURITY DEFINER con owner postgres.
select
  proname                            as function_name,
  prosecdef                          as security_definer,
  pg_get_userbyid(proowner)          as owner,
  pg_get_function_identity_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('has_role', 'is_superadmin');

-- RLS habilitado en usuarios.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'usuarios';

-- Policies vigentes en usuarios.
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'usuarios'
order by policyname;
