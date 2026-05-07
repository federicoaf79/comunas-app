import { useQuery } from '@tanstack/react-query'
import { supabaseAnon } from '../lib/supabaseAnon'

const TIMEOUT_MS = 8000

const NOTICIA_SELECT =
  'id, municipio_id, titulo, resumen, contenido, categoria, imagen_url, autor, publicado_at, estado'

// fetchNoticiasPublicas: lista pública de noticias en estado
// 'publicada', orden DESC por publicado_at. Usa el cliente
// supabaseAnon (sin JWT) para garantizar que el comportamiento
// sea el mismo independientemente de si hay un usuario logueado.
export async function fetchNoticiasPublicas({ limit = 20 } = {}) {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const { data, error } = await supabaseAnon
      .from('noticias')
      .select(NOTICIA_SELECT)
      .eq('estado', 'publicada')
      .order('publicado_at', { ascending: false })
      .limit(limit)
      .abortSignal(controller.signal)
    clearTimeout(timeoutId)
    if (error) {
      console.error('[useNoticiasPublicas] fetchNoticiasPublicas error:', error)
      throw error
    }
    return data ?? []
  } catch (e) {
    clearTimeout(timeoutId)
    if (controller.signal.aborted || e?.name === 'AbortError' || /abort/i.test(e?.message ?? '')) {
      const err = new Error(`fetchNoticiasPublicas timeout (${TIMEOUT_MS}ms)`)
      console.error('[useNoticiasPublicas] timeout:', err.message)
      throw err
    }
    throw e
  }
}

export function useNoticiasPublicas({ limit = 20 } = {}) {
  return useQuery({
    queryKey: ['noticias-publicas', limit],
    queryFn:  () => fetchNoticiasPublicas({ limit }),
  })
}
