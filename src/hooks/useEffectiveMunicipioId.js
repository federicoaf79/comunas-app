import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useEffectiveMunicipioId — resuelve el municipio destino para
// una operación administrativa.
//
// - Si el perfil tiene municipio_id asignado (admin_comuna /
//   operador), lo devuelve sin más.
// - Si es superadmin sin municipio (perfil.municipio_id null),
//   dispara una query "primer municipio activo por created_at"
//   y devuelve ese id como fallback.
// - Si la app no tiene ningún municipio activo, devuelve null —
//   el caller debe mostrar un banner de "no hay municipio para
//   guardar".
//
// Lo usan ConfigGeneral y Administracion para que el superadmin
// no quede bloqueado por la falta de su propio municipio_id.
// =============================================================

export function useEffectiveMunicipioId() {
  const { perfil, hasRole } = useAuth()
  const propio = perfil?.municipio_id ?? null
  const necesitaFallback = !propio && hasRole('superadmin')

  const fallbackQ = useQuery({
    queryKey: ['first-active-municipio'],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('municipios')
        .select('id')
        .eq('activo', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) {
        console.warn('[useEffectiveMunicipioId] fallback fetch error:', error.message)
        return null
      }
      return data?.id ?? null
    },
    enabled:  necesitaFallback,
    staleTime: 60 * 60 * 1000,
  })

  return propio ?? fallbackQ.data ?? null
}
