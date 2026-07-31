import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// =============================================================
// resend-invite — "Reenviar invitación" en /admin/usuarios, para
// usuarios inactivos que nunca aceptaron (mail perdido, cayó en spam,
// el link venció). Sin esto no había forma de recuperar sin borrar y
// recrear al usuario a mano.
//
// A propósito NO reusa el archivo invite-user.js como función
// compartida (mismo criterio que el resto de api/: cada función es
// autocontenida) — sí reusa el MECANISMO: generateLink({type:'invite'})
// para un usuario que YA EXISTE pero sigue sin confirmar reemplaza el
// token/link anterior en vez de crear un usuario nuevo o duplicar la
// fila en `usuarios` — es el comportamiento que Supabase espera para
// reenviar invitaciones. Por eso acá NO hay insert ni rollback: el
// usuario ya existía antes de este request, un reenvío fallido deja
// todo exactamente como estaba.
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

// Mismo template que invite-user.js — ver ese archivo para el porqué
// de cada decisión de diseño (logo opcional, footer condicional, etc.)
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

// Mismo criterio que invite-user.js: el subdominio real del tenant NO es
// municipios.slug (confirmado con Real Sayana: slug "real-sayana" con
// guión, subdominio real "realsayana.comunas.lat" sin guión) — hay que
// resolverlo desde dominios_municipio. Si el tenant no tiene un
// subdominio activo cargado ahí, se cae a la Site URL default de
// Supabase (con warning: significa que ese tenant quedó mal dado de alta).
async function resolveRedirectTo(municipioId) {
  try {
    const { data, error } = await supabaseAdmin
      .from('dominios_municipio')
      .select('dominio')
      .eq('municipio_id', municipioId)
      .eq('tipo', 'subdominio')
      .eq('activo', true)
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!data?.dominio) {
      console.warn(`resend-invite: el municipio ${municipioId} no tiene un subdominio activo en dominios_municipio — el link va a caer en la Site URL default. Revisar el alta de este tenant.`)
      return undefined
    }
    const host = String(data.dominio).replace(/^https?:\/\//, '').replace(/\/+$/, '')
    return `https://${host}/portal/reset-password`
  } catch (err) {
    console.warn('resend-invite: no se pudo resolver el dominio del tenant, usando Site URL default:', err.message)
    return undefined
  }
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

  const { usuario_id } = req.body
  if (!usuario_id) {
    return res.status(400).json({ error: 'Falta usuario_id' })
  }

  try {
    // 1. Traer el usuario. Si ya está activo, reenviar no tiene sentido
    //    (ya aceptó la invitación en algún momento).
    const { data: usuario, error: userErr } = await supabaseAdmin
      .from('usuarios')
      .select('id, email, nombre, municipio_id, activo')
      .eq('id', usuario_id)
      .maybeSingle()
    if (userErr) throw userErr
    if (!usuario) {
      return res.status(404).json({ error: 'No se encontró el usuario.' })
    }
    if (usuario.activo) {
      return res.status(400).json({ error: 'Este usuario ya aceptó la invitación — no hace falta reenviarla.' })
    }

    // 2. Nuevo link — ver comentario de arriba del archivo.
    const redirectTo = await resolveRedirectTo(usuario.municipio_id)
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: usuario.email,
        options: {
          data: { nombre: usuario.nombre },
          ...(redirectTo ? { redirectTo } : {}),
        },
      })
    if (linkError) throw linkError
    const actionLink = linkData.properties.action_link

    // 3. Identidad del municipio — igual que invite-user.js, best-effort.
    let municipioNombre = null
    let logoUrl = null
    let emailContacto = null
    try {
      const [muniRes, configRes] = await Promise.all([
        supabaseAdmin.from('municipios').select('nombre').eq('id', usuario.municipio_id).maybeSingle(),
        supabaseAdmin.from('configuracion_portal').select('clave, valor')
          .eq('municipio_id', usuario.municipio_id)
          .in('clave', ['identidad_visual', 'datos_municipio']),
      ])
      municipioNombre = muniRes.data?.nombre ?? null
      const porClave = Object.fromEntries((configRes.data ?? []).map(r => [r.clave, r.valor]))
      logoUrl = porClave.identidad_visual?.logo_url || null
      emailContacto = porClave.datos_municipio?.email || null
    } catch (identidadErr) {
      console.warn('resend-invite: no se pudo resolver identidad del municipio:', identidadErr.message)
    }

    // 4. Mandar el mail. Sin rollback acá a propósito — el usuario ya
    //    existía antes de este request, un fallo lo deja tal cual
    //    estaba (a diferencia del alta nueva en invite-user.js).
    try {
      await sendInviteEmail({ to: usuario.email, municipioNombre, logoUrl, actionLink, emailContacto })
    } catch (emailErr) {
      console.error('resend-invite: fallo el envío del mail:', emailErr.message)
      return res.status(502).json({
        error: 'No pudimos reenviar el mail de invitación. Probá de nuevo en un momento.',
        code:  'EMAIL_SEND_FAILED',
      })
    }

    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('resend-invite error:', err)
    return res.status(500).json({ error: err.message })
  }
}
