// api/webhook-whatsapp.js
// Recibe mensajes entrantes de Plan-B y crea turnos

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const partnerKey = req.headers['x-partner-key']
  if (partnerKey !== process.env.PLANB_PARTNER_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { from, message, org_id, intent, entities } = req.body

  console.log('[webhook-whatsapp]', { from, org_id, intent })

  try {
    // Buscar municipio por org_id O por webhook slug
    const webhookSlug = req.headers['x-webhook-slug']

    let config = null

    // Intentar por org_id primero
    if (org_id) {
      const { data } = await supabase
        .from('configuracion_portal')
        .select('municipio_id')
        .eq('clave', 'plan_b_org_id')
        .eq('valor', org_id)
        .single()
      config = data
    }

    // Fallback por webhook slug
    if (!config && webhookSlug) {
      const { data: muni } = await supabase
        .from('municipios')
        .select('id')
        .eq('slug', webhookSlug)
        .single()
      if (muni) config = { municipio_id: muni.id }
    }

    if (!config) {
      return res.status(404).json({ error: 'Municipio no encontrado' })
    }

    const municipio_id = config.municipio_id

    if (
      intent === 'crear_turno' &&
      entities?.dependencia &&
      entities?.nombre &&
      entities?.dni
    ) {
      let { data: vecino } = await supabase
        .from('vecinos')
        .select('id')
        .eq('dni', entities.dni)
        .eq('municipio_id', municipio_id)
        .maybeSingle()

      if (!vecino) {
        const { data: nuevo } = await supabase
          .from('vecinos')
          .insert({
            municipio_id,
            nombre_completo: entities.nombre,
            dni: entities.dni,
            telefono: from,
          })
          .select('id')
          .single()
        vecino = nuevo
      }

      const { data: dep } = await supabase
        .from('dependencias')
        .select('id')
        .eq('municipio_id', municipio_id)
        .ilike('nombre', `%${entities.dependencia}%`)
        .maybeSingle()

      if (vecino && dep) {
        await supabase.from('turnos').insert({
          municipio_id,
          vecino_id: vecino.id,
          dependencia_id: dep.id,
          fecha_hora: entities.fecha && entities.hora
            ? `${entities.fecha}T${entities.hora}:00`
            : null,
          estado: 'confirmado',
          motivo: message,
          canal: 'whatsapp',
        })
      }
    }

    // Guardar en historial (ignorar si tabla no existe)
    await supabase.from('mensajes_whatsapp').insert({
      municipio_id,
      from_numero: from,
      mensaje: message,
      intent: intent ?? 'desconocido',
      org_id,
    }).throwOnError().catch(() => {})

    return res.status(200).json({ ok: true })

  } catch (err) {
    console.error('[webhook-whatsapp] Error:', err)
    return res.status(500).json({
      error: 'Error interno',
      detail: err.message
    })
  }
}
