import { useQuery } from '@tanstack/react-query'
import { supabaseAnon } from '../lib/supabaseAnon'

// =============================================================
// Hooks de datos del Portal del Vecino
//
// Todos consultan vía supabaseAnon — las RLS de portal público
// (migration 20250507000002_portal_publico.sql) habilitan SELECT
// anon en vecinos/turnos/dependencias. La HC se accede vía RPC
// `consultas_publicas_por_vecino` que valida DNI + teléfono.
// =============================================================

const TURNO_COLS = `
  id, fecha_hora, estado, canal, numero_turno, motivo, metadata,
  dependencia:dependencia_id ( id, nombre )
`

// Mis turnos — todos los turnos del vecino (futuros + históricos),
// orden DESC por fecha_hora. El componente decide cómo agruparlos.
async function fetchTurnosByVecino(vecinoId) {
  if (!vecinoId) return []
  const { data, error } = await supabaseAnon
    .from('turnos')
    .select(TURNO_COLS)
    .eq('vecino_id', vecinoId)
    .order('fecha_hora', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export function useTurnosVecino(vecinoId) {
  return useQuery({
    queryKey: ['vecino', 'turnos', vecinoId ?? '__none__'],
    queryFn:  () => fetchTurnosByVecino(vecinoId),
    enabled:  !!vecinoId,
  })
}

// HC — vía RPC que verifica DNI + teléfono y devuelve sólo
// id/fecha/motivo/medico_nombre. Diagnóstico/receta NO se exponen
// por anon. La RPC limita a las últimas 3 (cap de la migración).
async function fetchHCPublica({ dni, telefono }) {
  if (!dni || !telefono) return []
  const { data, error } = await supabaseAnon.rpc('consultas_publicas_por_vecino', {
    p_dni:      dni,
    p_telefono: telefono,
  })
  if (error) throw error
  return data ?? []
}

export function useHCVecino({ dni, telefono }) {
  return useQuery({
    queryKey: ['vecino', 'hc', dni ?? '__none__', telefono ?? '__none__'],
    queryFn:  () => fetchHCPublica({ dni, telefono }),
    enabled:  !!dni && !!telefono,
  })
}

// Refresh del vecino contra la DB — útil cuando el vecino entró
// a su área y los operadores actualizan su perfil. Refresca los
// datos del context de manera explícita.
export async function refetchVecinoById(vecinoId) {
  if (!vecinoId) return null
  const { data, error } = await supabaseAnon
    .from('vecinos')
    .select('id, dni, nombre, apellido, nombre_completo, telefono, email, fecha_nac, sexo, direccion, localidad, municipio_id')
    .eq('id', vecinoId)
    .maybeSingle()
  if (error) {
    console.warn('[useVecinoData] refetchVecinoById error:', error.message)
    return null
  }
  return data
}

// Normaliza un teléfono a "los últimos 10 dígitos" — alcanza para
// matchear celulares argentinos sin importar el prefijo: +54, 54,
// 0 inicial, 9 móvil, espacios o guiones, todos colapsan al mismo
// número. Cubre los casos típicos: '+54 9 3854 123456',
// '543854123456', '3854123456', '0385 4-12-3456' → '3854123456'.
function normalizeTel(tel) {
  return String(tel ?? '').replace(/\D/g, '').slice(-10)
}

// Login del vecino — match DNI + teléfono. Devuelve el vecino si
// matchea, null si no. NO crea sesión — eso lo hace el llamador.
export async function findVecinoByDniTelefono({ dni, telefono }) {
  const dniClean   = (dni ?? '').trim()
  const telInputN  = normalizeTel(telefono)
  if (!dniClean || !telInputN) return null

  const { data, error } = await supabaseAnon
    .from('vecinos')
    .select('id, dni, nombre, apellido, nombre_completo, telefono, email, fecha_nac, sexo, direccion, localidad, municipio_id')
    .eq('dni', dniClean)
    .limit(5)
  if (error) throw error
  if (!data || data.length === 0) return null

  // Comparación equality sobre los últimos 10 dígitos. Si el
  // registro guardado tiene menos de 10 dígitos (raro) la función
  // los compara igual contra el suffix del input.
  for (const v of data) {
    if (normalizeTel(v.telefono) === telInputN) {
      return v
    }
  }
  return null
}
