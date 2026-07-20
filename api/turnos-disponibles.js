// api/turnos-disponibles.js
// Endpoint público que Plan-B consulta para ver horarios disponibles

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Mapeo de día de semana (número) a texto en minúsculas sin tilde
// (formato usado en tabla profesionales.dias_atencion)
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']

// Helper: fecha actual en TZ Argentina (YYYY-MM-DD)
function todayArgYMD() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).end()

  const { municipio_slug, dependencia_id, fecha } = req.query

  if (!municipio_slug || !dependencia_id) {
    return res.status(400).json({ error: 'Faltan parámetros' })
  }

  try {
    // Obtener municipio
    const { data: muni } = await supabase
      .from('municipios')
      .select('id')
      .eq('slug', municipio_slug)
      .single()

    if (!muni) return res.status(404).json({ error: 'Municipio no encontrado' })

    // Fecha a consultar (default: hoy en TZ Argentina)
    const fechaConsulta = fecha ?? todayArgYMD()
    const diaSemana = new Date(fechaConsulta).getDay() // 0=Dom, 1=Lun...
    const diaNombre = DIAS_SEMANA[diaSemana]           // 'lunes', 'martes', etc.

    // Obtener profesionales activos que atienden ese día en esa dependencia
    const { data: profesionales } = await supabase
      .from('profesionales')
      .select('id, nombre, especialidad, hora_desde, hora_hasta, duracion_turno_min')
      .eq('municipio_id', muni.id)
      .eq('dependencia_id', dependencia_id)
      .eq('activo', true)
      .contains('dias_atencion', [diaNombre])

    if (!profesionales?.length) {
      return res.status(200).json({
        disponibles: [],
        mensaje: 'No hay agenda para ese día'
      })
    }

    // Obtener turnos ya ocupados ese día
    const { data: turnosOcupados } = await supabase
      .from('turnos_agenda')
      .select('fecha, hora_inicio')
      .eq('dependencia_id', dependencia_id)
      .eq('fecha', fechaConsulta)
      .in('estado', ['pendiente', 'confirmado'])

    const horasOcupadas = turnosOcupados?.map(t => t.hora_inicio) ?? []

    // Generar slots por profesional usando su duracion_turno_min
    const slots = []
    for (const profesional of profesionales) {
      const [hIni, mIni] = profesional.hora_desde.split(':').map(Number)
      const [hFin, mFin] = profesional.hora_hasta.split(':').map(Number)
      const duracion = profesional.duracion_turno_min || 30 // default 30 si null

      let cursor = hIni * 60 + mIni
      const fin = hFin * 60 + mFin

      while (cursor + duracion <= fin) {
        const hh = String(Math.floor(cursor / 60)).padStart(2, '0')
        const mm = String(cursor % 60).padStart(2, '0')
        const hora = `${hh}:${mm}`

        if (!horasOcupadas.includes(hora)) {
          slots.push({
            hora,
            fecha: fechaConsulta,
            fecha_hora: `${fechaConsulta}T${hora}:00-03:00`,
            profesional: profesional.nombre,
            especialidad: profesional.especialidad,
          })
        }
        cursor += duracion
      }
    }

    return res.status(200).json({
      municipio: municipio_slug,
      dependencia_id,
      fecha: fechaConsulta,
      disponibles: slots,
      total: slots.length,
    })

  } catch (e) {
    console.error('[turnos-disponibles]', e)
    return res.status(500).json({ error: e.message })
  }
}
