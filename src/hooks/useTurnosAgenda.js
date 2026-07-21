import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, supabasePublic } from '../lib/supabase'
import { todayArgYMD } from '../lib/datetime'

const COLS = `
  id, fecha, hora_inicio, hora_fin, estado,
  orden_medica_url, orden_medica_nombre, motivo, notas_admin,
  vecino_id, profesional_id, dependencia_id, municipio_id,
  vecino:vecino_id(id, nombre, apellido, nombre_completo, telefono, dni),
  profesional:profesional_id(id, nombre, especialidad, duracion_turno_min, max_turnos_por_slot, requiere_orden)
`

// Genera slots de tiempo para un profesional en una fecha
export function generarSlots(profesional, fecha, turnosOcupados) {
  if (!profesional?.hora_desde || !profesional?.hora_hasta) return []
  const duracion = profesional.duracion_turno_min ?? 30
  const maxPorSlot = profesional.max_turnos_por_slot ?? 1

  const [hd, md] = profesional.hora_desde.split(':').map(Number)
  const [hh, mh] = profesional.hora_hasta.split(':').map(Number)

  const slots = []
  let cur = hd * 60 + md
  const fin = hh * 60 + mh

  while (cur + duracion <= fin) {
    const hi = `${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`
    const hf = `${String(Math.floor((cur+duracion)/60)).padStart(2,'0')}:${String((cur+duracion)%60).padStart(2,'0')}`

    const ocupados = turnosOcupados.filter(t =>
      t.hora_inicio === hi && ['pendiente','confirmado'].includes(t.estado)
    ).length

    slots.push({
      hora_inicio: hi,
      hora_fin:    hf,
      ocupados,
      disponibles: maxPorSlot - ocupados,
      lleno: ocupados >= maxPorSlot,
    })
    cur += duracion
  }
  return slots
}

// Turnos de un profesional en una semana
export function useTurnosAgendaSemana(profesionalId, fechaDesde, fechaHasta) {
  return useQuery({
    queryKey: ['turnos-agenda', profesionalId, fechaDesde, fechaHasta],
    queryFn: async () => {
      if (!profesionalId || !fechaDesde) return []
      const { data, error } = await supabase
        .from('turnos_agenda')
        .select(COLS)
        .eq('profesional_id', profesionalId)
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha').order('hora_inicio')
      if (error) throw error
      return data ?? []
    },
    enabled: !!profesionalId && !!fechaDesde,
    staleTime: 30_000,
  })
}

// Turnos de todos los profesionales de una dependencia en una semana
export function useTurnosAgendaDependencia(dependenciaId, fechaDesde, fechaHasta) {
  return useQuery({
    queryKey: ['turnos-agenda-dep', dependenciaId, fechaDesde, fechaHasta],
    queryFn: async () => {
      if (!dependenciaId || !fechaDesde) return []
      const { data, error } = await supabase
        .from('turnos_agenda')
        .select(COLS)
        .eq('dependencia_id', dependenciaId)
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha').order('hora_inicio')
      if (error) throw error
      return data ?? []
    },
    enabled: !!dependenciaId && !!fechaDesde,
    staleTime: 60_000,
  })
}

// Crear turno (vecino saca turno) — usa supabasePublic: se llama desde
// páginas 100% públicas (AgendaPublica, SacarTurnoFormPortal), nunca
// desde admin. Ver REGLA en src/lib/supabase.js.
export function useCrearTurnoAgenda() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      municipio_id, dependencia_id, profesional_id,
      vecino_id, fecha, hora_inicio, hora_fin,
      motivo, orden_medica_url, orden_medica_nombre,
    }) => {
      // Validar disponibilidad
      const { count } = await supabasePublic
        .from('turnos_agenda')
        .select('id', { count: 'exact', head: true })
        .eq('profesional_id', profesional_id)
        .eq('fecha', fecha)
        .eq('hora_inicio', hora_inicio)
        .in('estado', ['pendiente', 'confirmado'])

      const { data: prof } = await supabasePublic
        .from('profesionales')
        .select('max_turnos_por_slot')
        .eq('id', profesional_id)
        .single()

      if ((count ?? 0) >= (prof?.max_turnos_por_slot ?? 1)) {
        throw new Error('Este horario ya no tiene disponibilidad. Por favor elegí otro.')
      }

      const { data, error } = await supabasePublic
        .from('turnos_agenda')
        .insert({
          municipio_id, dependencia_id, profesional_id,
          vecino_id, fecha, hora_inicio, hora_fin,
          motivo, orden_medica_url, orden_medica_nombre,
          estado: 'pendiente',
        })
        .select(COLS)
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['turnos-agenda'] })
      qc.invalidateQueries({ queryKey: ['turnos-agenda-dep'] })
    },
  })
}

// Actualizar estado (admin)
export function useUpdateEstadoTurnoAgenda() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, estado, notas_admin }) => {
      const { data, error } = await supabase
        .from('turnos_agenda')
        .update({ estado, notas_admin })
        .eq('id', id)
        .select(COLS)
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['turnos-agenda'] }),
  })
}

// Helper: semana actual (lunes a domingo)
export function getSemanaActual(offset = 0) {
  const hoy = new Date()
  const dia = hoy.getDay() === 0 ? 7 : hoy.getDay()
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - dia + 1 + offset * 7)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
  return { desde: fmt(lunes), hasta: fmt(domingo), lunes }
}

// Helper: días de la semana entre dos fechas
export function getDiasSemana(desde) {
  const dias = []
  const NOMBRES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  const NOMBRES_FULL = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado']
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
  const hoy = todayArgYMD()
  for (let i = 0; i < 7; i++) {
    const d = new Date(desde + 'T12:00:00')
    d.setDate(d.getDate() + i)
    const fechaStr = fmt(d)
    dias.push({
      fecha: fechaStr,
      nombre: NOMBRES[d.getDay()],
      nombreFull: NOMBRES_FULL[d.getDay()],
      esHoy: fechaStr === hoy,
    })
  }
  return dias
}
