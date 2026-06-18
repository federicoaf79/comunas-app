// api/turnos-disponibles.js
// Endpoint público que Plan-B consulta para ver horarios disponibles

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

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

    // Fecha a consultar (default: hoy)
    const fechaConsulta = fecha ?? new Date().toISOString().split('T')[0]
    const diaSemana = new Date(fechaConsulta).getDay() // 0=Dom, 1=Lun...

    // Obtener médicos/agentes de guardia para esa dependencia
    const { data: agentes } = await supabase
      .from('medicos_agenda')
      .select('id, nombre, especialidad, hora_inicio, hora_fin')
      .eq('municipio_id', muni.id)
      .eq('dependencia_id', dependencia_id)
      .contains('dias_semana', [diaSemana])

    if (!agentes?.length) {
      return res.status(200).json({
        disponibles: [],
        mensaje: 'No hay agenda para ese día'
      })
    }

    // Obtener turnos ya ocupados ese día
    const { data: turnosOcupados } = await supabase
      .from('turnos')
      .select('fecha_hora')
      .eq('municipio_id', muni.id)
      .eq('dependencia_id', dependencia_id)
      .gte('fecha_hora', `${fechaConsulta}T00:00:00`)
      .lte('fecha_hora', `${fechaConsulta}T23:59:59`)
      .in('estado', ['pendiente', 'confirmado', 'en_curso'])

    const horasOcupadas = turnosOcupados?.map(t =>
      t.fecha_hora.slice(11, 16)
    ) ?? []

    // Generar slots de 30 minutos por agente
    const slots = []
    for (const agente of agentes) {
      const [hIni, mIni] = agente.hora_inicio.split(':').map(Number)
      const [hFin, mFin] = agente.hora_fin.split(':').map(Number)

      let cursor = hIni * 60 + mIni
      const fin = hFin * 60 + mFin

      while (cursor + 30 <= fin) {
        const hh = String(Math.floor(cursor / 60)).padStart(2, '0')
        const mm = String(cursor % 60).padStart(2, '0')
        const hora = `${hh}:${mm}`

        if (!horasOcupadas.includes(hora)) {
          slots.push({
            hora,
            fecha: fechaConsulta,
            fecha_hora: `${fechaConsulta}T${hora}:00`,
            agente: agente.nombre,
          })
        }
        cursor += 30
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
