import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { supabaseAnon } from '../lib/supabaseAnon'
import { useAuth } from '../context/AuthContext'

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

// Lectura pública — usa supabaseAnon. Devuelve EMPTY si no hay fila.
export function useHistoriaMunicipio(municipioId) {
  return useQuery({
    queryKey: ['historia-municipio', municipioId ?? '__none__'],
    queryFn:  async () => {
      if (!municipioId) return EMPTY
      const { data, error } = await supabaseAnon
        .from('configuracion_portal')
        .select('valor')
        .eq('clave', 'historia_municipio')
        .eq('municipio_id', municipioId)
        .maybeSingle()
      if (error) {
        if (!/permission|policy/i.test(error.message ?? '')) {
          console.warn('[useHistoriaMunicipio] error:', error.message)
        }
        return EMPTY
      }
      return { ...EMPTY, ...(data?.valor ?? {}) }
    },
    staleTime: 5 * 60 * 1000,
  })
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['historia-municipio'] }),
  })
}
