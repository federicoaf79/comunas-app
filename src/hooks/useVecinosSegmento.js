import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveMunicipioId } from './useEffectiveMunicipioId'

// =============================================================
// useVecinosPorSegmento — devuelve la lista de vecinos para un
// "segmento" de envío masivo.
//
// Segmentos soportados:
//   'todos'                → todos los vecinos del municipio
//   'urbano' / 'rural'     → filtra por columna `zona`
//   'barrio:<nombre>'      → filtra por barrio
//   'sala_pa'              → vecinos con turno en dep tipo
//                            caps/salud/sala en últimos 30 días
//                            o próximos 7 días
//   'juez'                 → vecinos con turno en dep tipo juzgado
//   'sum'                  → vecinos cuyo apellido/nombre aparece
//                            en sum_reservas.solicitante en los
//                            últimos 60 días (best-effort: la
//                            tabla solo tiene texto libre, sin FK)
//   'manual'               → array vacío (el operador tilda uno
//                            por uno desde el listado completo)
//
// useBarriosDeVecinos devuelve los barrios DISTINTOS del municipio
// para alimentar el selector de "Por barrio".
// =============================================================

const VECINO_COLS = 'id, nombre_completo, apellido, nombre, dni, telefono, barrio, zona'

function dentroDeRango(now = new Date()) {
  const start = new Date(now); start.setDate(start.getDate() - 30); start.setHours(0, 0, 0, 0)
  const end   = new Date(now); end.setDate(end.getDate()   +  7); end.setHours(23, 59, 59, 999)
  return { startISO: start.toISOString(), endISO: end.toISOString() }
}

// Normaliza un nombre para matching loose entre vecinos y
// solicitantes de sum_reservas (que es texto libre sin FK).
function normalizarNombre(s) {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchVecinosPorSegmento({ segmento, municipioId }) {
  if (!segmento || segmento === 'manual') return []

  const baseQuery = () => {
    let q = supabase
      .from('vecinos')
      .select(VECINO_COLS)
      .order('apellido', { ascending: true })
      .order('nombre', { ascending: true })
    if (municipioId) q = q.eq('municipio_id', municipioId)
    return q
  }

  // Filtros directos sobre `vecinos`.
  if (segmento === 'todos') {
    const { data, error } = await baseQuery()
    if (error) throw error
    return data ?? []
  }
  if (segmento === 'urbano' || segmento === 'rural') {
    const { data, error } = await baseQuery().eq('zona', segmento)
    if (error) throw error
    return data ?? []
  }
  if (segmento.startsWith('barrio:')) {
    const barrio = segmento.slice('barrio:'.length)
    if (!barrio) return []
    const { data, error } = await baseQuery().eq('barrio', barrio)
    if (error) throw error
    return data ?? []
  }

  // Segmentos por dependencia — JOIN turnos + dep tipo.
  if (segmento === 'sala_pa' || segmento === 'juez') {
    const { startISO, endISO } = dentroDeRango()
    // Convertir ISOs a fecha (solo YYYY-MM-DD)
    const startDate = startISO.split('T')[0]
    const endDate = endISO.split('T')[0]
    let qT = supabase
      .from('turnos_agenda')
      .select('vecino_id, dependencia:dependencia_id ( tipo )')
      .gte('fecha', startDate)
      .lte('fecha', endDate)
    if (municipioId) qT = qT.eq('municipio_id', municipioId)
    const { data: turnos, error: tErr } = await qT
    if (tErr) throw tErr
    const regex = segmento === 'sala_pa'
      ? /caps|salud|sala/
      : /juzgado|juez|paz/
    const ids = Array.from(new Set(
      (turnos ?? [])
        .filter(t => regex.test((t.dependencia?.tipo ?? '').toLowerCase()))
        .map(t => t.vecino_id)
        .filter(Boolean),
    ))
    if (ids.length === 0) return []
    const { data, error } = await baseQuery().in('id', ids)
    if (error) throw error
    return data ?? []
  }

  // SUM — sum_reservas.solicitante es texto libre. Best-effort:
  // pedimos los solicitantes recientes y matchamos client-side
  // contra el nombre normalizado de cada vecino. Si no coincide
  // ninguno, el segmento queda vacío (el operador igual puede
  // pasar a "Personalizado" y tildar a mano).
  if (segmento === 'sum') {
    const desde = new Date(); desde.setDate(desde.getDate() - 60)
    const desdeYmd = desde.toISOString().slice(0, 10)
    let qR = supabase
      .from('sum_reservas')
      .select('solicitante')
      .gte('fecha', desdeYmd)
    if (municipioId) qR = qR.eq('municipio_id', municipioId)
    const { data: reservas, error: rErr } = await qR
    if (rErr) throw rErr
    const solicitantes = (reservas ?? [])
      .map(r => normalizarNombre(r.solicitante))
      .filter(Boolean)
    if (solicitantes.length === 0) return []
    const { data: todos, error } = await baseQuery()
    if (error) throw error
    return (todos ?? []).filter(v => {
      const partes = [v.nombre_completo, `${v.apellido ?? ''} ${v.nombre ?? ''}`, `${v.nombre ?? ''} ${v.apellido ?? ''}`]
        .map(normalizarNombre)
        .filter(Boolean)
      return partes.some(p => solicitantes.some(s => s === p || s.includes(p) || p.includes(s)))
    })
  }

  return []
}

export function useVecinosPorSegmento(segmento) {
  const { perfil } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  const enabled = !!perfil && !!segmento && segmento !== 'manual'

  return useQuery({
    queryKey: ['vecinos-segmento', municipioId ?? '__ALL__', segmento ?? ''],
    queryFn:  () => fetchVecinosPorSegmento({ segmento, municipioId }),
    enabled,
    // Cache 1 min — los segmentos cambian poco y el panel se abre
    // varias veces por sesión.
    staleTime: 60 * 1000,
  })
}

// Devuelve los barrios DISTINTOS de los vecinos del municipio
// para alimentar el grupo "Por barrio" del select.
export function useBarriosDeVecinos() {
  const { perfil } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  return useQuery({
    queryKey: ['barrios-de-vecinos', municipioId ?? '__ALL__'],
    queryFn:  async () => {
      let q = supabase.from('vecinos').select('barrio')
      if (municipioId) q = q.eq('municipio_id', municipioId)
      const { data, error } = await q
      if (error) throw error
      const set = new Set()
      for (const r of (data ?? [])) {
        const b = (r.barrio ?? '').trim()
        if (b) set.add(b)
      }
      return Array.from(set).sort((a, b) => a.localeCompare(b))
    },
    enabled: !!perfil,
    staleTime: 5 * 60 * 1000,
  })
}
