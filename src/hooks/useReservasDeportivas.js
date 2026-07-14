// src/hooks/useReservasDeportivas.js
// CRUD y validación de reservas del Polideportivo Municipal

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase, supabasePublic } from '../lib/supabase'

// ═════════════════════════════════════════════════════════════════════
// Queries
// ═════════════════════════════════════════════════════════════════════

/**
 * Obtener espacios deportivos activos de un municipio
 */
export function useEspaciosDeportivos(municipioId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['espacios_deportivos', municipioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('espacios_deportivos')
        .select('*')
        .eq('municipio_id', municipioId)
        .eq('activo', true)
        .order('nombre')

      if (error) throw error
      return data ?? []
    },
    enabled: enabled && !!municipioId,
    staleTime: 5 * 60 * 1000, // 5 min
  })
}

/**
 * Obtener configuración de horario del Polideportivo
 * Retorna: { apertura: "08:00", cierre: "22:00" }
 */
export function usePolideportivoHorario(municipioId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['polideportivo_horario', municipioId],
    queryFn: async () => {
      const { data, error } = await supabasePublic
        .from('configuracion_portal')
        .select('valor')
        .eq('municipio_id', municipioId)
        .eq('clave', 'polideportivo_horario')
        .maybeSingle()

      if (error) throw error
      if (!data?.valor) return { apertura: '08:00', cierre: '22:00' } // default

      try {
        return JSON.parse(data.valor)
      } catch {
        return { apertura: '08:00', cierre: '22:00' }
      }
    },
    enabled: enabled && !!municipioId,
    staleTime: 10 * 60 * 1000, // 10 min
  })
}

/**
 * Obtener reservas de un espacio deportivo en una fecha específica
 * (solo estados pendiente/confirmado que bloquean disponibilidad)
 */
export function useReservasEspacio(espacioId, fecha, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['reservas_espacio', espacioId, fecha],
    queryFn: async () => {
      const { data, error } = await supabasePublic
        .from('turnos_agenda')
        .select(`
          id, fecha, hora_inicio, hora_fin, estado, motivo,
          vecino:vecino_id ( nombre_completo )
        `)
        .eq('espacio_id', espacioId)
        .eq('fecha', fecha)
        .in('estado', ['pendiente', 'confirmado'])
        .order('hora_inicio')

      if (error) throw error
      return data ?? []
    },
    enabled: enabled && !!espacioId && !!fecha,
    staleTime: 1 * 60 * 1000, // 1 min
  })
}

/**
 * Obtener reservas del vecino logueado (todas, incluyendo canceladas)
 */
export function useReservasVecino(vecinoId, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['reservas_vecino', vecinoId],
    queryFn: async () => {
      const { data, error } = await supabasePublic
        .from('turnos_agenda')
        .select(`
          id, fecha, hora_inicio, hora_fin, estado, motivo, observaciones,
          espacio:espacio_id ( id, nombre, tipo ),
          dependencia:dependencia_id ( id, nombre )
        `)
        .eq('vecino_id', vecinoId)
        .not('espacio_id', 'is', null) // Solo reservas deportivas (tienen espacio)
        .order('fecha', { ascending: false })
        .order('hora_inicio', { ascending: false })
        .limit(50)

      if (error) throw error
      return data ?? []
    },
    enabled: enabled && !!vecinoId,
    staleTime: 2 * 60 * 1000, // 2 min
  })
}

/**
 * Obtener todas las reservas del Polideportivo (para admin)
 */
export function useReservasPolideportivo(dependenciaId, filtros = {}, { enabled = true } = {}) {
  return useQuery({
    queryKey: ['reservas_polideportivo', dependenciaId, filtros],
    queryFn: async () => {
      let query = supabase
        .from('turnos_agenda')
        .select(`
          id, fecha, hora_inicio, hora_fin, estado, motivo, observaciones,
          vecino:vecino_id ( id, nombre_completo, telefono ),
          espacio:espacio_id ( id, nombre, tipo ),
          dependencia:dependencia_id ( id, nombre )
        `)
        .eq('dependencia_id', dependenciaId)
        .not('espacio_id', 'is', null) // Solo reservas deportivas

      // Filtros opcionales
      if (filtros.estado) query = query.eq('estado', filtros.estado)
      if (filtros.fecha) query = query.eq('fecha', filtros.fecha)
      if (filtros.espacio_id) query = query.eq('espacio_id', filtros.espacio_id)

      const { data, error } = await query
        .order('fecha', { ascending: false })
        .order('hora_inicio', { ascending: false })
        .limit(200)

      if (error) throw error
      return data ?? []
    },
    enabled: enabled && !!dependenciaId,
    staleTime: 1 * 60 * 1000, // 1 min
  })
}

