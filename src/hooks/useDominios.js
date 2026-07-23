import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createAuditLog } from './useAuditLog'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[useDominios] audit log:', e.message))
}

// =============================================================
// useDominios — gestión de dominios/subdominios vinculados a
// municipios (multi-tenant por hostname).
//
// Solo accesible para superadmin (la RLS filtra automáticamente).
// =============================================================

export function useDominios() {
  return useQuery({
    queryKey: ['dominios'],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('dominios_municipio')
        .select(`
          id, municipio_id, dominio, tipo, activo, verificado, created_at,
          municipio:municipio_id ( id, nombre, slug )
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    staleTime: 60_000,
  })
}

export function useCreateDominio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase
        .from('dominios_municipio')
        .insert(data)
      if (error) throw error
      logAudit({
        accion: 'create', entidad: 'dominios_municipio',
        descripcion: `Dominio vinculado — ${data.dominio ?? 'sin nombre'}`,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dominios'] })
    },
  })
}

export function useUpdateDominio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, updates }) => {
      const { error } = await supabase
        .from('dominios_municipio')
        .update(updates)
        .eq('id', id)
      if (error) throw error
      logAudit({
        accion: 'update', entidad: 'dominios_municipio', entidadId: id,
        descripcion: `Dominio actualizado (${id})`,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dominios'] })
    },
  })
}

export function useDeleteDominio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase
        .from('dominios_municipio')
        .delete()
        .eq('id', id)
      if (error) throw error
      logAudit({
        accion: 'delete', entidad: 'dominios_municipio', entidadId: id,
        descripcion: `Dominio eliminado (${id})`,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dominios'] })
    },
  })
}
