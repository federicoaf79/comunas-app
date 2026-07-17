// src/hooks/useSolicitudesDesarrollo.js
// CRUD de solicitudes de Agencia de Desarrollo — Servicios Rurales

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// ID fijo de la dependencia Agencia de Desarrollo
const DEPENDENCIA_ID = '5d607e09-ff87-44d9-9653-b2782cd16fc2'

// ═════════════════════════════════════════════════════════════════════
// Queries
// ═════════════════════════════════════════════════════════════════════

/**
 * Obtener solicitudes del vecino logueado
 */
export function useSolicitudesVecino(vecinoId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['solicitudes_desarrollo', vecinoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turnos_agenda')
        .select(`
          id, fecha, estado, motivo, notas, created_at,
          dependencia:dependencia_id ( id, nombre )
        `)
        .eq('vecino_id', vecinoId)
        .eq('dependencia_id', DEPENDENCIA_ID)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      return data ?? []
    },
    enabled: enabled && !!vecinoId,
    staleTime: 2 * 60 * 1000, // 2 min
  })
}

// ═════════════════════════════════════════════════════════════════════
// Mutations
// ═════════════════════════════════════════════════════════════════════

/**
 * Crear nueva solicitud de servicio (desde portal del vecino)
 */
export function useCrearSolicitud() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload) => {
      // Validaciones client-side
      if (!payload.tipo_servicio) {
        throw new Error('Tipo de servicio requerido')
      }
      if (!payload.notas || payload.notas.trim().length === 0) {
        throw new Error('Por favor describí tu solicitud en el campo de notas')
      }

      // Insertar solicitud
      const { data, error } = await supabase
        .from('turnos_agenda')
        .insert({
          municipio_id: payload.municipio_id,
          dependencia_id: DEPENDENCIA_ID,
          vecino_id: payload.vecino_id,
          fecha: payload.fecha_preferida || null,
          estado: 'pendiente',
          motivo: payload.tipo_servicio,
          notas: payload.notas,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solicitudes_desarrollo'] })
    },
  })
}
