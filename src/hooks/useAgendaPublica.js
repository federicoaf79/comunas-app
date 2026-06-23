import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// SQL ejecutado en Supabase para permitir acceso anónimo:
// DROP POLICY IF EXISTS "publico puede ver agenda activa" ON agenda_publica;
// CREATE POLICY "publico puede ver agenda activa" ON agenda_publica FOR SELECT TO anon USING (activo = true);

const COLS_PUBLIC = `
  id, titulo, tipo, descripcion, recurrente, dias_semana,
  fecha_inicio, fecha_fin, hora_inicio, hora_fin, color, activo,
  municipio_id, dependencia_id, profesional_id
`

const COLS_ADMIN = `
  id, titulo, tipo, descripcion, recurrente, dias_semana,
  fecha_inicio, fecha_fin, hora_inicio, hora_fin, color, activo,
  municipio_id, dependencia_id, profesional_id,
  profesional:profesional_id(id, nombre, especialidad, matricula, requiere_orden, duracion_turno_min, max_turnos_por_slot),
  dependencia:dependencia_id(id, nombre, tipo)
`

// Genera las fechas en las que aparece un evento en un rango dado
export function expandirEventos(eventos, fechaDesde, fechaHasta) {
  const result = []
  const desde = new Date(fechaDesde + 'T12:00:00')
  const hasta = new Date(fechaHasta + 'T12:00:00')

  const DIAS_MAP = {
    domingo: 0, lunes: 1, martes: 2, 'miércoles': 3, miercoles: 3,
    jueves: 4, viernes: 5, sábado: 6, sabado: 6,
  }

  for (const ev of eventos) {
    if (!ev.activo) continue

    if (ev.recurrente && ev.dias_semana?.length > 0) {
      // Generar una ocurrencia por cada día de la semana en el rango
      const cur = new Date(desde)
      while (cur <= hasta) {
        const nombreDia = cur.toLocaleDateString('es-AR', { weekday: 'long' }).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        const matchDia = ev.dias_semana.some(d => {
          const dn = d.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
          return dn === nombreDia || DIAS_MAP[dn] === cur.getDay()
        })
        if (matchDia) {
          // Verificar rango de fechas si tiene fecha_fin
          const fechaStr = cur.toISOString().split('T')[0]
          if (ev.fecha_fin && fechaStr > ev.fecha_fin) { cur.setDate(cur.getDate() + 1); continue }
          if (ev.fecha_inicio && fechaStr < ev.fecha_inicio) { cur.setDate(cur.getDate() + 1); continue }
          result.push({ ...ev, fecha: fechaStr })
        }
        cur.setDate(cur.getDate() + 1)
      }
    } else if (!ev.recurrente && ev.fecha_inicio) {
      // Evento puntual
      if (ev.fecha_inicio >= fechaDesde && ev.fecha_inicio <= fechaHasta) {
        result.push({ ...ev, fecha: ev.fecha_inicio })
      }
    }
  }

  return result.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha)
    return a.hora_inicio.localeCompare(b.hora_inicio)
  })
}

export function useAgendaPublica(municipioId, fechaDesde, fechaHasta) {
  return useQuery({
    queryKey: ['agenda-publica', municipioId, fechaDesde, fechaHasta],
    queryFn: async () => {
      if (!municipioId) return []
      const SUPABASE_URL = 'https://tuvfrnjnupfurzkepsod.supabase.co'
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const url = `${SUPABASE_URL}/rest/v1/agenda_publica?municipio_id=eq.${municipioId}&activo=eq.true&order=hora_inicio.asc`
      const res = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      return expandirEventos(data ?? [], fechaDesde, fechaHasta)
    },
    enabled: !!municipioId && !!fechaDesde,
    staleTime: 5 * 60_000,
  })
}

export function useAgendaPublicaAdmin(municipioId) {
  return useQuery({
    queryKey: ['agenda-publica-admin', municipioId],
    queryFn: async () => {
      if (!municipioId) return []
      const { data, error} = await supabase
        .from('agenda_publica')
        .select(COLS_ADMIN)
        .eq('municipio_id', municipioId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
    enabled: !!municipioId,
    staleTime: 2 * 60_000,
  })
}

export function useUpsertAgendaPublica() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, municipio_id, ...fields }) => {
      if (id) {
        const { data, error } = await supabase.from('agenda_publica')
          .update(fields).eq('id', id).select(COLS_ADMIN).single()
        if (error) throw error
        return data
      }
      const { data, error } = await supabase.from('agenda_publica')
        .insert({ municipio_id, ...fields }).select(COLS_ADMIN).single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agenda-publica'] })
      qc.invalidateQueries({ queryKey: ['agenda-publica-admin'] })
    },
  })
}

export function useDeleteAgendaPublica() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('agenda_publica').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agenda-publica'] })
      qc.invalidateQueries({ queryKey: ['agenda-publica-admin'] })
    },
  })
}
