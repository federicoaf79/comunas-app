-- =============================================================
-- Matriz de permisos para módulos de gestión — usuarios.modulos_acceso
--
-- Extiende el "Tablero de Permisos" (Permisos por persona en
-- Usuarios.jsx) más allá de dependencias físicas, para cubrir
-- Vales Electrónicos / Administración / Reclamos. Mismo patrón que
-- usuarios.dependencias_acceso, pero clave por `modulo` (el mismo
-- slug que ya usa modulos_config.modulo) en vez de dependencia_id --
-- estos 3 no son filas de `dependencias`, son módulos a nivel
-- municipio.
--
-- Shape: [{modulo: 'vales', puede_gestionar: bool, puede_administrar: bool}, ...]
--
-- Reemplaza a usuarios.puede_gestionar_reclamos (candado único,
-- agregado hoy más temprano en 20260724_reclamos_permiso_gestion.sql):
-- Reclamos no tiene una "acción sensible" separada como
-- puede_emitir_vales, así que no tiene sentido mantener un candado
-- doble solo para ese módulo -- decisión confirmada con el cliente.
-- puede_emitir_vales SÍ sigue existiendo, sin cambios -- sigue
-- siendo un candado aparte y más exclusivo (emitir vs. solo ver/
-- gestionar proveedores), no se migra ni se toca acá.
--
-- OJO — a propósito NO borra puede_gestionar_reclamos todavía. Esa
-- columna la sigue leyendo el código VIEJO que está en producción
-- ahora mismo; si el DROP corriera acá, en el hueco entre esta
-- migración y el deploy del código nuevo, cualquier login rompería
-- con "column does not exist". El DROP vive aparte, en
-- 20260724_drop_puede_gestionar_reclamos.sql -- correr SOLO después
-- de confirmar que el código nuevo (que ya no lee esa columna) está
-- desplegado y funcionando en producción.
-- =============================================================
alter table public.usuarios
  add column if not exists modulos_acceso jsonb not null default '[]'::jsonb;

-- Migra el estado existente de puede_gestionar_reclamos -- ningún
-- usuario pierde el permiso que ya tenía. Es seguro correr esto ya:
-- solo AGREGA datos a una columna nueva, no toca la vieja.
update public.usuarios
set modulos_acceso = modulos_acceso || jsonb_build_array(
  jsonb_build_object('modulo', 'reclamos', 'puede_gestionar', true, 'puede_administrar', false)
)
where puede_gestionar_reclamos = true;
