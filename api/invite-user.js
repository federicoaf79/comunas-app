import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// =============================================================
// invite-user — alta de staff + mail de invitación con identidad
// del municipio (no el mail genérico en inglés de Supabase Auth).
//
// Por qué no alcanza con traducir la plantilla de Supabase: las
// plantillas de Auth son UNA sola para todo el proyecto, no por
// tenant — no hay forma de que muestren el logo/nombre del
// municipio que corresponde. Con 20 municipios, todos recibirían
// el mismo mail genérico.
//
// Por eso el mail lo mandamos nosotros (Resend), no Supabase:
//   1. generateLink({ type: 'invite' }) crea el usuario en
//      auth.users igual que inviteUserByEmail() hacía antes, pero
//      SIN disparar el mail automático — devuelve el link para que
//      lo mandemos nosotros. Es el uso documentado de esta función
//      en Supabase (existe justamente para integrar un proveedor de
//      mail propio).
//   2. Insert en `usuarios` (sin cambios respecto de antes).
//   3. Se arma el HTML con la identidad del municipio (logo +
//      nombre + email de contacto) y se manda vía Resend.
//
// El flujo de reset de contraseña NO se toca acá — sigue con la
// plantilla de Supabase (otro trabajo).
// =============================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = 'COMUNAS <no-reply@comunas.lat>'

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// HTML de email: tablas + estilos inline, sin flexbox/grid (Outlook
// no los soporta). Ancho máximo 600px. Logo del municipio arriba —
// si no hay logo cargado, el nombre en texto (nunca un ícono roto).
// El pie solo muestra el email de contacto si el municipio lo cargó
// (configuracion_portal.datos_municipio.email, ya existente y
// editable desde Config. General — "Email institucional") — nunca
// un placeholder. Cero mención de COMUNAS/Frey Consulting como
// soporte: el usuario se contacta con SU municipio.
function buildInviteEmailHtml({ municipioNombre, logoUrl, actionLink, emailContacto }) {
  const nombreSafe = escapeHtml(municipioNombre || 'Tu municipio')
  const linkSafe = escapeHtml(actionLink)

  const headerLogo = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${nombreSafe}" width="64" height="64" style="display:block;margin:0 auto;border-radius:50%;object-fit:cover;background-color:#ffffff;" />`
    : `<div style="font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:bold;color:#ffffff;">${nombreSafe}</div>`

  const footerRow = emailContacto
    ? `
    <tr>
      <td style="padding:20px 28px;background-color:#F5F4EF;text-align:center;border-top:1px solid #e6e3d8;">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#7d8598;">
          ¿Dudas? Escribí a
          <a href="mailto:${escapeHtml(emailContacto)}" style="color:#0F1C35;">${escapeHtml(emailContacto)}</a>
        </p>
      </td>
    </tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Invitación</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F5F4EF;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F5F4EF;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:#0F1C35;padding:28px 24px;text-align:center;">
                ${headerLogo}
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;font-family:Arial,Helvetica,sans-serif;color:#0F1C35;">
                <h1 style="margin:0 0 20px;font-size:20px;line-height:1.4;color:#0F1C35;">
                  ${nombreSafe} te invita al portal web de gestión y servicios
                </h1>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3c465c;">
                  Te invitaron a formar parte del equipo de <strong>${nombreSafe}</strong>. Estos son los próximos pasos:
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                  <tr>
                    <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#3c465c;">
                      <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background-color:#C9A84C;color:#0F1C35;font-weight:bold;border-radius:11px;font-size:12px;margin-right:10px;">1</span>
                      Creá tu contraseña con el botón de abajo
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#3c465c;">
                      <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background-color:#C9A84C;color:#0F1C35;font-weight:bold;border-radius:11px;font-size:12px;margin-right:10px;">2</span>
                      Completá tus datos personales
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#3c465c;">
                      <span style="display:inline-block;width:22px;height:22px;line-height:22px;text-align:center;background-color:#C9A84C;color:#0F1C35;font-weight:bold;border-radius:11px;font-size:12px;margin-right:10px;">3</span>
                      Tu cuenta va a quedar en revisión hasta que un administrador la habilite
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                  <tr>
                    <td align="center" style="border-radius:8px;background-color:#0F1C35;">
                      <a href="${linkSafe}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">
                        Crear mi contraseña
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#9aa2b1;text-align:center;">
                  Si el botón no funciona, copiá y pegá este link en tu navegador:<br />
                  <a href="${linkSafe}" style="color:#0F1C35;word-break:break-all;">${linkSafe}</a>
                </p>
              </td>
            </tr>
            ${footerRow}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

async function sendInviteEmail({ to, municipioNombre, logoUrl, actionLink, emailContacto }) {
  if (!RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY no está configurada — el mail de invitación no se puede enviar.')
  }
  const html = buildInviteEmailHtml({ municipioNombre, logoUrl, actionLink, emailContacto })
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    FROM_EMAIL,
      to:      [to],
      subject: `${municipioNombre || 'Tu municipio'} te invita al portal web de gestión y servicios`,
      html,
    }),
  })
  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    throw new Error(`Resend respondió ${res.status}: ${bodyText || 'sin detalle'}`)
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, nombre, roles, municipio_id, dependencia_id } = req.body

  if (!email || !nombre || !roles || !municipio_id) {
    return res.status(400).json({ error: 'Faltan datos requeridos' })
  }

  try {
    // 1. Generar el link de invitación en Auth SIN que Supabase mande
    //    el mail — ver comentario de arriba.
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { data: { nombre } },
      })

    if (linkError) throw linkError

    const actionLink = linkData.properties.action_link
    const userId = linkData.user.id

    // 2. Insertar perfil en usuarios con service_role
    const { error: insertError } = await supabaseAdmin
      .from('usuarios')
      .insert({
        id: userId,
        municipio_id,
        nombre,
        email,
        roles,
        dependencias_ids: dependencia_id ? [dependencia_id] : [],
        activo: false
      })

    if (insertError) throw insertError

    // 3. Identidad del municipio para el mail — logo (identidad_visual)
    //    + nombre oficial (municipios.nombre) + email de contacto
    //    (datos_municipio.email, ya editable desde Config. General).
    //    Si esto falla no aborta el alta (el usuario y el link ya
    //    existen) — el mail sale sin logo/nombre en vez de romper todo.
    let municipioNombre = null
    let logoUrl = null
    let emailContacto = null
    try {
      const [muniRes, configRes] = await Promise.all([
        supabaseAdmin.from('municipios').select('nombre').eq('id', municipio_id).maybeSingle(),
        supabaseAdmin.from('configuracion_portal').select('clave, valor')
          .eq('municipio_id', municipio_id)
          .in('clave', ['identidad_visual', 'datos_municipio']),
      ])
      municipioNombre = muniRes.data?.nombre ?? null
      const porClave = Object.fromEntries((configRes.data ?? []).map(r => [r.clave, r.valor]))
      logoUrl = porClave.identidad_visual?.logo_url || null
      emailContacto = porClave.datos_municipio?.email || null
    } catch (identidadErr) {
      console.warn('invite-user: no se pudo resolver identidad del municipio:', identidadErr.message)
    }

    // 4. Mandar el mail vía Resend con la identidad del municipio.
    await sendInviteEmail({ to: email, municipioNombre, logoUrl, actionLink, emailContacto })

    return res.status(200).json({ success: true, userId })

  } catch (err) {
    console.error('invite-user error:', err)
    return res.status(500).json({ error: err.message })
  }
}
