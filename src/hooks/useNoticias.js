import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const TIMEOUT_MS = 8000

const NOTICIA_SELECT =
  'id, municipio_id, titulo, resumen, contenido, categoria, imagen_url, autor, publicado_at, estado'

// fetchNoticiasPublicadas: lista pública de noticias en estado
// 'publicada', orden DESC por publicado_at. Para que funcione sin
// auth la tabla `noticias` necesita una RLS policy que permita
// SELECT a anon cuando estado='publicada'
// (ver supabase/migrations/20250507000001_noticias_public_read.sql).
export async function fetchNoticiasPublicadas({ limit = 20 } = {}) {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const { data, error } = await supabase
      .from('noticias')
      .select(NOTICIA_SELECT)
      .eq('estado', 'publicada')
      .order('publicado_at', { ascending: false })
      .limit(limit)
      .abortSignal(controller.signal)
    clearTimeout(timeoutId)
    if (error) {
      console.error('[useNoticias] fetchNoticiasPublicadas error:', error)
      throw error
    }
    return data ?? []
  } catch (e) {
    clearTimeout(timeoutId)
    if (controller.signal.aborted || e?.name === 'AbortError' || /abort/i.test(e?.message ?? '')) {
      const err = new Error(`fetchNoticiasPublicadas timeout (${TIMEOUT_MS}ms)`)
      console.error('[useNoticias] fetchNoticiasPublicadas timeout:', err.message)
      throw err
    }
    throw e
  }
}

// Hook React. NO depende de perfil — corre con la anon key,
// destinado al portal público.
export function useNoticias({ limit = 20 } = {}) {
  return useQuery({
    queryKey: ['noticias', 'publicadas', limit],
    queryFn:  () => fetchNoticiasPublicadas({ limit }),
  })
}
