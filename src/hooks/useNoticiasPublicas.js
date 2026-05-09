import { useQuery } from '@tanstack/react-query'
import { supabaseAnon } from '../lib/supabaseAnon'

const TIMEOUT_MS = 8000

// Columnas reales de la tabla `noticias` en producción.
// El "resumen" se deriva en el frontend desde `cuerpo` (substring)
// cuando no viene seteado de otra manera.
//
// El join `autor:autor_id (id, nombre)` puede devolver null para
// anon si la RLS de `usuarios` no expone esa fila — la UI degrada
// graciosamente sin mostrar el "Por [autor]".
const NOTICIA_SELECT =
  'id, titulo, cuerpo, categoria, publicado_at, imagen_url, estado, autor:autor_id ( id, nombre )'

// fetchNoticiasPublicas: lista pública de noticias en estado
// 'publicada', orden DESC por publicado_at. Usa el cliente
// supabaseAnon (que hoy re-exporta el cliente principal — la
// distinción anon/auth la hace Supabase según la sesión).
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
