import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useSeguros — gestión de pólizas de seguros y elementos cubiertos
//
// Schema asumido (existente en Supabase):
//   seguros       (id, municipio_id, compania, numero_poliza,
//                  tipo, tipo_cobertura, vigencia_desde, vigencia_hasta,
//                  costo, observaciones, poliza_url, created_at)
//   seguros_items (id, seguro_id, tipo_entidad, entidad_id,
//                  created_at)
//
// Bucket 'seguros' en Storage (privado, requiere auth).
// =============================================================

const TIMEOUT_MS = 8000

const SEG_COLS = `
  id, municipio_id, compania, numero_poliza, tipo, tipo_cobertura,
  vigencia_desde, vigencia_hasta, costo, observaciones, poliza_url,
  created_at
`
const ITEM_COLS = `
  id, seguro_id, tipo_entidad, entidad_id, created_at
`

function withTimeout() {
  const c = new AbortController()
  const id = setTimeout(() => c.abort(), TIMEOUT_MS)
  return { signal: c.signal, clear: () => clearTimeout(id) }
}

// ─────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────

async function fetchSeguros({ municipioId, tipo } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase.from('seguros').select(SEG_COLS)
      .order('vigencia_hasta', { ascending: false })
      .abortSignal(signal)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    if (tipo) q = q.eq('tipo', tipo)
    const { data, error } = await q
    clear()
    if (error) throw error
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

async function fetchSeguro(id) {
  const { signal, clear } = withTimeout()
  try {
    const { data, error } = await supabase
      .from('seguros').select(SEG_COLS)
      .eq('id', id)
      .abortSignal(signal)
      .single()
    clear()
    if (error) throw error
    return data
  } catch (e) {
    clear()
    throw e
  }
}

async function fetchSeguroItems(seguroId) {
  const { signal, clear } = withTimeout()
  try {
    const { data, error } = await supabase
      .from('seguros_items').select(ITEM_COLS)
      .eq('seguro_id', seguroId)
      .order('created_at', { ascending: false })
      .abortSignal(signal)
    clear()
    if (error) throw error
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

// Query para obtener el seguro de un vehículo específico
async function fetchSeguroByVehiculo(vehiculoId) {
  const { signal, clear } = withTimeout()
  try {
    // Buscar item de tipo vehiculo
    const { data: items, error: itemsError } = await supabase
      .from('seguros_items')
      .select('seguro_id')
      .eq('tipo_entidad', 'vehiculo')
      .eq('entidad_id', vehiculoId)
      .abortSignal(signal)
      .maybeSingle()
    clear()
    if (itemsError) throw itemsError
    if (!items) return null

    // Obtener el seguro
    const { data: seguro, error: seguroError } = await supabase
      .from('seguros')
      .select(SEG_COLS)
      .eq('id', items.seguro_id)
      .single()
    if (seguroError) throw seguroError
    return seguro
  } catch (e) {
    clear()
    throw e
  }
}

export function useSeguros(municipioId, { tipo } = {}) {
  const { perfil } = useAuth()
  return useQuery({
    queryKey: ['seguros', municipioId ?? '__ALL__', tipo ?? ''],
    queryFn:  () => fetchSeguros({ municipioId, tipo }),
    enabled:  !!perfil,
  })
}

export function useSeguro(id) {
  return useQuery({
    queryKey: ['seguro', id],
    queryFn:  () => fetchSeguro(id),
    enabled:  !!id,
  })
}

export function useSeguroItems(seguroId) {
  return useQuery({
    queryKey: ['seguro-items', seguroId],
    queryFn:  () => fetchSeguroItems(seguroId),
    enabled:  !!seguroId,
  })
}

export function useSeguroByVehiculo(vehiculoId) {
  return useQuery({
    queryKey: ['seguro-vehiculo', vehiculoId],
    queryFn:  () => fetchSeguroByVehiculo(vehiculoId),
    enabled:  !!vehiculoId,
  })
}

// ─────────────────────────────────────────────────────────────────
// Mutaciones
// ─────────────────────────────────────────────────────────────────

async function createSeguro(data) {
  const { data: row, error } = await supabase
    .from('seguros').insert(data).select(SEG_COLS).single()
  if (error) throw error
  return row
}

async function updateSeguro({ id, ...data }) {
  const { error } = await supabase
    .from('seguros').update(data).eq('id', id)
  if (error) throw error
}

async function deleteSeguro(id) {
  // Primero eliminar items vinculados
  const { error: itemsError } = await supabase
    .from('seguros_items').delete().eq('seguro_id', id)
  if (itemsError) throw itemsError

  // Luego eliminar el seguro
  const { error } = await supabase
    .from('seguros').delete().eq('id', id)
  if (error) throw error
}

async function addSeguroItem(data) {
  const { data: row, error } = await supabase
    .from('seguros_items').insert(data).select(ITEM_COLS).single()
  if (error) throw error
  return row
}

async function removeSeguroItem(id) {
  const { error } = await supabase
    .from('seguros_items').delete().eq('id', id)
  if (error) throw error
}

// Upload de póliza al bucket 'seguros'
async function uploadPoliza({ file, municipioId, seguroId }) {
  if (!municipioId || !seguroId) throw new Error('municipioId y seguroId son requeridos')

  const ext = file.name.split('.').pop()
  const path = `${municipioId}/${seguroId}/poliza.${ext}`

  const { error } = await supabase.storage
    .from('seguros')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: true,
    })

  if (error) {
    console.error('[useSeguros] upload error:', error)
    throw new Error(error.message ?? 'No pudimos subir el archivo.')
  }

  // Obtener URL privada (requiere auth)
  const { data } = supabase.storage.from('seguros').getPublicUrl(path)
  return data.publicUrl
}

export function useCreateSeguro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createSeguro,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['seguros'] }),
  })
}

export function useUpdateSeguro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateSeguro,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['seguros'] })
      qc.invalidateQueries({ queryKey: ['seguro'] })
    },
  })
}

export function useDeleteSeguro() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteSeguro,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['seguros'] }),
  })
}

export function useAddSeguroItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: addSeguroItem,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['seguro-items'] })
      qc.invalidateQueries({ queryKey: ['seguro-vehiculo'] })
    },
  })
}

export function useRemoveSeguroItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: removeSeguroItem,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['seguro-items'] })
      qc.invalidateQueries({ queryKey: ['seguro-vehiculo'] })
    },
  })
}

export function useUploadPoliza() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: uploadPoliza,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['seguros'] })
      qc.invalidateQueries({ queryKey: ['seguro'] })
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────

export const TIPOS_SEGURO = [
  { value: 'flota_vehiculos',      label: 'Flota de vehículos' },
  { value: 'inmuebles',            label: 'Inmuebles' },
  { value: 'vida',                 label: 'Vida' },
  { value: 'art',                  label: 'ART' },
  { value: 'responsabilidad_civil', label: 'Responsabilidad Civil' },
  { value: 'otro',                 label: 'Otro' },
]

// Días que faltan para `iso` desde hoy (negativo si vencido)
export function diasParaVencer(iso) {
  if (!iso) return null
  const target = new Date(iso)
  const today  = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
