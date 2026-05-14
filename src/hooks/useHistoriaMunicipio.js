import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { usePortalConfigBundle } from './useConfigPortal'

// =============================================================
// useHistoriaMunicipio — clave `historia_municipio` en
// `configuracion_portal`. Valor jsonb con la forma:
//   {
//     fundacion: number,           // año
//     resena: text,
//     importancia_regional: text,
//     recursos_naturales: text,
//     fotos: [url1, url2, ...]     // máx 5
//   }
//
// El anon SELECT está habilitado para esta clave (whitelist en RLS).
// =============================================================

const EMPTY = {
  fundacion: '',
  resena: '',
  importancia_regional: '',
  recursos_naturales: '',
  fotos: [],
}

// Lectura pública — derivada del bundle portal (usePortalConfigBundle).
// Antes hacía su propio SELECT a configuracion_portal en paralelo con
// los otros 5+ hooks del portal y eso causaba contención del lock
// `comunas-auth`. Ahora todos comparten la misma query.
//
// `municipioId` se mantiene en la firma por compatibilidad, pero el
// bundle ya viene anclado al municipio del portal — el filtro queda
// implícito (multi-municipio defense vive en el bundle).
export function useHistoriaMunicipio(municipioId) { // eslint-disable-line no-unused-vars
  const bundle = usePortalConfigBundle()
  const valor = bundle.data?.byClave?.historia_municipio
  const data = { ...EMPTY, ...(valor && typeof valor === 'object' ? valor : {}) }
  return { ...bundle, data }
}

// Lectura admin — usa el cliente autenticado para que también lea
// cuando la fila aún no fue agregada al whitelist público.
export function useHistoriaMunicipioAdmin({ municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['historia-municipio', 'admin', municipioId ?? '__none__'],
    queryFn:  async () => {
      if (!municipioId) return EMPTY
      const { data, error } = await supabase
        .from('configuracion_portal')
        .select('valor')
        .eq('clave', 'historia_municipio')
        .eq('municipio_id', municipioId)
        .maybeSingle()
      if (error) {
        console.warn('[useHistoriaMunicipioAdmin] error:', error.message)
        return EMPTY
      }
      return { ...EMPTY, ...(data?.valor ?? {}) }
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

// Sube una foto de historia al bucket `noticias` con path
// `<municipioId>/historia/<timestamp>_<safeName>`.
export async function uploadFotoHistoria({ file, municipioId }) {
  if (!municipioId) throw new Error('Falta municipio_id.')
  const path = `${municipioId}/historia/${Date.now()}_${safeName(file.name)}`
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

export function useUpdateHistoria({ municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useMutation({
    mutationFn: async (valor) => {
      if (!municipioId) throw new Error('Falta municipio.')
      const { error } = await supabase
        .from('configuracion_portal')
        .upsert(
          { municipio_id: municipioId, clave: 'historia_municipio', valor },
          { onConflict: 'municipio_id,clave' },
        )
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['historia-municipio'] })
      // El portal público lee historia desde el bundle compartido,
      // así que también hay que invalidarlo.
      qc.invalidateQueries({ queryKey: ['portal-config-bundle'] })
    },
  })
}
