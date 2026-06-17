// api/update-bot-config.js
// Vercel Function — proxy seguro para actualizar bot-config
// en Plan-B sin exponer PLANB_PARTNER_KEY en el frontend

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { org_id, system_prompt, knowledge_base, modo } = req.body
  if (!org_id || !system_prompt)
    return res.status(400).json({ error: 'Faltan campos' })
  try {
    const r = await fetch(
      `https://plan-b-backend-production.up.railway.app/api/v1/orgs/${org_id}/bot-config`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Partner-Key': process.env.PLANB_PARTNER_KEY,
        },
        body: JSON.stringify({ system_prompt, knowledge_base, modo }),
      }
    )
    const data = await r.json()
    return res.status(r.ok ? 200 : 502).json(data)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
