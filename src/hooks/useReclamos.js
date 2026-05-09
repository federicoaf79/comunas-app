import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useReclamos — denuncias / reclamos ciudadanos.
// Schema: reclamos (id, municipio_id, vecino_id?, tipo, descripcion,
//   ubicacion?, estado, prioridad, canal, created_at, updated_at)
//
// vecino_id es nullable — un reclamo puede ser anónimo (anon
// INSERT desde el portal sin sesión).
//
// Estados:    abierto | en_proceso | resuelto | cerrado | rechazado
// Prioridad:  baja | normal | alta | urgente
// Canal:      presencial | telefono | web | whatsapp
// =============================================================

const TIMEOUT_MS = 8000

const COLS = `
  id, municipio_id, vecino_id, tipo, descripcion, ubicacion,
  estado, prioridad, canal, created_at, updated_at,
  vecino:vecino_id ( id, dni, nombre, apellido, nombre_completo, telefono )
`

function withTimeout() {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

export async function fetchReclamos({ municipioId, estado, prioridad } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase
      .from('reclamos')
      .select(COLS)
      .order('created_at', { ascending: false })
      .abortSignal(signal)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    if (estado)      q = q.eq('estado', estado)
    if (prioridad)   q = q.eq('prioridad', prioridad)
    const { data, error } = await q
    clear()
    if (error) {
      console.error('[useReclamos] fetchReclamos error:', error)
      throw error
    }
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function useReclamos(filters = {}) {
  const { perfil } = useAuth()
  const municipioId = perfil?.municipio_id ?? null
  return useQuery({
    queryKey: [
      'reclamos',
      municipioId ?? '__ALL__',
      filters.estado    ?? '',
      filters.prioridad ?? '',
    ],
    queryFn: () => fetchReclamos({ municipioId, ...filters }),
    enabled: !!perfil,
  })
}

export async function createReclamo(data) {
  const { data: row, error } = await supabase
    .from('reclamos')
    .insert({
      ...data,
      estado:    data.estado    ?? 'abierto',
      prioridad: data.prioridad ?? 'normal',
      canal:     data.canal     ?? 'presencial',
    })
    .select(COLS)
    .single()
  if (error) {
    console.error('[useReclamos] createReclamo error:', error)
    throw error
  }
  return row
}

export async function updateReclamoEstado(id, estado) {
  const { data: row, error } = await supabase
    .from('reclamos')
    .update({ estado })
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) {
    console.error('[useReclamos] updateReclamoEstado error:', error)
    throw error
  }
  return row
}

export function useCreateReclamo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createReclamo,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['reclamos'] }),
  })
}

export function useUpdateReclamoEstado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, estado }) => updateReclamoEstado(id, estado),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['reclamos'] }),
  })
}
