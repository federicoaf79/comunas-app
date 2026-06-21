// api/sync-planb.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const PLANB_API = 'https://plan-b-backend-production.up.railway.app'
const PLANB_PARTNER_KEY = process.env.PLANB_PARTNER_KEY

function generarMarkdownDependencias(dependencias, municipioNombre) {
  let md = `# ${municipioNombre}\n\n`
  md += `Somos el municipio de ${municipioNombre}. Ofrecemos servicios en múltiples dependencias:\n\n`

  for (const dep of dependencias) {
    md += `---\n\n`
    md += `## ${dep.nombre.toUpperCase()}\n\n`
    if (dep.horario_atencion) md += `**Horario:** ${dep.horario_atencion}\n`
    if (dep.telefono)         md += `**Teléfono:** ${dep.telefono}\n`
    if (dep.email_contacto)   md += `**Email:** ${dep.email_contacto}\n`
    if (dep.direccion)        md += `**Dirección:** ${dep.direccion}\n`
    if (dep.responsable)      md += `**Responsable:** ${dep.responsable}\n`
    md += '\n'

    if (Array.isArray(dep.servicios) && dep.servicios.length > 0) {
      md += `**Servicios:**\n`
      for (const s of dep.servicios) md += `- ${s}\n`
      md += '\n'
    }

    if (dep.bot_descripcion) md += `${dep.bot_descripcion}\n\n`
  }

  return md
}

function generarMarkdownFAQ(dependencias) {
  const seccionesFAQ = dependencias.filter(d => d.bot_faq)
  if (seccionesFAQ.length === 0) return null

  let md = `# Preguntas frecuentes\n\n`
  for (const dep of seccionesFAQ) {
    md += `## ${dep.nombre}\n\n`
    md += `${dep.bot_faq}\n\n`
  }
  return md
}

function generarMarkdownRestricciones(dependencias) {
  const secciones = dependencias.filter(d => d.bot_restricciones)
  if (secciones.length === 0) return null

  let md = `# Restricciones por dependencia\n\n`
  for (const dep of secciones) {
    md += `## ${dep.nombre}\n${dep.bot_restricciones}\n\n`
  }
  return md
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  // Validar que viene de Comunas (header interno)
  const internalKey = req.headers['x-internal-key']
  if (internalKey !== process.env.INTERNAL_SYNC_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { municipio_id } = req.body
  if (!municipio_id) return res.status(400).json({ error: 'municipio_id requerido' })

  try {
    // 1. Obtener config del municipio (plan_b_org_id + nombre)
    const { data: config, error: configError } = await supabase
      .from('configuracion_portal')
      .select('plan_b_org_id, datos')
      .eq('municipio_id', municipio_id)
      .single()

    if (configError || !config?.plan_b_org_id) {
      return res.status(404).json({ error: 'Municipio sin Plan-B configurado' })
    }

    const org_id = config.plan_b_org_id
    const municipioNombre = config.datos?.nombre_oficial || 'Municipio'

    // 2. Obtener dependencias activas con campos del bot
    const { data: dependencias, error: depsError } = await supabase
      .from('dependencias')
      .select('nombre, tipo, horario_atencion, telefono, email_contacto, direccion, responsable, servicios, bot_descripcion, bot_faq, bot_restricciones')
      .eq('municipio_id', municipio_id)
      .eq('activa', true)
      .order('nombre')

    if (depsError) throw depsError

    if (!dependencias || dependencias.length === 0) {
      return res.status(200).json({ ok: true, message: 'Sin dependencias activas' })
    }

    // 3. Generar knowledge base items
    const knowledgeBase = []

    const mdEmpresa = generarMarkdownDependencias(dependencias, municipioNombre)
    knowledgeBase.push({
      tipo: 'prompt_empresa',
      titulo: `Información del municipio`,
      contenido: mdEmpresa
    })

    const mdFAQ = generarMarkdownFAQ(dependencias)
    if (mdFAQ) {
      knowledgeBase.push({
        tipo: 'faq',
        titulo: 'Preguntas frecuentes',
        contenido: mdFAQ
      })
    }

    const mdRestricciones = generarMarkdownRestricciones(dependencias)
    if (mdRestricciones) {
      knowledgeBase.push({
        tipo: 'prompt_restricciones',
        titulo: 'Restricciones',
        contenido: mdRestricciones
      })
    }

    // 4. Sincronizar con Plan-B via Partner API
    const planbRes = await fetch(
      `${PLANB_API}/api/v1/orgs/${org_id}/bot-config`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Partner-Key': PLANB_PARTNER_KEY,
        },
        body: JSON.stringify({ knowledge_base: knowledgeBase }),
      }
    )

    const planbData = await planbRes.json()

    if (!planbRes.ok) {
      console.error('[sync-planb] Error Plan-B:', planbData)
      return res.status(502).json({ error: 'Error sincronizando con Plan-B', detail: planbData })
    }

    console.log(`[sync-planb] Sincronizado municipio ${municipio_id} → org ${org_id} (${knowledgeBase.length} items)`)

    return res.status(200).json({
      ok: true,
      org_id,
      items: knowledgeBase.length,
      dependencias: dependencias.length
    })

  } catch (e) {
    console.error('[sync-planb] Error:', e.message)
    return res.status(500).json({ error: e.message })
  }
}
