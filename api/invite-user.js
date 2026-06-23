import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, nombre, roles, municipio_id, dependencia_id } = req.body

  if (!email || !nombre || !roles || !municipio_id) {
    return res.status(400).json({ error: 'Faltan datos requeridos' })
  }

  try {
    // 1. Invitar usuario en Auth (envía el mail automáticamente)
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { nombre }
      })

    if (authError) throw authError

    // 2. Insertar perfil en usuarios con service_role
    const { error: insertError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        id: authData.user.id,
        municipio_id,
        nombre,
        email,
        roles,
        dependencias_ids: dependencia_id ? [dependencia_id] : [],
        activo: false
      })

    if (insertError) throw insertError

    return res.status(200).json({ success: true, userId: authData.user.id })

  } catch (err) {
    console.error('invite-user error:', err)
    return res.status(500).json({ error: err.message })
  }
}
