import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { createCalendarEvent, deleteCalendarEvent } from '../lib/googleCalendar'

const TIMEOUT_MS = 8000

// Joins resuelven nombres de vecino, profesional y dependencia
// para que la UI no necesite consultas extra. Si las RLS de esas
// tablas bloquean el join, el campo viene null y el componente
// muestra '—'.
const TURNO_SELECT = `
  id, municipio_id, dependencia_id, vecino_id, profesional_id,
  fecha_hora, estado, canal, numero_turno, calendar_event_id,
  recordatorio_enviado, created_at,
  vecino:vecino_id ( id, dni, nombre_completo, apellido, nombre, telefono ),
  profesional:profesional_id ( id, nombre ),
  dependencia:dependencia_id ( id, nombre )
`

function normalizeTurno(t) {
  return {
    ...t,
    profesional_nombre: t.profesional?.nombre ?? null,
    dependencia_nombre: t.dependencia?.nombre ?? null,
  }
}

// =============================================================
// Funciones puras (sin React) — usables desde cualquier callsite
// =============================================================

// fetchTurnos({ municipioId, dependenciaId, fecha, estado })
// `fecha` formato 'YYYY-MM-DD' (filtra todo el día en TZ del cliente).
export async function fetchTurnos({ municipioId, dependenciaId, fecha, estado } = {}) {
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
    if (fecha) {
      const start = `${fecha}T00:00:00`
      const end   = `${fecha}T23:59:59.999`
      q = q.gte('fecha_hora', start).lte('fecha_hora', end)
    }

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

// createTurno: inserta y, si el calendar está habilitado, sincroniza.
// Si no está habilitado, createCalendarEvent devuelve null y no se
// modifica nada extra.
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

  // Sincronización con Google Calendar (placeholder — hoy es no-op).
  // Cuando se active y devuelva un eventId, lo persistimos en
  // turnos.calendar_event_id para poder borrarlo en cancelarTurno.
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

  // Placeholder Calendar — borra el evento si existe (hoy no-op).
  try {
    await deleteCalendarEvent(existing?.calendar_event_id)
  } catch (e) {
    console.warn('[useTurnos] calendar delete falló:', e?.message)
  }

  return normalizeTurno(row)
}

// =============================================================
// Hooks React
// =============================================================

export function useTurnos({ dependenciaId, fecha, estado } = {}) {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const municipioId = perfil?.municipio_id ?? null
  const enabled = !!perfil

  const query = useQuery({
    queryKey: [
      'turnos',
      municipioId   ?? '__ALL__',
      dependenciaId ?? '__ALL__',
      fecha         ?? '__ALL__',
      estado        ?? '__ALL__',
    ],
    queryFn:  () => fetchTurnos({ municipioId, dependenciaId, fecha, estado }),
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
