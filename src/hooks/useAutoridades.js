import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { supabaseAnon } from '../lib/supabaseAnon'
import { useAuth } from '../context/AuthContext'
import { createAuditLog } from './useAuditLog'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[useAutoridades] audit log:', e.message))
}

// =============================================================
// useAutoridades — hooks para la sección "Autoridades de la
// Comisión Municipal" del Portal Ciudadano y su CMS.
//
// Tabla `autoridades` (creada manualmente en la DB del cliente):
//   id, municipio_id, nombre, cargo, descripcion, foto_url,
//   orden, activo, created_at.
// SELECT anon habilitado para que el portal público lea sin sesión.
// =============================================================

// Listado público — usa anon, ordenado por `orden`. Solo activas.
export function useAutoridades(municipioId) {
  return useQuery({
    queryKey: ['autoridades', municipioId ?? '__none__'],
    queryFn:  async () => {
      if (!municipioId) return []
      const { data, error } = await supabaseAnon
        .from('autoridades')
        .select('id, nombre, cargo, descripcion, foto_url, orden, activo')
        .eq('municipio_id', municipioId)
        .eq('activo', true)
        .order('orden', { ascending: true })
      if (error) {
        console.warn('[useAutoridades] anon fetch error:', error.message)
        return []
      }
      return data ?? []
    },
    enabled:  !!municipioId,
    staleTime: 5 * 60 * 1000,
  })
}

// Listado admin — trae todas (activas + inactivas) del municipio del
// perfil. Si el caller pasa `municipioIdOverride`, lo respeta
// (superadmin sin municipio asignado).
export function useAutoridadesAdmin({ municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['autoridades', 'admin', municipioId ?? '__none__'],
    queryFn:  async () => {
      if (!municipioId) return []
      const { data, error } = await supabase
        .from('autoridades')
        .select('id, municipio_id, nombre, cargo, descripcion, foto_url, orden, activo, created_at')
        .eq('municipio_id', municipioId)
        .order('orden', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled:  !!municipioId,
  })
}

// Sanitiza un nombre para usarlo en el path de Storage.
function slugForFile(s) {
  return (s || 'autoridad')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

// Sube la foto de una autoridad al bucket `avatares` con path
// `<municipioId>/autoridades/<timestamp>_<nombre_slug>.<ext>`.
export async function uploadFotoAutoridad({ file, municipioId, nombre }) {
  if (!municipioId) throw new Error('Falta municipio_id.')
  const ext   = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path  = `${municipioId}/autoridades/${Date.now()}_${slugForFile(nombre)}.${ext}`
  const { error } = await supabase.storage
    .from('avatares')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert:      false,
    })
  if (error) throw new Error(error.message ?? 'No pudimos subir la foto.')
  const { data } = supabase.storage.from('avatares').getPublicUrl(path)
  return data.publicUrl
}

export function useCreateAutoridad({ municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useMutation({
    mutationFn: async (payload) => {
      if (!municipioId) throw new Error('Falta municipio.')
      const row = {
        municipio_id: municipioId,
        nombre:       payload.nombre,
        cargo:        payload.cargo,
        descripcion:  payload.descripcion ?? null,
        foto_url:     payload.foto_url    ?? null,
        orden:        payload.orden       ?? 0,
        activo:       payload.activo      ?? true,
      }
      const { data, error } = await supabase
        .from('autoridades')
        .insert(row)
        .select()
        .single()
      if (error) throw error
      logAudit({
        accion: 'create', entidad: 'autoridades', entidadId: data.id,
        descripcion: `Alta de autoridad — ${data.nombre} (${data.cargo})`,
      })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autoridades'] }),
  })
}

export function useUpdateAutoridad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...changes }) => {
      const { data, error } = await supabase
        .from('autoridades')
        .update(changes)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      logAudit({
        accion: 'update', entidad: 'autoridades', entidadId: id,
        descripcion: `Autoridad actualizada — ${data.nombre}`,
      })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autoridades'] }),
  })
}

export function useDeleteAutoridad() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('autoridades').delete().eq('id', id)
      if (error) throw error
      logAudit({
        accion: 'delete', entidad: 'autoridades', entidadId: id,
        descripcion: `Autoridad eliminada (${id})`,
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autoridades'] }),
  })
}
