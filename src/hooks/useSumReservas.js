import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { monthRange } from './useAdministracion'
import { createAuditLog } from './useAuditLog'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[useSumReservas] audit log:', e.message))
}

// =============================================================
// useSumReservas — reservas del Salón de Usos Múltiples.
//
// Schema REAL en producción:
//   sum_reservas (id, municipio_id, dependencia_id, solicitante,
//     motivo, fecha, horario, estado, costo, created_at)
//
// `solicitante` es texto plano (no hay FK a vecinos) y `horario`
// es una única columna que guarda la franja completa (mañana /
// tarde / noche / día completo). No existen vecino_id,
// hora_inicio, hora_fin, cant_personas ni notas_admin.
//
// Estados: pendiente | aprobada | rechazada | cancelada | realizada
// =============================================================

const TIMEOUT_MS = 8000

// Columnas reales de sum_reservas — ÚNICA fuente de verdad para
// todas las queries del hook (SELECT, ORDER BY, INSERT whitelist).
const RESERVA_COLS =
  'id, municipio_id, dependencia_id, solicitante, motivo, fecha, horario, estado, costo, created_at'

// Subset insertable — id y created_at los completa la DB. Cualquier
// payload que llegue al hook se filtra contra esta whitelist antes
// del INSERT para evitar errores "column does not exist" si el
// caller envía campos extra (vecino_id, hora_inicio, etc).
const INSERTABLE_COLS = [
  'municipio_id', 'dependencia_id', 'solicitante', 'motivo',
  'fecha', 'horario', 'estado', 'costo',
]

function pickInsertable(data) {
  const out = {}
  for (const k of INSERTABLE_COLS) {
    if (data[k] !== undefined) out[k] = data[k]
  }
  return out
}

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
      .order('horario', { ascending: true })
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
  const payload = {
    ...pickInsertable(data),
    estado: data.estado ?? 'pendiente',
  }
  const { data: row, error } = await supabase
    .from('sum_reservas')
    .insert(payload)
    .select(RESERVA_COLS)
    .single()
  if (error) {
    console.error('[useSumReservas] createSumReserva error:', error)
    throw error
  }
  logAudit({
    accion: 'create', entidad: 'sum_reservas', entidadId: row.id,
    descripcion: `Reserva de SUM — ${row.solicitante ?? row.id} (${row.fecha})`,
  })
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
  logAudit({
    accion: 'update', entidad: 'sum_reservas', entidadId: id,
    descripcion: `Reserva de SUM "${row.solicitante ?? id}" → ${estado}`,
  })
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
