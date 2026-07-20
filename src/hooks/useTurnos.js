import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ARG_OFFSET, todayArgYMD } from '../lib/datetime'
import { createCalendarEvent, deleteCalendarEvent } from '../lib/googleCalendar'

const TIMEOUT_MS = 8000

// Joins resuelven nombres de vecino, profesional y dependencia
// para que la UI no necesite consultas extra. Si las RLS de esas
// tablas bloquean el join, el campo viene null y el componente
// muestra '—'.
const TURNO_SELECT = `
  id, municipio_id, dependencia_id, vecino_id, profesional_id,
  fecha, hora_inicio, hora_fin, estado, canal, numero_turno,
  calendar_event_id, recordatorio_enviado, motivo, especialidad,
  metadata, created_at,
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
// Las fechas son YYYY-MM-DD en horario Argentina.
export async function fetchTurnos({
  municipioId, dependenciaId, fecha, fechaFrom, fechaTo, estado,
} = {}) {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

  // 🔍 DEBUG LOG - Query params
  console.log('[DEBUG fetchTurnos] QUERY PARAMS:', {
    municipioId,
    dependenciaId,
    fecha,
    fechaFrom,
    fechaTo,
    estado,
    tabla: 'turnos_agenda'
  })

  try {
    let q = supabase
      .from('turnos_agenda')
      .select(TURNO_SELECT)
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .abortSignal(controller.signal)

    if (municipioId)   q = q.eq('municipio_id', municipioId)
    if (dependenciaId) q = q.eq('dependencia_id', dependenciaId)
    if (estado)        q = q.eq('estado', estado)

    // Filtro por día único
    if (fecha) {
      q = q.eq('fecha', fecha)
    }
    // Filtro por rango
    if (fechaFrom) q = q.gte('fecha', fechaFrom)
    if (fechaTo)   q = q.lte('fecha', fechaTo)

    const { data, error } = await q

    // 🔍 DEBUG LOG - Resultado crudo de Supabase
    console.log('[DEBUG fetchTurnos] SUPABASE RESULT:', {
      rowCount: data?.length ?? 0,
      hasError: !!error,
      error: error,
      firstRow: data?.[0] ?? null,
      allRows: data
    })

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
      .from('turnos_agenda')
      .select(TURNO_SELECT)
      .eq('vecino_id', vecinoId)
      .order('fecha', { ascending: false })
      .order('hora_inicio', { ascending: false })
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
  // Si viene fecha_hora (timestamp), descomponerlo en fecha + hora_inicio + hora_fin
  let payload = { ...data }
  if (data.fecha_hora) {
    const dt = new Date(data.fecha_hora)
    const fmtDate = (d) => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Buenos_Aires',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
    const fecha = fmtDate(dt)
    const hora_inicio = dt.toTimeString().slice(0, 5) // HH:MM
    // hora_fin: +30 min por defecto si no se especifica
    const dtFin = new Date(dt.getTime() + 30 * 60 * 1000)
    const hora_fin = dtFin.toTimeString().slice(0, 5)

    delete payload.fecha_hora
    payload = { ...payload, fecha, hora_inicio, hora_fin }
  }

  const { data: row, error } = await supabase
    .from('turnos_agenda')
    .insert(payload)
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
        .from('turnos_agenda')
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
    .from('turnos_agenda')
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
    .from('turnos_agenda')
    .select('id, calendar_event_id')
    .eq('id', id)
    .single()

  const { data: row, error } = await supabase
    .from('turnos_agenda')
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

// =============================================================
// useProximosTurnos — siguiente bloque de turnos a futuro.
//
// Lo consume el Dashboard cuando "turnos hoy" viene vacío: en vez
// de mostrar un empty state seco, busca los próximos 5 turnos no
// cancelados con fecha >= hoy y los lista para que el
// operador vea el siguiente día con actividad.
//
// Solo se dispara cuando `enabled === true` (por defecto false) —
// el caller pasa true si turnosHoy.length === 0 y hay municipioId.
// =============================================================

async function fetchProximosTurnos({ municipioId, limit = 5 }) {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const hoy = todayArgYMD() // YYYY-MM-DD en TZ Argentina
    let q = supabase
      .from('turnos_agenda')
      .select(TURNO_SELECT)
      .gte('fecha', hoy)
      .neq('estado', 'cancelado')
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true })
      .limit(limit)
      .abortSignal(controller.signal)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    const { data, error } = await q
    clearTimeout(timeoutId)
    if (error) {
      console.error('[useTurnos] fetchProximosTurnos error:', error)
      throw error
    }
    return (data ?? []).map(normalizeTurno)
  } catch (e) {
    clearTimeout(timeoutId)
    if (controller.signal.aborted || e?.name === 'AbortError' || /abort/i.test(e?.message ?? '')) {
      throw new Error(`fetchProximosTurnos timeout (${TIMEOUT_MS}ms)`)
    }
    throw e
  }
}

export function useProximosTurnos({ municipioId, enabled = false, limit = 5 } = {}) {
  return useQuery({
    queryKey: ['turnos', 'proximos', municipioId ?? '__ALL__', limit],
    queryFn:  () => fetchProximosTurnos({ municipioId, limit }),
    enabled,
  })
}

// Mutación standalone para cambiar el estado de un turno desde
// fuera del scope de useTurnos (ej: AtencionDetalle marca 'ausente'
// o 'atendido' sin necesitar el resto del hook).
export function useUpdateTurnoEstado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, estado }) => updateTurnoEstado(id, estado),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['turnos'] })
      qc.invalidateQueries({ queryKey: ['turno'] })
    },
  })
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

// useDependencias(municipioIdOverride?)
//
// Por default toma el municipio del perfil. Acepta un override
// posicional para los casos en que la página resuelve el municipio
// fuera del perfil (superadmin sin municipio asignado que cae al
// "primer municipio activo" via useEffectiveMunicipioId). Esto
// permite a Sala Primeros Auxilios / Juez de Paz / SUM ubicar la dependencia
// adecuada incluso cuando perfil.municipio_id es null.
export function useDependencias(municipioIdOverride) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
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
