import { useEffect, useState } from 'react'
import { supabasePublic } from '../lib/supabase'

// =============================================================
// useLogoMunicipio — fuente única del logo institucional para
// TODOS los headers del portal (home, subpáginas de formulario,
// topbar admin).
//
// Por qué un hook dedicado y no useDatosMunicipio()/bundle:
// el flujo bundle → useConfigClavePublica → useDatosMunicipio
// venía sin entregar identidad_visual de forma consistente
// (multi-municipio defense, lock de auth, timing). Este hook
// hace UNA query puntual con `supabasePublic` (cliente anon sin
// persistencia ni lock) directo a configuracion_portal. Portal
// de un solo municipio → traemos la única fila de
// 'identidad_visual' sin filtrar por municipio_id (este hook se
// usa en layouts compartidos que no siempre tienen el id a mano).
//
// React Query no se usa a propósito: queremos una lectura simple
// e independiente, sin compartir cache con el bundle problemático.
// =============================================================

export function useLogoMunicipio() {
  const [logoUrl, setLogoUrl] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    supabasePublic
      .from('configuracion_portal')
      .select('valor')
      .eq('clave', 'identidad_visual')
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && data?.valor?.logo_url) {
          setLogoUrl(data.valor.logo_url)
        }
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return { logoUrl, loading }
}
