import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { monthRange } from './useAdministracion'

// =============================================================
// useSumReservas — reservas del Salón de Usos Múltiples.
//
// Schema:
//   sum_reservas (id, municipio_id, vecino_id, dependencia_id,
//     fecha date, hora_inicio time, hora_fin time, motivo,
//     cant_personas, estado, aprobado_por, notas_admin, costo,
//     created_at)
//
// Estados (check constraint en la DB):
//   pendiente | aprobada | rechazada | cancelada | realizada
// =============================================================

const TIMEOUT_MS = 8000

const RESERVA_COLS = `
  id, municipio_id, dependencia_id, vecino_id, fecha,
  hora_inicio, hora_fin, motivo, cant_personas, estado,
  costo, notas_admin, created_at,
  vecino:vecino_id ( id, dni, nombre, apellido, nombre_completo, telefono )
`

function withTimeout() {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

export async function fetchSumReservas({ municipioId, mes, estado } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase
      .from('sum_reservas')
      .select(RESERVA_COLS)
      .order('fecha', { ascending: false })
      .order('hora_inicio', { ascending: true })
      .abortSignal(signal)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    if (estado)      q = q.eq('estado', estado)
    if (mes) {
      const { first, next } = monthRange(mes)
      q = q.gte('fecha', first).lt('fecha', next)
    }
    const { data, error } = await q
    clear()
    if (error) {
      console.error('[useSumReservas] fetchSumReservas error:', error)
      throw error
    }
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function useSumReservas(filters = {}) {
  const { perfil } = useAuth()
  const municipioId = perfil?.municipio_id ?? null
  return useQuery({
    queryKey: [
      'sum_reservas',
      municipioId ?? '__ALL__',
      filters.mes    ?? '',
      filters.estado ?? '',
    ],
    queryFn: () => fetchSumReservas({ municipioId, ...filters }),
    enabled: !!perfil,
  })
}

export async function createSumReserva(data) {
  const { data: row, error } = await supabase
    .from('sum_reservas')
    .insert({ ...data, estado: data.estado ?? 'pendiente' })
    .select(RESERVA_COLS)
    .single()
  if (error) {
    console.error('[useSumReservas] createSumReserva error:', error)
    throw error
  }
  return row
}

export async function updateSumReservaEstado(id, estado) {
  const { data: row, error } = await supabase
    .from('sum_reservas')
    .update({ estado })
    .eq('id', id)
    .select(RESERVA_COLS)
    .single()
  if (error) {
    console.error('[useSumReservas] updateSumReservaEstado error:', error)
    throw error
  }
  return row
}

export function useCreateSumReserva() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createSumReserva,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['sum_reservas'] }),
  })
}

export function useUpdateSumReservaEstado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, estado }) => updateSumReservaEstado(id, estado),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['sum_reservas'] }),
  })
}
