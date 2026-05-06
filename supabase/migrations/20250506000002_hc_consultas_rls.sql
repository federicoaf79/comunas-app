-- =============================================================
-- Historia clínica — habilitar lectura/alta desde el cliente
--
-- 1. Helper current_vecino_id() (SECURITY DEFINER) por si no
--    está en la DB todavía.
-- 2. Habilita RLS en hc_consultas.
-- 3. Crea las dos policies pedidas:
--    - SELECT: superadmin todos + staff de su municipio + el
--      propio vecino lee su HC.
--    - INSERT: superadmin + staff dentro de su municipio.
--
-- Ejecutar en el SQL Editor de Supabase (rol postgres).
-- =============================================================

-- ============================================================
-- 1. HELPER current_vecino_id (idempotente)
-- ============================================================

create or replace function public.current_vecino_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.vecinos where user_id = auth.uid();
$$;

grant execute on function public.current_vecino_id() to anon, authenticated;

-- (is_superadmin, is_staff y current_usuario_municipio se asume
--  que ya existen — fueron creados por migrations anteriores.)

-- ============================================================
-- 2. RLS + POLICIES
-- ============================================================

alter table public.hc_consultas enable row level security;

-- Limpiar policies viejas / posibles duplicados.
drop policy if exists "hc_consultas_vecino_lee_propias"  on public.hc_consultas;
drop policy if exists "hc_consultas_staff"               on public.hc_consultas;
drop policy if exists "hc consultas staff lee municipio" on public.hc_consultas;
drop policy if exists "hc consultas staff crea"          on public.hc_consultas;

-- SELECT: superadmin ve todo. Staff ve consultas de vecinos
-- de su municipio. Vecino ve sólo las suyas.
create policy "hc consultas staff lee municipio"
on public.hc_consultas
for select
to authenticated
using (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
  or (vecino_id = public.current_vecino_id())
);

-- INSERT: superadmin + staff (admin_comuna / operador) en su municipio.
create policy "hc consultas staff crea"
on public.hc_consultas
for insert
to authenticated
with check (
  public.is_superadmin()
  or (public.is_staff() and municipio_id = public.current_usuario_municipio())
);

-- ============================================================
-- 3. VERIFICACIÓN
-- ============================================================

select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename = 'hc_consultas';

select policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'hc_consultas'
order by policyname;
