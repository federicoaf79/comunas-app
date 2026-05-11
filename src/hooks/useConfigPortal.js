import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { supabaseAnon } from '../lib/supabaseAnon'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useConfigPortal — settings (clave/valor jsonb) del Portal
// Ciudadano por municipio.
//
// Persistencia: tabla `configuracion_portal` (creada en migration
// 20260508000003) con UNIQUE(municipio_id, clave). Se hace upsert
// sobre esa restricción para crear o actualizar la fila.
//
// RLS (migration 20260509000002):
//   - SELECT anon: solo claves del whitelist
//     (fuentes_rss, redes_sociales, datos_municipio).
//   - SELECT authenticated staff: todas las claves de su municipio,
//     incluyendo las que guardan secretos como planb_config.
// =============================================================

// ─────────────────────────────────────────────────────────────────
// Helpers genéricos por clave
// ─────────────────────────────────────────────────────────────────

// Lee `valor` de configuracion_portal para una clave dada.
// `client` es el cliente Supabase a usar — supabase (auth) en el
// admin, supabaseAnon en el portal público. Devuelve null si no
// hay fila (caller decide el fallback).
async function fetchClave({ client, municipioId, clave }) {
  let q = client
    .from('configuracion_portal')
    .select('valor, municipio_id')
    .eq('clave', clave)
    .limit(1)
  if (municipioId) q = q.eq('municipio_id', municipioId)

  const { data, error } = await q.maybeSingle()
  if (error) {
    // No spammeamos a la consola por errores de RLS — son esperables
    // cuando anon intenta leer una clave fuera del whitelist.
    if (!/permission|not allowed|policy/i.test(error.message ?? '')) {
      console.warn(`[useConfigPortal] fetchClave(${clave}) error:`, error.message)
    }
    return null
  }
  return data?.valor ?? null
}

// Hook genérico para el admin — filtra por municipio del perfil.
// `defaultValue` se devuelve cuando la query no trae fila o falla.
//
// `municipioIdOverride` permite a páginas como ConfigGeneral pasar
// un id resuelto externamente (caso superadmin con perfil.municipio_id
// = null que cae a "primer municipio activo").
export function useConfigClaveAdmin(clave, defaultValue = null, { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['config-portal', clave, 'admin', municipioId ?? '__ALL__'],
    queryFn:  async () => {
      const v = await fetchClave({ client: supabase, municipioId, clave })
      return v ?? defaultValue
    },
    enabled:  !!perfil && !!municipioId,
  })
}

// Hook genérico para el portal público — sin filtro de municipio,
// usa supabaseAnon. Solo funciona para claves del whitelist.
export function useConfigClavePublica(clave, defaultValue = null) {
  return useQuery({
    queryKey: ['config-portal', clave, '__public__'],
    queryFn:  async () => {
      const v = await fetchClave({ client: supabaseAnon, municipioId: null, clave })
      return v ?? defaultValue
    },
    staleTime: 5 * 60 * 1000, // 5 min — los settings cambian poco
  })
}

// Mutación genérica — upsert por (municipio_id, clave) reemplazando
// el `valor` jsonb completo. Invalida la familia ['config-portal']
// para que cualquier hook que la consume re-fetchee.
async function upsertClave({ municipioId, clave, valor }) {
  if (!municipioId) {
    throw new Error('No se pudo guardar: tu usuario no tiene un municipio asignado.')
  }
  const { error } = await supabase
    .from('configuracion_portal')
    .upsert(
      { municipio_id: municipioId, clave, valor },
      { onConflict: 'municipio_id,clave' },
    )
  if (error) {
    console.error(`[useConfigPortal] upsertClave(${clave}) error:`, error)
    throw error
  }
}

// `municipioIdOverride` mismo motivo que en useConfigClaveAdmin:
// cubre el caso superadmin (perfil.municipio_id null) que necesita
// elegir un municipio destino para el upsert.
export function useUpsertConfigClave(clave, { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useMutation({
    mutationFn: (valor) => upsertClave({ municipioId, clave, valor }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['config-portal', clave] }),
  })
}

