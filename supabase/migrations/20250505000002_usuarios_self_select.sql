-- =============================================================
-- Fix: permitir que un usuario autenticado lea su propio perfil
-- en la tabla `usuarios`. Defensivo: cubre el caso en que las
-- policies con helpers SECURITY DEFINER fallen o no estén aplicadas.
--
-- Las policies PERMISSIVE se combinan con OR, así que esto SUMA
-- acceso (no resta). Coexiste con `usuarios_self_select`.
--
-- Ejecutable manualmente en el SQL editor de Supabase, y queda
-- versionado como migration.
-- =============================================================

drop policy if exists "usuario puede leer su propio perfil" on public.usuarios;

create policy "usuario puede leer su propio perfil"
on public.usuarios
for select
using (auth.uid() = id);
