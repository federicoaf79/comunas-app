import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useExpedientes — expedientes administrados por Juez de Paz.
// Schema: expedientes_juzgado (ver migration 20260512).
// Estados: abierto | en_proceso | cerrado | derivado
// =============================================================

const TIMEOUT_MS = 8000

const COLS = `
  id, municipio_id, dependencia_id, numero, tipo, caratula,
  estado, prioridad, vecino_id, contraparte, responsable_id,
  fecha_apertura, fecha_cierre, proxima_audiencia,
  observaciones, metadatos, created_at, updated_at,
  vecino:vecino_id ( id, dni, nombre, apellido, nombre_completo, telefono ),
  responsable:responsable_id ( id, nombre, apellido )
`

function withTimeout() {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

export async function fetchExpedientes({ municipioId, dependenciaId, estado, tipo } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase
      .from('expedientes_juzgado')
      .select(COLS)
      .order('fecha_apertura', { ascending: false })
      .abortSignal(signal)
    if (municipioId)   q = q.eq('municipio_id', municipioId)
    if (dependenciaId) q = q.eq('dependencia_id', dependenciaId)
    if (estado)        q = q.eq('estado', estado)
    if (tipo)          q = q.eq('tipo', tipo)
    const { data, error } = await q
    clear()
    if (error) {
      console.error('[useExpedientes] fetchExpedientes error:', error)
      throw error
    }
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function useExpedientes(filters = {}) {
  const { perfil } = useAuth()
  return useQuery({
    queryKey: [
      'expedientes_juzgado',
      filters.municipioId ?? perfil?.municipio_id ?? '__ALL__',
      filters.dependenciaId ?? '',
      filters.estado ?? '',
      filters.tipo ?? '',
    ],
    queryFn:  () => fetchExpedientes({
      municipioId: filters.municipioId ?? perfil?.municipio_id ?? null,
      ...filters,
    }),
    enabled:  !!perfil && !!filters.dependenciaId,
  })
}

export async function createExpediente(data) {
  const { data: row, error } = await supabase
    .from('expedientes_juzgado')
    .insert({
      ...data,
      estado:    data.estado    ?? 'abierto',
      prioridad: data.prioridad ?? 'normal',
    })
    .select(COLS)
    .single()
  if (error) {
    console.error('[useExpedientes] createExpediente error:', error)
    throw error
  }
  return row
}

export async function updateExpediente(id, patch) {
  const { data: row, error } = await supabase
    .from('expedientes_juzgado')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) {
    console.error('[useExpedientes] updateExpediente error:', error)
    throw error
  }
  return row
}

export function useCreateExpediente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createExpediente,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['expedientes_juzgado'] }),
  })
}

export function useUpdateExpediente() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }) => updateExpediente(id, patch),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['expedientes_juzgado'] }),
  })
}
