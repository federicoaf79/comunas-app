import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { supabaseAnon } from '../lib/supabaseAnon'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useDependenciaPublica — info enriquecida de una dependencia para
// la página pública /portal/dependencia/:tipo y su CMS.
//
// Columnas extra en `dependencias` (agregadas manualmente en la DB
// del cliente, según indica el sprint):
//   - descripcion_larga  text
//   - servicios          text[]   (lista de servicios ofrecidos)
//   - fotos              text[]   (URLs de fotos del lugar)
//   - canal_atencion     text     ('presencial' | 'online' | 'mixto')
//   - email_contacto     text
//   - whatsapp           text     (solo dígitos)
// =============================================================

// Columnas opcionales (horario_atencion / telefono / direccion / slug)
// se incluyen en el SELECT — si el municipio todavía no corrió la
// migration 20260513_dependencias_portal_extras, PostgREST las
// ignora con un error y caemos al SELECT base sin esos campos.
const COLUMNS_BASE   = 'id, municipio_id, nombre, tipo, capa, activa, descripcion_larga, servicios, fotos, canal_atencion, email_contacto, whatsapp'
const COLUMNS_EXTRA  = 'horario_atencion, telefono, direccion, slug'
const COLUMNS        = `${COLUMNS_BASE}, ${COLUMNS_EXTRA}`

// Normaliza un identificador para matcheo flexible: minúsculas, sin
// acentos, sin espacios/guiones/underscores. "Alumbrado Público" y
// "alumbrado-publico" colapsan al mismo string.
function normalizar(s) {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\s_\-/]+/g, '')
}

async function fetchDependenciasPublicas(municipioId) {
  // Intento 1 — con columnas extra. Si el schema todavía no las tiene,
  // Postgres devuelve un error 42703 y reintento con COLUMNS_BASE.
  let q = supabaseAnon
    .from('dependencias')
    .select(COLUMNS)
    .eq('activa', true)
  if (municipioId) q = q.eq('municipio_id', municipioId)
  let { data, error } = await q
  if (error && /column.*does not exist|42703/i.test(error.message ?? '')) {
    q = supabaseAnon
      .from('dependencias')
      .select(COLUMNS_BASE)
      .eq('activa', true)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    ;({ data, error } = await q)
  }
  if (error) {
    console.warn('[useDependenciaPublica] error:', error.message)
    return []
  }
  return data ?? []
}

// Lectura pública por slug/tipo/nombre dentro de un municipio.
// Matching flexible: normalizamos el input y cada candidato a una
// versión sin acentos / sin separadores, y devolvemos la primera
// dependencia activa cuyo slug, tipo o nombre coincida.
export function useDependenciaPublica(slug, municipioId) {
  return useQuery({
    queryKey: ['dependencia-publica', slug ?? '__none__', municipioId ?? '__any__'],
    queryFn:  async () => {
      if (!slug) return null
      const candidatos = await fetchDependenciasPublicas(municipioId)
      const target = normalizar(slug)
      // Prioridad: slug exacto → tipo exacto → nombre exacto →
      // contiene. La búsqueda parcial usa "incluye" para tolerar
      // tipos compuestos (ej. "alumbrado" matchea "alumbrado_publico").
      const match = candidatos.find(d => normalizar(d.slug) === target)
                 ?? candidatos.find(d => normalizar(d.tipo) === target)
                 ?? candidatos.find(d => normalizar(d.nombre) === target)
                 ?? candidatos.find(d => {
                       const nt = normalizar(d.tipo)
                       return !!nt && (nt.includes(target) || target.includes(nt))
                     })
      return match ?? null
    },
    staleTime: 5 * 60 * 1000,
  })
}

// Listado para el CMS — todas las dependencias activas del municipio
// del perfil, con las columnas enriquecidas.
export function useDependenciasAdmin({ municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['dependencias-admin', municipioId ?? '__none__'],
    queryFn:  async () => {
      if (!municipioId) return []
      const { data, error } = await supabase
        .from('dependencias')
        .select(COLUMNS)
        .eq('municipio_id', municipioId)
        .order('nombre', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!municipioId,
  })
}

function safeName(name) {
  return (name || 'foto')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

// Sube una foto de dependencia al bucket `noticias` con path
// `<municipioId>/dependencias/<tipo>/<timestamp>_<safeName>`.
export async function uploadFotoDependencia({ file, municipioId, tipo }) {
  if (!municipioId) throw new Error('Falta municipio_id.')
  const path = `${municipioId}/dependencias/${tipo || 'gen'}/${Date.now()}_${safeName(file.name)}`
  const { error } = await supabase.storage
    .from('noticias')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert:      false,
    })
  if (error) throw new Error(error.message ?? 'No pudimos subir la foto.')
  const { data } = supabase.storage.from('noticias').getPublicUrl(path)
  return data.publicUrl
}

export function useUpdateDependenciaPublica() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...changes }) => {
      const { data, error } = await supabase
        .from('dependencias')
        .update(changes)
        .eq('id', id)
        .select(COLUMNS)
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dependencias-admin'] })
      qc.invalidateQueries({ queryKey: ['dependencia-publica'] })
      qc.invalidateQueries({ queryKey: ['dependencias-publicas'] })
    },
  })
}
