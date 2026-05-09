import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { supabaseAnon } from '../lib/supabaseAnon'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useConfigPortal — settings (clave/valor jsonb) del Portal
// Ciudadano por municipio. Hoy se usa para gestionar las fuentes
// RSS de la sección "Noticias de Argentina".
//
// Persistencia: tabla `configuracion_portal` (creada en migration
// 20260508000003) con UNIQUE(municipio_id, clave). Se hace upsert
// sobre esa restricción para crear o actualizar la fila.
// =============================================================

const CLAVE_FUENTES_RSS = 'fuentes_rss'

// Defaults que la app usa cuando no hay config persistida (primer
// uso, fila sin crear, o RLS bloquea la lectura). Estos dos feeds
// pasan el filtro CORS del plan gratuito de rss2json y, si llegan
// a fallar, el componente cae automáticamente a corsproxy.io + parseo
// manual del XML (ver NoticiasProvinciales.jsx).
export const DEFAULT_FUENTES_RSS = [
  {
    key:   'infobae',
    label: 'Infobae',
    url:   'https://www.infobae.com/feed/',
    home:  'https://www.infobae.com/',
    active: true,
    palabras_clave: [],
  },
  {
    key:   'clarin',
    label: 'Clarín',
    url:   'https://www.clarin.com/rss/lo-ultimo/',
    home:  'https://www.clarin.com/',
    active: true,
    palabras_clave: [],
  },
]

// ─────────────────────────────────────────────────────────────────
// Lecturas (anon o staff)
// ─────────────────────────────────────────────────────────────────

// Lee las fuentes RSS configuradas. Como el portal público las usa
// sin login, va por supabaseAnon. Si la query falla o no hay fila
// el caller decide el fallback (típicamente DEFAULT_FUENTES_RSS).
async function fetchFuentesRss(municipioId) {
  let q = supabaseAnon
    .from('configuracion_portal')
    .select('valor, municipio_id')
    .eq('clave', CLAVE_FUENTES_RSS)
    .limit(1)
  // Si tenemos municipio (admin u otro contexto con perfil),
  // filtramos por el suyo. En el portal público (sin perfil) no
  // filtramos: cualquier config disponible alcanza para mostrar.
  if (municipioId) q = q.eq('municipio_id', municipioId)

  const { data, error } = await q.maybeSingle()
  if (error) {
    console.warn('[useConfigPortal] fetchFuentesRss error:', error.message)
    return null
  }
  if (!data?.valor) return null
  return Array.isArray(data.valor) ? data.valor : null
}

// Hook para el portal público — siempre devuelve un array de fuentes
// activas (o los defaults si no hay config). Sin filtro por municipio
// porque es contexto anon.
export function useFuentesRssPublicas() {
  return useQuery({
    queryKey: ['config-portal', 'fuentes_rss', '__public__'],
    queryFn:  async () => {
      const fromDb = await fetchFuentesRss(null)
      return fromDb ?? DEFAULT_FUENTES_RSS
    },
    staleTime: 5 * 60 * 1000, // 5 min — cambios en config no son frecuentes
  })
}

// Hook para el admin — devuelve TODAS las fuentes (activas e inactivas)
// del municipio del operador, con fallback a defaults. Filtra por
// municipio_id del perfil para que cada admin vea solo lo suyo.
export function useFuentesRssAdmin() {
  const { perfil } = useAuth()
  const municipioId = perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['config-portal', 'fuentes_rss', 'admin', municipioId ?? '__ALL__'],
    queryFn:  async () => {
      const fromDb = await fetchFuentesRss(municipioId)
      return fromDb ?? DEFAULT_FUENTES_RSS
    },
    enabled: !!perfil,
  })
}

// ─────────────────────────────────────────────────────────────────
// Mutación — upsert del array completo
// ─────────────────────────────────────────────────────────────────

// El admin manipula la lista en memoria (toggle, alta, edición,
// borrado) y al confirmar persiste el array entero. Es simple y
// evita conflictos de concurrencia tipo "alguien borró un item
// mientras vos editabas otro".
async function upsertFuentesRss({ municipioId, fuentes }) {
  if (!municipioId) {
    throw new Error('No se pudo guardar: tu usuario no tiene un municipio asignado.')
  }
  const payload = {
    municipio_id: municipioId,
    clave:        CLAVE_FUENTES_RSS,
    valor:        fuentes,
  }
  const { error } = await supabase
    .from('configuracion_portal')
    .upsert(payload, { onConflict: 'municipio_id,clave' })
  if (error) {
    console.error('[useConfigPortal] upsertFuentesRss error:', error)
    throw error
  }
}

export function useUpsertFuentesRss() {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const municipioId = perfil?.municipio_id ?? null
  return useMutation({
    mutationFn: (fuentes) => upsertFuentesRss({ municipioId, fuentes }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['config-portal'] }),
  })
}
