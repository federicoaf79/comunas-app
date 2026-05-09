import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useBeneficiarios — programas de Ayuda Social del municipio.
// Schema: beneficiarios (id, municipio_id, vecino_id, tipo_ayuda,
//   descripcion, estado, fecha_inicio, created_at, updated_at)
// Estados (check constraint): activo | suspendido | baja
// =============================================================

const TIMEOUT_MS = 8000

const COLS = `
  id, municipio_id, vecino_id, tipo_ayuda, descripcion,
  estado, fecha_inicio, created_at, updated_at,
  vecino:vecino_id ( id, dni, nombre, apellido, nombre_completo, telefono )
`

function withTimeout() {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

export async function fetchBeneficiarios({ municipioId, estado } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase
      .from('beneficiarios')
      .select(COLS)
      .order('fecha_inicio', { ascending: false })
      .abortSignal(signal)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    if (estado)      q = q.eq('estado', estado)
    const { data, error } = await q
    clear()
    if (error) {
      console.error('[useBeneficiarios] fetchBeneficiarios error:', error)
      throw error
    }
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function useBeneficiarios(filters = {}) {
  const { perfil } = useAuth()
  const municipioId = perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['beneficiarios', municipioId ?? '__ALL__', filters.estado ?? ''],
    queryFn:  () => fetchBeneficiarios({ municipioId, ...filters }),
    enabled:  !!perfil,
  })
}

export async function createBeneficiario(data) {
  const { data: row, error } = await supabase
    .from('beneficiarios')
    .insert({ ...data, estado: data.estado ?? 'activo' })
    .select(COLS)
    .single()
  if (error) {
    console.error('[useBeneficiarios] createBeneficiario error:', error)
    throw error
  }
  return row
}

export async function updateBeneficiarioEstado(id, estado) {
  const { data: row, error } = await supabase
    .from('beneficiarios')
    .update({ estado })
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) {
    console.error('[useBeneficiarios] updateBeneficiarioEstado error:', error)
    throw error
  }
  return row
}

export function useCreateBeneficiario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createBeneficiario,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['beneficiarios'] }),
  })
}

export function useUpdateBeneficiarioEstado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, estado }) => updateBeneficiarioEstado(id, estado),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['beneficiarios'] }),
  })
}
