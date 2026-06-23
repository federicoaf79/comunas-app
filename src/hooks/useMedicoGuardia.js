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

      // Retornar el primero que atiende hoy, o null
      return profesionalesHoy[0] ?? null
    },
    enabled: !!municipioId,
    staleTime: 5 * 60 * 1000, // 5 minutos
  })
}
