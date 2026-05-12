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

const COLUMNS = 'id, municipio_id, nombre, tipo, capa, activo, descripcion_larga, servicios, fotos, canal_atencion, email_contacto, whatsapp'

// Lectura pública por `tipo` dentro de un municipio. Devuelve la
// primer dependencia activa que matchee.
export function useDependenciaPublica(tipo, municipioId) {
  return useQuery({
    queryKey: ['dependencia-publica', tipo ?? '__none__', municipioId ?? '__any__'],
    queryFn:  async () => {
      if (!tipo) return null
      let q = supabaseAnon
        .from('dependencias')
        .select(COLUMNS)
        .eq('tipo', tipo)
        .eq('activo', true)
        .limit(1)
      if (municipioId) q = q.eq('municipio_id', municipioId)
      const { data, error } = await q.maybeSingle()
      if (error) {
        console.warn('[useDependenciaPublica] error:', error.message)
        return null
      }
      return data ?? null
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
