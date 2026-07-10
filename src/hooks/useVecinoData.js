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
  id, fecha, hora_inicio, hora_fin, estado, canal, numero_turno, motivo, metadata,
  dependencia:dependencia_id ( id, nombre )
`

// Mis turnos — todos los turnos del vecino (futuros + históricos),
// orden DESC por fecha + hora_inicio. El componente decide cómo agruparlos.
async function fetchTurnosByVecino(vecinoId) {
  if (!vecinoId) return []
  const { data, error } = await supabaseAnon
    .from('turnos_agenda')
    .select(TURNO_COLS)
    .eq('vecino_id', vecinoId)
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: false })
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
    .select('id, dni, nombre, apellido, nombre_completo, telefono, email, fecha_nac, sexo, direccion, localidad, barrio, municipio_id')
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
    .select('id, dni, nombre, apellido, nombre_completo, telefono, email, fecha_nac, sexo, direccion, localidad, barrio, municipio_id')
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

// ─────────────────────────────────────────────────────────────────
// Reclamos del vecino (lectura desde el área "Mi cuenta")
//
// La policy "vecino ve sus reclamos" (migration
// 20260509000004_reclamos_anon_select) abre SELECT a anon SOLO
// para filas con vecino_id != null. El filtro por id-del-vecino se
// hace en el cliente, así que vale el mismo trade-off que el
// resto de "Mi cuenta": cualquiera con la anon key podría
// enumerar reclamos vinculados a un vecino. Aceptable para un
// portal sin auth real; si la privacidad lo requiere se puede
// reemplazar por una RPC con verificación DNI+teléfono.
// ─────────────────────────────────────────────────────────────────

const RECLAMO_COLS_PUBLIC =
  'id, vecino_id, tipo, descripcion, ubicacion, estado, prioridad, canal, created_at'

async function fetchReclamosByVecino(vecinoId) {
  if (!vecinoId) return []
  const { data, error } = await supabaseAnon
    .from('reclamos')
    .select(RECLAMO_COLS_PUBLIC)
    .eq('vecino_id', vecinoId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export function useReclamosVecino(vecinoId) {
  return useQuery({
    queryKey: ['vecino', 'reclamos', vecinoId ?? '__none__'],
    queryFn:  () => fetchReclamosByVecino(vecinoId),
    enabled:  !!vecinoId,
  })
}
