import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

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
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dominios'] })
    },
  })
}
