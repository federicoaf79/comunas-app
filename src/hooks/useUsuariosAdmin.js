import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

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
