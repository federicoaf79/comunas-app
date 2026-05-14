import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, supabasePublic } from '../lib/supabase'
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
// admin, supabasePublic en el portal público. Devuelve null si no
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

// ─────────────────────────────────────────────────────────────────
// Bundle público — UNA query trae todas las claves del whitelist
// anon. Reemplaza ~7 SELECTs paralelos por 1, lo que evitaba que
// Supabase JS pelee por el navigator-lock ('Lock:comunas-auth was
// released because another request stole it') al montar el portal.
//
// Cada hook público (useConfigClavePublica, usePortalMunicipioId,
// useHistoriaMunicipio) ahora deriva del bundle vía el cache de
// React Query — no hacen su propio fetch.
// ─────────────────────────────────────────────────────────────────

// Claves que el portal público lee. DEBE coincidir con el whitelist
// anon en RLS (ver 20260514_historia_anon.sql / _tramites_portal_anon /
// _hero_carousel_anon). Si se agrega una clave anon nueva, sumar acá.
const PORTAL_BUNDLE_CLAVES = [
  'datos_municipio',
  'redes_sociales',
  'identidad_visual',
  'historia_municipio',
  'hero_slides',
  'tramites_portal',
  'fuentes_rss',
]

async function fetchPortalConfigBundle() {
  const { data, error } = await supabasePublic
    .from('configuracion_portal')
    .select('clave, valor, municipio_id')
    .in('clave', PORTAL_BUNDLE_CLAVES)
  if (error) {
    if (!/permission|policy/i.test(error.message ?? '')) {
      console.warn('[usePortalConfigBundle] error:', error.message)
    }
    return { byClave: {}, municipio_id: null }
  }

  // Multi-municipio defense: si la DB tiene rows para varios
  // municipios, anclamos al municipio de datos_municipio y descartamos
  // el resto (mismo criterio que el comportamiento previo que
  // implícitamente tomaba el primero por .limit(1)).
  const rows = data ?? []
  const datosRow = rows.find(r => r.clave === 'datos_municipio')
  const municipio_id = datosRow?.municipio_id ?? rows[0]?.municipio_id ?? null
  const byClave = {}
  for (const r of rows) {
    if (municipio_id && r.municipio_id && r.municipio_id !== municipio_id) continue
    byClave[r.clave] = r.valor
  }
  return { byClave, municipio_id }
}

// Hook centralizado — el resto de las lecturas públicas se derivan
// de éste para que solo haya 1 query en vuelo.
export function usePortalConfigBundle() {
  return useQuery({
    queryKey: ['portal-config-bundle'],
    queryFn:  fetchPortalConfigBundle,
    staleTime: 5 * 60 * 1000,
  })
}

// Hook genérico para el portal público — derivado del bundle. Las
// claves fuera del whitelist quedan en `defaultValue` (RLS las
// bloquea igual, así que ahorramos la network call).
export function useConfigClavePublica(clave, defaultValue = null) {
  const bundle = usePortalConfigBundle()
  const valor = bundle.data?.byClave?.[clave]
  return {
    ...bundle,
    data: valor ?? defaultValue,
  }
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
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['config-portal', clave] })
      // Bundle público lee todas las claves de configuracion_portal
      // en una sola query — hay que invalidarlo también para que el
      // portal refresque después de guardar desde el admin.
      qc.invalidateQueries({ queryKey: ['portal-config-bundle'] })
    },
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

// ─────────────────────────────────────────────────────────────────
// Resolver del municipio del portal (público)
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// Sala PA — configuración operativa
// ─────────────────────────────────────────────────────────────────

// Defaults del módulo Sala PA. `duracion_turno_min` controla la
// duración estándar de cada turno. Se muestra hoy en el footer de
// la planilla imprimible; en el Sprint 3 va a alimentar también el
// espaciado del calendario.
export const DEFAULT_SALA_PA_CONFIG = {
  duracion_turno_min: 30,
}

// Lectura admin de sala_pa_config (autenticada, todas las claves
// para staff). El consumer hace `{ ...DEFAULT, ...(data ?? {}) }`.
export function useSalaPaConfigAdmin({ municipioIdOverride } = {}) {
  return useConfigClaveAdmin('sala_pa_config', DEFAULT_SALA_PA_CONFIG, {
    municipioIdOverride,
  })
}

export function useUpsertSalaPaConfig({ municipioIdOverride } = {}) {
  return useUpsertConfigClave('sala_pa_config', { municipioIdOverride })
}

// usePortalMunicipioId — devuelve el `municipio_id` del portal
// público. Derivado del bundle (ver usePortalConfigBundle), que
// extrae el municipio_id desde la fila `datos_municipio`. Antes
// hacía su propia query — ahora comparte la del bundle.
export function usePortalMunicipioId() {
  const bundle = usePortalConfigBundle()
  return {
    ...bundle,
    data: bundle.data?.municipio_id ?? null,
  }
}
