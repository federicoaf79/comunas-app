import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const COLS = 'id, nombre, especialidad, matricula, telefono, email, dias_atencion, hora_desde, hora_hasta, frecuencia_nota, activo, dependencia_id, municipio_id'

// =============================================================
// Sincronización automática con agenda_publica
//
// Cuando se crea/edita un profesional con dias_atencion configurados,
// se crea/actualiza automáticamente un evento recurrente en agenda_publica
// para que aparezca en el calendario público del portal.
// =============================================================

async function sincronizarAgendaPublica(profesional) {
  if (!profesional || !profesional.id) return

  // Buscar evento existente vinculado a este profesional
  const { data: eventoExistente } = await supabase
    .from('agenda_publica')
    .select('id')
    .eq('profesional_id', profesional.id)
    .eq('tipo', 'medico')
    .maybeSingle()

  const tieneDiasAtencion = Array.isArray(profesional.dias_atencion) && profesional.dias_atencion.length > 0

  // Si tiene días de atención configurados, crear/actualizar evento
  if (tieneDiasAtencion) {
    const titulo = profesional.especialidad
      ? `${profesional.especialidad} - ${profesional.nombre}`
      : profesional.nombre

    const eventoData = {
      tipo: 'medico',
      titulo,
      descripcion: null,
      recurrente: true,
      dias_semana: profesional.dias_atencion,
      fecha_inicio: null,
      fecha_fin: null,
      hora_inicio: profesional.hora_desde || '08:00',
      hora_fin: profesional.hora_hasta || '12:00',
      color: '#1D4ED8', // Azul para médicos
      activo: true,
      municipio_id: profesional.municipio_id,
      dependencia_id: profesional.dependencia_id,
      profesional_id: profesional.id,
    }

    if (eventoExistente?.id) {
      // Actualizar evento existente
      const { error } = await supabase
        .from('agenda_publica')
        .update(eventoData)
        .eq('id', eventoExistente.id)
      if (error) console.warn('[sincronizarAgendaPublica] Error al actualizar:', error.message)
    } else {
      // Crear nuevo evento
      const { error } = await supabase
        .from('agenda_publica')
        .insert(eventoData)
      if (error) console.warn('[sincronizarAgendaPublica] Error al crear:', error.message)
    }
  } else if (eventoExistente?.id) {
    // Si ya no tiene días de atención, desactivar el evento (no borrar)
    const { error } = await supabase
      .from('agenda_publica')
      .update({ activo: false })
      .eq('id', eventoExistente.id)
    if (error) console.warn('[sincronizarAgendaPublica] Error al desactivar:', error.message)
  }
}

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
      let profesional
      if (id) {
        const { data, error } = await supabase.from('profesionales')
          .update(fields).eq('id', id).select(COLS).single()
        if (error) throw error
        profesional = data
      } else {
        const { data, error } = await supabase.from('profesionales')
          .insert({ municipio_id, dependencia_id, ...fields }).select(COLS).single()
        if (error) throw error
        profesional = data
      }

      // Sincronizar con agenda_publica
      await sincronizarAgendaPublica(profesional)

      return profesional
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['profesionales'] })
      qc.invalidateQueries({ queryKey: ['agenda-publica'] })
      qc.invalidateQueries({ queryKey: ['agenda-publica-admin'] })
    },
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

// Hook para verificar si un profesional tiene evento activo en agenda_publica
export function useProfesionalEnAgenda(profesionalId) {
  return useQuery({
    queryKey: ['profesional-en-agenda', profesionalId],
    queryFn: async () => {
      if (!profesionalId) return false
      const { data } = await supabase
        .from('agenda_publica')
        .select('id, activo')
        .eq('profesional_id', profesionalId)
        .eq('tipo', 'medico')
        .maybeSingle()
      return data?.activo === true
    },
    enabled: !!profesionalId,
    staleTime: 2 * 60_000,
  })
}
