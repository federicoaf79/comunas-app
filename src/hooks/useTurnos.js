import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ARG_OFFSET } from '../lib/datetime'
import { createCalendarEvent, deleteCalendarEvent } from '../lib/googleCalendar'

const TIMEOUT_MS = 8000

// Joins resuelven nombres de vecino, profesional y dependencia
// para que la UI no necesite consultas extra. Si las RLS de esas
// tablas bloquean el join, el campo viene null y el componente
// muestra '—'.
const TURNO_SELECT = `
  id, municipio_id, dependencia_id, vecino_id, profesional_id,
  fecha_hora, estado, canal, numero_turno, calendar_event_id,
  recordatorio_enviado, motivo, metadata, created_at,
  vecino:vecino_id ( id, dni, nombre_completo, apellido, nombre, telefono ),
  profesional:profesional_id ( id, nombre ),
  dependencia:dependencia_id ( id, nombre )
`

function normalizeTurno(t) {
  // Tolerante con la respuesta de PostgREST: si el alias no aparece,
  // probamos la versión table-name (plural) por si el server resolvió
  // el embed con ese key.
  const dep  = t.dependencia ?? t.dependencias ?? null
  const prof = t.profesional ?? null
  const vec  = t.vecino      ?? t.vecinos      ?? null
  return {
    ...t,
    dependencia:        dep,
    profesional:        prof,
    vecino:             vec,
    profesional_nombre: prof?.nombre ?? null,
    dependencia_nombre: dep?.nombre  ?? null,
  }
}

// =============================================================
// Funciones puras (sin React)
// =============================================================

// fetchTurnos({ municipioId, dependenciaId, fecha, fechaFrom, fechaTo, estado })
// Las fechas son YYYY-MM-DD en horario Argentina. Se convierten al
// rango UTC equivalente con offset -03:00 explícito para que el
// timestamptz se compare correctamente.
export async function fetchTurnos({
  municipioId, dependenciaId, fecha, fechaFrom, fechaTo, estado,
} = {}) {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let q = supabase
      .from('turnos')
      .select(TURNO_SELECT)
      .order('fecha_hora', { ascending: true })
      .abortSignal(controller.signal)

    if (municipioId)   q = q.eq('municipio_id', municipioId)
    if (dependenciaId) q = q.eq('dependencia_id', dependenciaId)
    if (estado)        q = q.eq('estado', estado)

    // Filtro por día único (Argentina).
    if (fecha) {
      q = q
        .gte('fecha_hora', `${fecha}T00:00:00${ARG_OFFSET}`)
        .lte('fecha_hora', `${fecha}T23:59:59.999${ARG_OFFSET}`)
    }
    // Filtro por rango (Argentina).
    if (fechaFrom) q = q.gte('fecha_hora', `${fechaFrom}T00:00:00${ARG_OFFSET}`)
    if (fechaTo)   q = q.lte('fecha_hora', `${fechaTo}T23:59:59.999${ARG_OFFSET}`)

    const { data, error } = await q
    clearTimeout(timeoutId)
    if (error) {
      console.error('[useTurnos] fetchTurnos error:', error)
      throw error
    }
    return (data ?? []).map(normalizeTurno)
  } catch (e) {
    clearTimeout(timeoutId)
    if (controller.signal.aborted || e?.name === 'AbortError' || /abort/i.test(e?.message ?? '')) {
      const err = new Error(`fetchTurnos timeout (${TIMEOUT_MS}ms)`)
      console.error('[useTurnos] fetchTurnos timeout:', err.message)
      throw err
    }
    throw e
  }
}

export async function fetchTurnosByVecino(vecinoId) {
  if (!vecinoId) return []
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const { data, error } = await supabase
      .from('turnos')
      .select(TURNO_SELECT)
      .eq('vecino_id', vecinoId)
      .order('fecha_hora', { ascending: false })
      .abortSignal(controller.signal)
    clearTimeout(timeoutId)
    if (error) {
      console.error('[useTurnos] fetchTurnosByVecino error:', error)
      throw error
    }
    return (data ?? []).map(normalizeTurno)
  } catch (e) {
    clearTimeout(timeoutId)
    if (controller.signal.aborted || e?.name === 'AbortError' || /abort/i.test(e?.message ?? '')) {
      const err = new Error(`fetchTurnosByVecino timeout (${TIMEOUT_MS}ms)`)
      console.error('[useTurnos] fetchTurnosByVecino timeout:', err.message)
      throw err
    }
    throw e
  }
}

export async function createTurno(data) {
  const { data: row, error } = await supabase
    .from('turnos')
    .insert(data)
    .select(TURNO_SELECT)
    .single()
  if (error) {
    console.error('[useTurnos] createTurno error:', error)
    throw error
  }
  const turno = normalizeTurno(row)

  // Sync con Google Calendar — placeholder, hoy no-op.
  try {
    const eventId = await createCalendarEvent(turno, turno.profesional)
    if (eventId) {
      const { data: updated } = await supabase
        .from('turnos')
        .update({ calendar_event_id: eventId })
        .eq('id', turno.id)
        .select(TURNO_SELECT)
        .single()
      if (updated) return normalizeTurno(updated)
    }
  } catch (e) {
    console.warn('[useTurnos] calendar sync falló (turno creado igual):', e?.message)
  }

  return turno
}

