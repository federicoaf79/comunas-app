-- =============================================================
-- Limpieza post-Parte D — borra usuarios.puede_gestionar_reclamos
--
-- CORRER SOLO DESPUÉS de confirmar que el código nuevo (que lee
-- usuarios.modulos_acceso en su lugar) ya está desplegado y
-- funcionando en producción. Correr esto ANTES de ese punto rompe
-- el login de todo el mundo mientras el código viejo siga vivo
-- (sigue haciendo SELECT sobre esta columna).
--
-- Ver 20260724_modulos_acceso_usuarios.sql para el resto del
-- contexto (migración de datos, por qué se reemplaza este candado).
-- =============================================================
alter table public.usuarios
  drop column if exists puede_gestionar_reclamos;
