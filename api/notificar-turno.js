// api/notificar-turno.js
// Supabase Database Webhook — notifica cuando un turno cambia a 'confirmado' o 'cancelado'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Seguridad: Supabase Database Webhooks mandan un header configurable.
  // Verificamos un secreto compartido en query param o header.
  const secret = req.headers['x-webhook-secret']
  if (secret !== process.env.SUPABASE_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { type, record, old_record } = req.body

  if (type !== 'UPDATE' || !record || !old_record) {
    return res.status(200).json({ ok: true, skip: 'no-update' })
  }

  const estadoNuevo = record.estado
  const estadoViejo = old_record.estado

  const disparaNotificacion =
    estadoNuevo !== estadoViejo &&
    (estadoNuevo === 'confirmado' || estadoNuevo === 'cancelado')

  if (!disparaNotificacion) {
    return res.status(200).json({ ok: true, skip: 'sin-cambio-relevante' })
  }

  try {
    const { data: vecino } = await supabase
      .from('vecinos')
      .select('nombre_completo, telefono')
      .eq('id', record.vecino_id)
      .maybeSingle()

    const { data: dep } = await supabase
      .from('dependencias')
      .select('nombre')
      .eq('id', record.dependencia_id)
      .maybeSingle()

    if (!vecino?.telefono) {
      return res.status(200).json({ ok: true, skip: 'sin-telefono' })
    }

    const mensaje = estadoNuevo === 'confirmado'
      ? `Hola ${vecino.nombre_completo ?? ''}, tu turno en ${dep?.nombre ?? 'la dependencia'} para el ${record.fecha} a las ${record.hora_inicio} fue CONFIRMADO. Ante cualquier consulta, comunicate con la Comisión Municipal.`
      : `Hola ${vecino.nombre_completo ?? ''}, tu turno en ${dep?.nombre ?? 'la dependencia'} para el ${record.fecha} a las ${record.hora_inicio} fue CANCELADO. Si necesitás reprogramarlo, comunicate con la Comisión Municipal.`

    const { data: configs } = await supabase
      .from('configuracion_portal')
      .select('clave, valor')
      .eq('municipio_id', record.municipio_id)
      .in('clave', ['plan_b_api_key', 'plan_b_org_id'])

    const cfg = Object.fromEntries(configs?.map(c => [c.clave, c.valor]) ?? [])

    if (!cfg.plan_b_api_key) {
      return res.status(200).json({ ok: true, skip: 'whatsapp-no-configurado' })
    }

    const wa = await fetch('https://plan-b-backend-production.up.railway.app/api/v1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cfg.plan_b_api_key,
      },
      body: JSON.stringify({
        to: vecino.telefono,
        message: mensaje,
        org_id: cfg.plan_b_org_id,
        tipo: `turno_${estadoNuevo}`,
      }),
    })

    return res.status(200).json({ ok: wa.ok, canal: 'whatsapp' })

  } catch (err) {
    console.error('[notificar-turno] Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
