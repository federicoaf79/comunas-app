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

// Login del vecino — match DNI + teléfono. Comparación de
// teléfono "tolerante": ignora caracteres no numéricos (mismo
// criterio que la RPC de HC). Devuelve el vecino si matchea, null
// si no. NO crea sesión — eso lo hace el llamador.
export async function findVecinoByDniTelefono({ dni, telefono }) {
  const dniClean = (dni ?? '').trim()
  const telClean = (telefono ?? '').replace(/[^0-9]/g, '')
  if (!dniClean || !telClean) return null

  const { data, error } = await supabaseAnon
    .from('vecinos')
    .select('id, dni, nombre, apellido, nombre_completo, telefono, email, fecha_nac, sexo, direccion, localidad, municipio_id')
    .eq('dni', dniClean)
    .limit(5)
  if (error) throw error
  if (!data || data.length === 0) return null

  // Match por contenido — el vecino ingresa con o sin código de
  // país, prefijo, espacios. El registro guardado puede tener
  // formato distinto. Comparamos sólo dígitos.
  for (const v of data) {
    const stored = (v.telefono ?? '').replace(/[^0-9]/g, '')
    if (!stored) continue
    if (stored.endsWith(telClean) || telClean.endsWith(stored) || stored.includes(telClean)) {
      return v
    }
  }
  return null
}
