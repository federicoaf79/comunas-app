import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const TIMEOUT_MS = 8000

// Select con joins para resolver nombre del médico y de la dependencia
// en una sola ida. Se requieren policies de SELECT en `usuarios` y
// `dependencias` para que las filas joineadas sean visibles; si el
// caller no tiene acceso, el join devuelve null y mostramos '—'.
const CONSULTA_SELECT = `
  id, vecino_id, municipio_id, dependencia_id, medico_id, fecha,
  motivo, diagnostico, indicaciones,
  medico:medico_id ( id, nombre ),
  dependencia:dependencia_id ( id, nombre )
`

const DOCUMENTO_COLS = 'id, vecino_id, municipio_id, consulta_id, tipo, descripcion, storage_path, mime_type, uploaded_by, created_at'

// Aplana los joins a strings simples para que el componente
// ConsultaCard no necesite saber del shape de PostgREST.
function normalizeConsulta(c) {
  return {
    ...c,
    medico:             c.medico?.nombre ?? null,
    dependencia_nombre: c.dependencia?.nombre ?? null,
  }
}

export async function fetchConsultas(vecinoId) {
  if (!vecinoId) return []

  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const { data, error } = await supabase
      .from('hc_consultas')
      .select(CONSULTA_SELECT)
      .eq('vecino_id', vecinoId)
      .order('fecha', { ascending: false })
      .abortSignal(controller.signal)
    clearTimeout(timeoutId)
    if (error) {
      console.error('[useHC] fetchConsultas error:', error)
      throw error
    }
    return (data ?? []).map(normalizeConsulta)
  } catch (e) {
    clearTimeout(timeoutId)
    if (controller.signal.aborted || e?.name === 'AbortError' || /abort/i.test(e?.message ?? '')) {
      const err = new Error(`fetchConsultas timeout (${TIMEOUT_MS}ms)`)
      console.error('[useHC] fetchConsultas timeout:', err.message)
      throw err
    }
    throw e
  }
}

export async function createConsulta(data) {
  const { data: row, error } = await supabase
    .from('hc_consultas')
    .insert(data)
    .select(CONSULTA_SELECT)
    .single()
  if (error) {
    console.error('[useHC] createConsulta error:', error)
    throw error
  }
  return normalizeConsulta(row)
}

export async function fetchDocumentos(vecinoId) {
  if (!vecinoId) return []
  const { data, error } = await supabase
    .from('hc_documentos')
    .select(DOCUMENTO_COLS)
    .eq('vecino_id', vecinoId)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[useHC] fetchDocumentos error:', error)
    throw error
  }
  return data ?? []
}

export async function createDocumento(data) {
  const { data: row, error } = await supabase
    .from('hc_documentos')
    .insert(data)
    .select(DOCUMENTO_COLS)
    .single()
  if (error) {
    console.error('[useHC] createDocumento error:', error)
    throw error
  }
  return row
}

// Resuelve municipio_id para el insert de consulta:
// 1) del perfil del usuario (admin_comuna/operador)
// 2) si no, lookup al municipio del vecino (caso superadmin)
async function resolveMunicipioForVecino(perfil, vecinoId) {
  if (perfil?.municipio_id) return perfil.municipio_id
  const { data, error } = await supabase
    .from('vecinos')
    .select('municipio_id')
    .eq('id', vecinoId)
    .single()
  if (error) throw new Error('No se pudo determinar el municipio del vecino.')
  return data.municipio_id
}

// Resuelve dependencia_id (NOT NULL en hc_consultas):
// 1) primera de `perfil.dependencias_ids` si existe
// 2) si no, primera dependencia del municipio (preferir tipo CAPS)
async function resolveDependenciaForMunicipio(perfil, municipioId) {
  const fromPerfil = perfil?.dependencias_ids?.[0]
  if (fromPerfil) return fromPerfil
  const { data, error } = await supabase
    .from('dependencias')
    .select('id, tipo')
    .eq('municipio_id', municipioId)
    .limit(20)
  if (error || !data?.length) {
    throw new Error('No hay dependencias cargadas para este municipio.')
  }
  const caps = data.find(d => d.tipo === 'caps')
  return (caps ?? data[0]).id
}

export function useHC(vecinoId) {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const enabled = !!perfil && !!vecinoId

  const consultasQuery = useQuery({
    queryKey: ['hc', 'consultas', vecinoId ?? '__none__'],
    queryFn:  () => fetchConsultas(vecinoId),
    enabled,
  })

  const documentosQuery = useQuery({
    queryKey: ['hc', 'documentos', vecinoId ?? '__none__'],
    queryFn:  () => fetchDocumentos(vecinoId),
    enabled,
  })

  const createConsultaMut = useMutation({
    // formData: { motivo, diagnostico, indicaciones }
    mutationFn: async (formData) => {
      const municipio_id   = await resolveMunicipioForVecino(perfil, vecinoId)
      const dependencia_id = await resolveDependenciaForMunicipio(perfil, municipio_id)
      // medico_id hardcodeado al usuario actual (placeholder hasta que
      // tengamos el flujo real de selección de médico).
      const medico_id      = perfil?.id

      return createConsulta({
        vecino_id: vecinoId,
        municipio_id,
        dependencia_id,
        medico_id,
        motivo:       formData.motivo ?? null,
        diagnostico:  formData.diagnostico ?? null,
        indicaciones: formData.indicaciones ?? null,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hc', 'consultas', vecinoId] }),
  })

  const createDocumentoMut = useMutation({
    mutationFn: async (data) => {
      const municipio_id = await resolveMunicipioForVecino(perfil, vecinoId)
      return createDocumento({
        vecino_id:    vecinoId,
        municipio_id,
        uploaded_by:  perfil?.id,
        ...data,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hc', 'documentos', vecinoId] }),
  })

  return {
    consultas:       consultasQuery.data ?? [],
    documentos:      documentosQuery.data ?? [],
    isLoading:       consultasQuery.isLoading,
    isFetching:      consultasQuery.isFetching,
    error:           consultasQuery.error,
    refetch:         consultasQuery.refetch,
    createConsulta:  createConsultaMut,
    createDocumento: createDocumentoMut,
  }
}