// ═════════════════════════════════════════════════════════════════════
// Mutations
// ═════════════════════════════════════════════════════════════════════

/**
 * Crear nueva reserva deportiva (desde portal del vecino)
 */
export function useCrearReservaDeportiva() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (payload) => {
      // Validaciones client-side
      const errores = validarReserva(payload)
      if (errores.length > 0) {
        throw new Error(errores[0])
      }

      // Validación server-side: verificar solapamiento
      const { data: reservasExistentes } = await supabasePublic
        .from('turnos_agenda')
        .select('id, hora_inicio, hora_fin')
        .eq('espacio_id', payload.espacio_id)
        .eq('fecha', payload.fecha)
        .in('estado', ['pendiente', 'confirmado'])

      const solapa = (reservasExistentes ?? []).some(r =>
        haySolapamiento(
          payload.hora_inicio,
          payload.hora_fin,
          r.hora_inicio,
          r.hora_fin
        )
      )

      if (solapa) {
        throw new Error('Ese horario ya está reservado. Por favor elegí otro horario.')
      }

      // Insertar reserva
      const { data, error } = await supabasePublic
        .from('turnos_agenda')
        .insert({
          municipio_id: payload.municipio_id,
          dependencia_id: payload.dependencia_id,
          espacio_id: payload.espacio_id,
          vecino_id: payload.vecino_id,
          fecha: payload.fecha,
          hora_inicio: payload.hora_inicio,
          hora_fin: payload.hora_fin,
          estado: 'pendiente',
          motivo: payload.deporte || 'Actividad deportiva',
          observaciones: payload.observaciones || null,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas_espacio'] })
      qc.invalidateQueries({ queryKey: ['reservas_vecino'] })
      qc.invalidateQueries({ queryKey: ['reservas_polideportivo'] })
    },
  })
}

/**
 * Actualizar estado de reserva (admin: confirmar/cancelar)
 */
export function useActualizarEstadoReserva() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, estado }) => {
      if (!['confirmado', 'cancelado', 'atendido'].includes(estado)) {
        throw new Error('Estado inválido')
      }

      const { data, error } = await supabase
        .from('turnos_agenda')
        .update({ estado })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas_espacio'] })
      qc.invalidateQueries({ queryKey: ['reservas_vecino'] })
      qc.invalidateQueries({ queryKey: ['reservas_polideportivo'] })
    },
  })
}

// ═════════════════════════════════════════════════════════════════════
// Helpers de validación
// ═════════════════════════════════════════════════════════════════════

/**
 * Validar datos de reserva (client-side)
 */
function validarReserva(payload) {
  const errores = []

  // Requeridos
  if (!payload.espacio_id) errores.push('Espacio deportivo requerido')
  if (!payload.fecha) errores.push('Fecha requerida')
  if (!payload.hora_inicio) errores.push('Hora de inicio requerida')
  if (!payload.hora_fin) errores.push('Hora de fin requerida')

  // Fecha no puede ser pasada
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const fechaReserva = new Date(payload.fecha + 'T00:00:00')
  if (fechaReserva < hoy) {
    errores.push('No se pueden hacer reservas en el pasado')
  }

  // Hora fin > hora inicio
  if (payload.hora_inicio && payload.hora_fin) {
    if (payload.hora_fin <= payload.hora_inicio) {
      errores.push('La hora de fin debe ser posterior a la hora de inicio')
    }
  }

  // Validar contra horario configurado (si está disponible)
  if (payload.horarioConfig) {
    const { apertura, cierre } = payload.horarioConfig
    if (payload.hora_inicio < apertura) {
      errores.push(`El horario de inicio debe ser después de las ${apertura}`)
    }
    if (payload.hora_fin > cierre) {
      errores.push(`El horario de fin debe ser antes de las ${cierre}`)
    }
  }

  return errores
}

/**
 * Verificar solapamiento entre dos rangos horarios
 * Dos rangos [A_inicio, A_fin) y [B_inicio, B_fin) se solapan si:
 * A_inicio < B_fin AND B_inicio < A_fin
 */
function haySolapamiento(horaInicioA, horaFinA, horaInicioB, horaFinB) {
  return horaInicioA < horaFinB && horaInicioB < horaFinA
}
