// api/cron-recordatorios.js
// Vercel Cron Job — envía recordatorios 24hs antes del turno
// Intenta WhatsApp vía Plan-B, fallback a SMS vía Twilio

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PLANB_BASE = 'https://plan-b-backend-production.up.railway.app'
const TWILIO_BASE = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`

export default async function handler(req, res) {
  // Seguridad: Vercel Cron manda Authorization: Bearer CRON_SECRET
  const auth = req.headers['authorization']
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const ahora = new Date()
    // Ventana ampliada para compensar ejecución única diaria (plan Vercel Hobby)
    // 20-28hs = ventana de 8 horas para cubrir recordatorios "24hs antes"
    const desde = new Date(ahora.getTime() + 20 * 60 * 60 * 1000)
    const hasta = new Date(ahora.getTime() + 28 * 60 * 60 * 1000)
    const fechaObjetivo = desde.toISOString().split('T')[0]
    const fechaObjetivo2 = hasta.toISOString().split('T')[0]

    // Traer candidatos del día objetivo (uno o dos días si el rango cruza medianoche)
    const fechas = [...new Set([fechaObjetivo, fechaObjetivo2])]

    const { data: turnos, error } = await supabase
      .from('turnos_agenda')
      .select(`
        id, fecha, hora_inicio, municipio_id, dependencia_id,
        vecino_id, estado, recordatorio_enviado,
        vecinos:vecino_id ( nombre_completo, telefono ),
        dependencias:dependencia_id ( nombre )
      `)
      .in('fecha', fechas)
      .in('estado', ['pendiente', 'confirmado'])
      .eq('recordatorio_enviado', false)

    if (error) throw error

    const resultados = []

    for (const turno of turnos ?? []) {
      // Filtrar por ventana exacta de 20-28hs
      const fechaHora = new Date(`${turno.fecha}T${turno.hora_inicio}:00-03:00`)
      if (fechaHora < desde || fechaHora > hasta) continue

      const telefono = turno.vecinos?.telefono
      if (!telefono) continue

      const mensaje = `Hola ${turno.vecinos?.nombre_completo ?? ''}, te recordamos tu turno mañana ${turno.fecha} a las ${turno.hora_inicio} en ${turno.dependencias?.nombre ?? 'la dependencia'}. Ante cualquier cambio, comunicate con la Comisión Municipal.`

      let canalUsado = null

      // Intento 1: WhatsApp vía Plan-B
      try {
        const { data: configs } = await supabase
          .from('configuracion_portal')
          .select('clave, valor')
          .eq('municipio_id', turno.municipio_id)
          .in('clave', ['plan_b_api_key', 'plan_b_org_id'])

        const cfg = Object.fromEntries(configs?.map(c => [c.clave, c.valor]) ?? [])

        if (cfg.plan_b_api_key) {
          const wa = await fetch(`${PLANB_BASE}/api/v1/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': cfg.plan_b_api_key,
            },
            body: JSON.stringify({
              to: telefono,
              message: mensaje,
              org_id: cfg.plan_b_org_id,
              tipo: 'recordatorio_turno',
            }),
          })
          if (wa.ok) canalUsado = 'whatsapp'
        }
      } catch (e) {
        console.error('[cron-recordatorios] WhatsApp falló:', e.message)
      }

      // Intento 2: SMS fallback vía Twilio directo
      if (!canalUsado) {
        try {
          const body = new URLSearchParams({
            To: telefono,
            From: process.env.TWILIO_SMS_FROM,
            Body: mensaje,
          })
          const auth64 = Buffer.from(
            `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
          ).toString('base64')

          const sms = await fetch(TWILIO_BASE, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${auth64}`,
            },
            body,
          })
          if (sms.ok) canalUsado = 'sms'
        } catch (e) {
          console.error('[cron-recordatorios] SMS falló:', e.message)
        }
      }

      if (canalUsado) {
        await supabase
          .from('turnos_agenda')
          .update({
            recordatorio_enviado: true,
            recordatorio_enviado_at: new Date().toISOString(),
            recordatorio_canal: canalUsado,
          })
          .eq('id', turno.id)

        resultados.push({ turno_id: turno.id, canal: canalUsado })
      }
    }

    return res.status(200).json({ ok: true, enviados: resultados.length, detalle: resultados })
  } catch (err) {
    console.error('[cron-recordatorios] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