// ─────────────────────────────────────────────────────────────────
// Fuentes RSS — wrappers específicos sobre los helpers genéricos
// ─────────────────────────────────────────────────────────────────

// Defaults que la app usa cuando no hay config persistida (primer
// uso, fila sin crear, o RLS bloquea la lectura). Selección pensada
// para municipios rurales del interior: gestión municipal, clima,
// agro y vida en sociedades chicas. El componente cae a corsproxy.io
// si rss2json falla para alguno de estos feeds.
//
// Las fuentes nuevas usan `nombre`; el componente acepta tanto
// `nombre` como `label` para compatibilidad con configs viejas
// guardadas vía /admin/config (que persistían `label`).
export const DEFAULT_FUENTES_RSS = [
  {
    key:    'entrerriano-municipios',
    nombre: 'Municipios — Interior',
    url:    'https://www.entrerrianodigital.com/categoria/municipios/feed/',
    home:   'https://www.entrerrianodigital.com',
    active: true,
    palabras_clave: ['municipio', 'interior', 'localidad', 'comisión'],
  },
  {
    key:    'entrerriano-clima',
    nombre: 'Clima — Interior',
    url:    'https://www.entrerrianodigital.com/categoria/clima/feed/',
    home:   'https://www.entrerrianodigital.com',
    active: true,
    palabras_clave: ['clima', 'lluvia', 'temperatura', 'alerta'],
  },
  {
    key:    'clarin-rural',
    nombre: 'Clarín Rural',
    url:    'https://www.clarin.com/rss/rural/',
    home:   'https://www.clarin.com',
    active: true,
    palabras_clave: ['campo', 'agro', 'cosecha', 'rural', 'soja', 'maiz'],
  },
  {
    key:    'clarin-sociedad',
    nombre: 'Clarín Sociedad',
    url:    'https://www.clarin.com/rss/sociedad/',
    home:   'https://www.clarin.com',
    active: true,
    palabras_clave: [],
  },
]

export function useFuentesRssPublicas() {
  const q = useConfigClavePublica('fuentes_rss', DEFAULT_FUENTES_RSS)
  return {
    ...q,
    data: Array.isArray(q.data) && q.data.length > 0 ? q.data : DEFAULT_FUENTES_RSS,
  }
}

export function useFuentesRssAdmin() {
  const q = useConfigClaveAdmin('fuentes_rss', DEFAULT_FUENTES_RSS)
  return {
    ...q,
    data: Array.isArray(q.data) ? q.data : DEFAULT_FUENTES_RSS,
  }
}

export function useUpsertFuentesRss() {
  return useUpsertConfigClave('fuentes_rss')
}

// ─────────────────────────────────────────────────────────────────
// Datos del municipio + redes sociales — para el footer público
// ─────────────────────────────────────────────────────────────────

// Combina datos_municipio + redes_sociales en un solo hook para que
// el footer del portal haga un solo render-loop con ambos. Cada
// pieza viene como `null` si no hay config — el caller mergea con
// sus defaults hardcodeados.
export function useDatosMunicipio() {
  const datosQ = useConfigClavePublica('datos_municipio', null)
  const redesQ = useConfigClavePublica('redes_sociales', null)
  // identidad_visual: { logo_url, favicon_url } — agregado al
  // whitelist anon en la migration 20260509000002 para que el
  // header del portal y la página de login puedan leerlo sin
  // sesión.
  const identQ = useConfigClavePublica('identidad_visual', null)
  return {
    datos:     (datosQ.data && typeof datosQ.data === 'object') ? datosQ.data : null,
    redes:     (redesQ.data && typeof redesQ.data === 'object') ? redesQ.data : null,
    identidad: (identQ.data && typeof identQ.data === 'object') ? identQ.data : null,
    isLoading: datosQ.isLoading || redesQ.isLoading || identQ.isLoading,
  }
}
