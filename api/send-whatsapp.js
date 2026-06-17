// api/send-whatsapp.js
// Proxy seguro para enviar WhatsApp via Plan-B

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PLANB_BASE = 'https://plan-b-backend-production.up.railway.app'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { municipio_id, to, message, tipo } = req.body

  if (!municipio_id || !to || !message) {
    return res.status(400).json({
      error: 'municipio_id, to y message son requeridos'
    })
  }

  try {
    const { data: configs } = await supabase
      .from('configuracion_portal')
      .select('clave, valor')
      .eq('municipio_id', municipio_id)
      .in('clave', ['plan_b_api_key', 'plan_b_org_id'])

    const cfg = Object.fromEntries(
      configs?.map(c => [c.clave, c.valor]) ?? []
    )

    if (!cfg.plan_b_api_key) {
      return res.status(404).json({
        error: 'WhatsApp no configurado para este municipio'
      })
    }

    const sendRes = await fetch(`${PLANB_BASE}/api/v1/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': cfg.plan_b_api_key,
      },
      body: JSON.stringify({
        to,
        message,
        org_id: cfg.plan_b_org_id,
        tipo: tipo ?? 'manual',
      }),
    })

    if (!sendRes.ok) {
      const err = await sendRes.text()
      return res.status(502).json({
        error: 'Error al enviar mensaje',
        detail: err
      })
    }

    const result = await sendRes.json()
    return res.status(200).json({ ok: true, ...result })

  } catch (err) {
    console.error('[send-whatsapp] Error:', err)
    return res.status(500).json({
      error: 'Error interno',
      detail: err.message
    })
  }
}
