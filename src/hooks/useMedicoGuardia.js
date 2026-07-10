import { useQuery } from '@tanstack/react-query'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

function getDiaActual() {
  const hoy = new Date()
  return DIAS_SEMANA[hoy.getDay()]
}

function normalizarDia(dia) {
  return dia
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

// Obtener hora actual en formato HH:MM (TZ Argentina)
function getHoraActual() {
  const ahora = new Date()
  const horaArgentina = ahora.toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return horaArgentina // Formato "HH:MM"
}

// Convierte "HH:MM" a minutos desde medianoche para comparación
function horaAMinutos(hora) {
  if (!hora || typeof hora !== 'string') return null
  const [h, m] = hora.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

// Verifica si horaActual está dentro del rango [horaDesde, horaHasta]
function estaEnHorario(horaActual, horaDesde, horaHasta) {
  const actual = horaAMinutos(horaActual)
  const desde = horaAMinutos(horaDesde)
  const hasta = horaAMinutos(horaHasta)

  if (actual === null || desde === null || hasta === null) return false

  return actual >= desde && actual <= hasta
}

// Calcula distancia en minutos desde horaActual hasta horaDesde
// Devuelve null si horaDesde ya pasó (es menor que horaActual)
function minutosHastaInicio(horaActual, horaDesde) {
  const actual = horaAMinutos(horaActual)
  const desde = horaAMinutos(horaDesde)

  if (actual === null || desde === null) return null
  if (desde <= actual) return null // Ya pasó

  return desde - actual
}

export function useMedicoGuardia(municipioId) {
  return useQuery({
    queryKey: ['medico-guardia', municipioId],
    queryFn: async () => {
      if (!municipioId) return null

      const url = `${SUPABASE_URL}/rest/v1/profesionales?municipio_id=eq.${municipioId}&activo=eq.true&select=id,nombre,especialidad,telefono,hora_desde,hora_hasta,dias_atencion,matricula`

      const res = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      })

      if (!res.ok) {
        console.warn('[useMedicoGuardia] fetch error:', res.status)
        return null
      }

      const data = await res.json()
      const profesionales = data ?? []

      // Filtrar por día actual
      const diaHoy = getDiaActual()
      const diaHoyNormalizado = normalizarDia(diaHoy)

      const profesionalesHoy = profesionales.filter(prof => {
        if (!Array.isArray(prof.dias_atencion)) return false
        return prof.dias_atencion.some(d => {
          const diaNormalizado = normalizarDia(d)
          return diaNormalizado === diaHoyNormalizado || diaNormalizado === normalizarDia(diaHoy)
        })
      })

      if (profesionalesHoy.length === 0) return null

      const horaActual = getHoraActual()

      // 1. Prioridad: profesional que está atendiendo AHORA
      const enHorarioActivo = profesionalesHoy.find(prof =>
        estaEnHorario(horaActual, prof.hora_desde, prof.hora_hasta)
      )
      if (enHorarioActivo) return enHorarioActivo

      // 2. Fallback: próximo profesional que atienda hoy (por hora_desde más cercana)
      const proximosHoy = profesionalesHoy
        .map(prof => ({
          prof,
          minutosHasta: minutosHastaInicio(horaActual, prof.hora_desde),
        }))
        .filter(item => item.minutosHasta !== null) // Solo los que aún no pasaron
        .sort((a, b) => a.minutosHasta - b.minutosHasta) // Ordenar por más cercano

      if (proximosHoy.length > 0) return proximosHoy[0].prof

      // 3. Si todos ya pasaron, retornar el primero de la lista (puede ser útil para mostrar "último guardía del día")
      return profesionalesHoy[0] ?? null
    },
    enabled: !!municipioId,
    staleTime: 5 * 60 * 1000, // 5 minutos
  })
}
