import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const COLS = 'id, nombre, especialidad, matricula, telefono, email, dias_atencion, hora_desde, hora_hasta, frecuencia_nota, activo, dependencia_id'

export function useProfesionales(municipioId, dependenciaId) {
  return useQuery({
    queryKey: ['profesionales', municipioId, dependenciaId ?? '__all__'],
    queryFn: async () => {
      if (!municipioId) return []
      let q = supabase.from('profesionales').select(COLS)
        .eq('municipio_id', municipioId)
        .order('nombre')
      if (dependenciaId) q = q.eq('dependencia_id', dependenciaId)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    enabled: !!municipioId,
    staleTime: 5 * 60_000,
  })
}

export function useUpsertProfesional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, municipio_id, dependencia_id, ...fields }) => {
      if (id) {
        const { data, error } = await supabase.from('profesionales')
          .update(fields).eq('id', id).select(COLS).single()
        if (error) throw error
        return data
      }
      const { data, error } = await supabase.from('profesionales')
        .insert({ municipio_id, dependencia_id, ...fields }).select(COLS).single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profesionales'] }),
  })
}

export function useDeleteProfesional() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('profesionales').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profesionales'] }),
  })
}
