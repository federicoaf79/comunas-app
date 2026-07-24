import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createAuditLog } from './useAuditLog'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[useUsuariosAdmin] audit log:', e.message))
}

// =============================================================
// useUsuariosAdmin — mutaciones del panel /admin/usuarios.
// Separado para reutilizar desde el wizard de permisos y la
// lista de usuarios sin duplicar la lógica de invalidación.
// =============================================================

// Reemplaza el array completo de `dependencias_acceso` para un
// usuario. La columna es `jsonb` y el cliente Supabase serializa
// el array JS directamente — NO se debe pasar JSON.stringify acá:
// hacerlo guarda el string entre comillas y los lectores fallan
// al hacer .find() sobre el array.
export async function updateDependenciasAcceso(id, dependencias_acceso) {
  if (!Array.isArray(dependencias_acceso)) {
    throw new Error('dependencias_acceso debe ser un array JS (no string).')
  }
  // Sanitizo cada entrada para que SOLO tenga las 3 claves esperadas
  // por los lectores. Cualquier campo extra se descarta.
  const sanitized = dependencias_acceso
    .filter(d => d?.dependencia_id)
    .map(d => ({
      dependencia_id:    String(d.dependencia_id),
      puede_gestionar:   !!d.puede_gestionar,
      puede_administrar: !!d.puede_administrar,
    }))
  const { data, error } = await supabase
    .from('usuarios')
    .update({ dependencias_acceso: sanitized })
    .eq('id', id)
    .select('id, dependencias_acceso')
  if (error) {
    console.error('[useUsuariosAdmin] updateDependenciasAcceso error:', error)
    throw error
  }
  // Si RLS deniega silenciosamente, data llega como [] sin error.
  // Marcamos eso como falla explícita para que la UI no muestre
  // un toast verde mintiendo sobre el guardado.
  if (!data || data.length === 0) {
    throw new Error('No se pudo guardar (RLS o usuario no editable). Revisá las policies de UPDATE en usuarios.')
  }
  logAudit({
    accion: 'update', entidad: 'usuarios', entidadId: id,
    descripcion: `Permisos por dependencia actualizados (${sanitized.length} dependencia${sanitized.length === 1 ? '' : 's'})`,
    metadata: { dependencias_acceso: sanitized },
  })
  return data[0]
}

export function useUpdatePermisosUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, dependencias_acceso }) =>
      updateDependenciasAcceso(id, dependencias_acceso),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-usuarios'] }),
  })
}

// Reemplaza el array completo de `modulos_acceso` para un usuario —
// mismo patrón que updateDependenciasAcceso() de arriba, pero clave
// por `modulo` (slug de modulos_config.modulo) en vez de
// dependencia_id: cubre módulos de gestión que no son dependencias
// físicas (Vales, Administración, Reclamos). Mutación separada a
// propósito, no se mezcla con dependencias_acceso.
export async function updateModulosAcceso(id, modulos_acceso) {
  if (!Array.isArray(modulos_acceso)) {
    throw new Error('modulos_acceso debe ser un array JS (no string).')
  }
  const sanitized = modulos_acceso
    .filter(m => m?.modulo)
    .map(m => ({
      modulo:            String(m.modulo),
      puede_gestionar:   !!m.puede_gestionar,
      puede_administrar: !!m.puede_administrar,
    }))
  const { data, error } = await supabase
    .from('usuarios')
    .update({ modulos_acceso: sanitized })
    .eq('id', id)
    .select('id, modulos_acceso')
  if (error) {
    console.error('[useUsuariosAdmin] updateModulosAcceso error:', error)
    throw error
  }
  if (!data || data.length === 0) {
    throw new Error('No se pudo guardar (RLS o usuario no editable). Revisá las policies de UPDATE en usuarios.')
  }
  logAudit({
    accion: 'update', entidad: 'usuarios', entidadId: id,
    descripcion: `Permisos por módulo actualizados (${sanitized.length} módulo${sanitized.length === 1 ? '' : 's'})`,
    metadata: { modulos_acceso: sanitized },
  })
  return data[0]
}

export function useUpdatePermisosModulosUsuario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, modulos_acceso }) =>
      updateModulosAcceso(id, modulos_acceso),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-usuarios'] }),
  })
}
