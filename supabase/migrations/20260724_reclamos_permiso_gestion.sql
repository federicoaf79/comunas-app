-- =============================================================
-- Permiso puntual de gestión de Reclamos — usuarios.puede_gestionar_reclamos
--
-- Mismo patrón que usuarios.puede_emitir_vales (20260724_vales_electronicos_fase0.sql):
-- NO es una capacidad de todo staff del municipio -- admin_comuna
-- se lo otorga a un usuario puntual desde el toggle "Gestiona
-- reclamos" en Usuarios.jsx. Columna booleana simple, sin FK ni
-- relación con dependencias_acceso (Reclamos no es una dependencia).
--
-- Este cambio es solo a nivel columna + gating de app (sidebar +
-- guard de la página /admin/reclamos). NO se toca RLS de la tabla
-- reclamos -- sigue como estaba (cualquier staff del municipio via
-- is_staff()); el permiso puntual gatea la UI/ruta, no el acceso a
-- nivel de base de datos.
-- =============================================================
alter table public.usuarios
  add column if not exists puede_gestionar_reclamos boolean not null default false;
