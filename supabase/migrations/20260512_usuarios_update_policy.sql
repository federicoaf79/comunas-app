-- =============================================================
-- 20260512_usuarios_update_policy
--
-- Fix de RLS: la tabla `usuarios` solo tenía policies de SELECT
-- (ver 20250505000003). Cuando admin_comuna/superadmin intentaba
-- editar permisos (`dependencias_acceso`) o rol desde el panel
-- de Usuarios, Supabase silenciosamente devolvía "0 rows
-- updated" y la UI marcaba ok sin escribir nada.
--
-- Este script agrega las policies de UPDATE necesarias:
--   1) Cada usuario puede editar su propio perfil (campos no
--      sensibles — la UI nunca expone `roles` para self-edit).
--   2) admin_comuna puede editar usuarios del MISMO municipio,
--      salvo otros admin_comuna o superadmin.
--   3) superadmin puede editar a cualquier usuario.
--
-- Ejecutar en el SQL Editor de Supabase (postgres role).
-- =============================================================

-- Limpieza de policies previas con el mismo nombre.
drop policy if exists "usuario edita su propio perfil"        on public.usuarios;
drop policy if exists "admin_comuna edita usuarios mismo muni" on public.usuarios;
drop policy if exists "superadmin edita todos los usuarios"   on public.usuarios;

-- 1) Self-update: el usuario puede modificar su propia fila.
--    Sin restricción de columnas a nivel policy (postgres no las
--    soporta inline); el frontend nunca expone roles/activo para
--    auto-edición, así que el riesgo de escalación queda contenido
--    en la UI. Si se llegara a usar desde otro cliente, conviene
--    revocar UPDATE(roles, activo) por columna.
create policy "usuario edita su propio perfil"
on public.usuarios
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- 2) admin_comuna del mismo municipio. has_role + comparación de
--    municipio_id entre la fila objetivo y el operador.
--    El WITH CHECK garantiza que no puedan mover usuarios a otro
--    municipio ni promoverlos a admin_comuna/superadmin (esa
--    validación se hace también en el frontend, pero acá queda
--    como defensa en profundidad).
create policy "admin_comuna edita usuarios mismo muni"
on public.usuarios
for update
to authenticated
using (
  public.has_role('admin_comuna')
  and municipio_id = (
    select municipio_id from public.usuarios where id = auth.uid()
  )
  and not ('superadmin'   = any(coalesce(roles, '{}'::text[])))
  and not ('admin_comuna' = any(coalesce(roles, '{}'::text[])) and id <> auth.uid())
)
with check (
  public.has_role('admin_comuna')
  and municipio_id = (
    select municipio_id from public.usuarios where id = auth.uid()
  )
  and not ('superadmin'   = any(coalesce(roles, '{}'::text[])))
);

-- 3) superadmin tiene acceso total a UPDATE.
create policy "superadmin edita todos los usuarios"
on public.usuarios
for update
to authenticated
using (public.is_superadmin())
with check (public.is_superadmin());

-- ============================================================
-- Verificación
-- ============================================================

select policyname, cmd, permissive, roles
from pg_policies
where schemaname = 'public' and tablename = 'usuarios'
order by policyname;