export async function updateTurnoEstado(id, estado) {
  const { data: row, error } = await supabase
    .from('turnos')
    .update({ estado })
    .eq('id', id)
    .select(TURNO_SELECT)
    .single()
  if (error) {
    console.error('[useTurnos] updateTurnoEstado error:', error)
    throw error
  }
  return normalizeTurno(row)
}

export async function cancelarTurno(id) {
  // Leer calendar_event_id antes del UPDATE para poder borrarlo
  // del Calendar después.
  const { data: existing } = await supabase
    .from('turnos')
    .select('id, calendar_event_id')
    .eq('id', id)
    .single()

  const { data: row, error } = await supabase
    .from('turnos')
    .update({ estado: 'cancelado', calendar_event_id: null })
    .eq('id', id)
    .select(TURNO_SELECT)
    .single()
  if (error) {
    console.error('[useTurnos] cancelarTurno error:', error)
    throw error
  }

  try {
    await deleteCalendarEvent(existing?.calendar_event_id)
  } catch (e) {
    console.warn('[useTurnos] calendar delete falló:', e?.message)
  }

  return normalizeTurno(row)
}

// fetchDependencias — fallback cuando el embed de turnos no trae
// el nombre (RLS o falta de FK). Cacheado por TanStack vía useDependencias.
// Incluye `tipo` y `activa` para que los consumers puedan filtrar
// por categoría (caps/juzgado/sum/intendencia) y mostrar solo las
// activas en los pickers. La columna en la DB se llama `activa`
// (femenino), distinta del `activo` de usuarios.
export async function fetchDependencias(municipioId) {
  let q = supabase.from('dependencias').select('id, nombre, tipo, municipio_id, activa')
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { data, error } = await q
  if (error) {
    console.warn('[useTurnos] fetchDependencias warning:', error.message)
    return []
  }
  return data ?? []
}

// =============================================================
// Hooks React
// =============================================================

// `municipioIdOverride` permite al caller forzar un municipio
// destino — caso superadmin con perfil.municipio_id = null que
// cae a "primer municipio activo" via useEffectiveMunicipioId. Sin
// este override el filtro queda en null y, según RLS, puede no
// devolver filas (turnos del día vacío en el Dashboard).
export function useTurnos({
  dependenciaId, fecha, fechaFrom, fechaTo, estado,
} = {}, { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  const enabled = !!perfil

  const query = useQuery({
    queryKey: [
      'turnos',
      municipioId   ?? '__ALL__',
      dependenciaId ?? '__ALL__',
      fecha         ?? '__ALL__',
      fechaFrom     ?? '__ALL__',
      fechaTo       ?? '__ALL__',
      estado        ?? '__ALL__',
    ],
    queryFn: () => fetchTurnos({
      municipioId, dependenciaId, fecha, fechaFrom, fechaTo, estado,
    }),
    enabled,
  })

  const create = useMutation({
    mutationFn: (data) => createTurno({
      ...(municipioId ? { municipio_id: municipioId } : {}),
      ...data,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turnos'] }),
  })

  const updateEstado = useMutation({
    mutationFn: ({ id, estado }) => updateTurnoEstado(id, estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turnos'] }),
  })

  const cancel = useMutation({
    mutationFn: (id) => cancelarTurno(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turnos'] }),
  })

  return {
    turnos:       query.data ?? [],
    isLoading:    query.isLoading,
    isFetching:   query.isFetching,
    error:        query.error,
    refetch:      query.refetch,
    create,
    updateEstado,
    cancel,
  }
}

export function useTurnosByVecino(vecinoId) {
  const { perfil } = useAuth()
  const enabled = !!perfil && !!vecinoId

  const query = useQuery({
    queryKey: ['turnos', 'vecino', vecinoId ?? '__none__'],
    queryFn:  () => fetchTurnosByVecino(vecinoId),
    enabled,
  })

  return {
    turnos:     query.data ?? [],
    isLoading:  query.isLoading,
    isFetching: query.isFetching,
    error:      query.error,
    refetch:    query.refetch,
  }
}

export function useDependencias() {
  const { perfil } = useAuth()
  const municipioId = perfil?.municipio_id ?? null
  const enabled = !!perfil

  return useQuery({
    queryKey: ['dependencias', municipioId ?? '__ALL__'],
    queryFn:  () => fetchDependencias(municipioId),
    enabled,
  })
}

// Devuelve UNA dependencia por `tipo` (caps/juzgado/sum/intendencia)
// para el municipio del usuario.
//
// Caso superadmin (perfil.municipio_id = null): no se filtra por
// municipio — toma la primera dependencia activa del tipo pedido
// que exista en cualquier municipio del sistema. Esto permite que
// las pantallas de Juez de Paz / SUM se rendericen sin romper la
// experiencia del superadmin que no está atado a un municipio.
export function useDependenciaByTipo(tipo) {
  const { perfil } = useAuth()
  const municipioId = perfil?.municipio_id ?? null
  const enabled = !!perfil && !!tipo

  return useQuery({
    queryKey: ['dependencia-by-tipo', tipo, municipioId ?? '__ALL__'],
    queryFn: async () => {
      let q = supabase
        .from('dependencias')
        .select('id, nombre, tipo, municipio_id, activa')
        .eq('tipo', tipo)
        .eq('activa', true)
      if (municipioId) q = q.eq('municipio_id', municipioId)
      const { data, error } = await q.limit(1).maybeSingle()
      if (error) {
        console.warn('[useTurnos] useDependenciaByTipo error:', error.message)
        return null
      }
      return data
    },
    enabled,
  })
}
