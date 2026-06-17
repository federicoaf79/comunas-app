// api/provision-whatsapp.js
// Vercel Function — llama a Plan-B /api/v1/provision
// y guarda las credenciales en configuracion_portal

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PLANB_BASE = 'https://plan-b-backend-production.up.railway.app'
const PLANB_PARTNER_KEY = process.env.PLANB_PARTNER_KEY

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { municipio_id, municipio_slug, nombre, provincia } = req.body

  if (!municipio_id || !municipio_slug) {
    return res.status(400).json({
      error: 'municipio_id y municipio_slug son requeridos'
    })
  }

  try {
    const webhook_url =
      `https://${municipio_slug}.comunas.lat/api/webhook-whatsapp`

    const provisionRes = await fetch(
      `${PLANB_BASE}/api/v1/provision`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Partner-Key': PLANB_PARTNER_KEY,
        },
        body: JSON.stringify({
          municipio_slug,
          nombre: nombre ?? municipio_slug,
          provincia: provincia ?? '',
          webhook_url,
        }),
      }
    )

    if (!provisionRes.ok) {
      const err = await provisionRes.text()
      console.error('[provision-whatsapp] Plan-B error:', err)
      return res.status(502).json({
        error: 'Error al provisionar en Plan-B',
        detail: err
      })
    }

    const { org_id, api_key, webhook_url: wb, numero_asignado } =
      await provisionRes.json()

    const configs = [
      { clave: 'plan_b_org_id',   valor: org_id,         publico: false },
      { clave: 'plan_b_api_key',  valor: api_key,         publico: false },
      { clave: 'plan_b_webhook',  valor: wb,              publico: false },
      { clave: 'whatsapp_numero', valor: numero_asignado, publico: true  },
      { clave: 'whatsapp_modo',   valor: 'sandbox',       publico: false },
    ]

    for (const config of configs) {
      const { error } = await supabase
        .from('configuracion_portal')
        .upsert(
          { municipio_id, ...config },
          { onConflict: 'municipio_id,clave' }
        )
      if (error) throw error
    }

    const { data: muni } = await supabase
      .from('municipios')
      .select('nombre, provincia')
      .eq('id', municipio_id)
      .single()

    const systemPrompt =
`Sos el asistente municipal oficial de ${muni?.nombre ?? nombre}.
Tu función es ayudar a los vecinos a sacar turnos y obtener
información sobre dependencias y servicios municipales.

Cuando el vecino pide un turno:
1. Preguntá para qué dependencia necesita el turno
2. Informá los horarios disponibles (Lunes a Viernes 8:00 a 13:00)
3. Pedí nombre completo y DNI
4. Confirmá el turno

Dependencias con turnos: Sala de Primeros Auxilios,
Juez de Paz, Salón de Usos Múltiples, Administración.

Respondé siempre en español argentino, de forma clara y amable.`

    await fetch(
      `${PLANB_BASE}/api/v1/orgs/${org_id}/bot-config`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Partner-Key': PLANB_PARTNER_KEY,
        },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          knowledge_base: [],
          modo: 'sandbox',
        }),
      }
    )

    return res.status(200).json({
      ok: true,
      org_id,
      api_key,
      webhook_url: wb,
      numero_asignado,
    })

  } catch (err) {
    console.error('[provision-whatsapp] Error:', err)
    return res.status(500).json({
      error: 'Error interno',
      detail: err.message
    })
  }
}
