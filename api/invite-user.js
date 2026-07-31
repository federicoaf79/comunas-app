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
// Si el paso 4 (Resend) falla, se hace ROLLBACK del auth user y de la
// fila de `usuarios` recién creados (ver rollbackUsuario) — nunca dejar
// una cuenta a medio crear. Reenviar una invitación después (mail
// perdido, cayó en spam, el link venció) es api/resend-invite.js, un
// endpoint aparte porque ahí NO hay nada que insertar ni que
// rollbackear — el usuario ya existe de antes.
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

// Deshace el alta cuando algo DESPUÉS de crear el auth user sale mal —
// nunca dejar una cuenta a medio crear: sin este rollback, un fallo de
// mail (confirmado en vivo 2026-07-31: Resend devolvió 403 por el
// dominio sin verificar) dejaba un usuario fantasma que nunca recibió
// invitación y bloqueaba reintentar con el mismo email ("user already
// registered", sin salida desde la UI). Best-effort: si el rollback en
// sí falla, se loguea pero no tapa el error original que ve el caller.
async function rollbackUsuario(userId) {
  const [usuariosRes, authRes] = await Promise.allSettled([
    supabaseAdmin.from('usuarios').delete().eq('id', userId),
    supabaseAdmin.auth.admin.deleteUser(userId),
  ])
  if (usuariosRes.status === 'rejected' || usuariosRes.value?.error) {
    console.error('invite-user rollback: no se pudo borrar de usuarios', userId, usuariosRes.reason ?? usuariosRes.value?.error)
  }
  if (authRes.status === 'rejected' || authRes.value?.error) {
    console.error('invite-user rollback: no se pudo borrar de auth.users', userId, authRes.reason ?? authRes.value?.error)
  }
}

// Resuelve el subdominio REAL del tenant desde `dominios_municipio` —
// NO desde `municipios.slug`. Confirmado en vivo 2026-07-31 que
// difieren: Real Sayana tiene slug 'real-sayana' (con guión) pero su
// subdominio real es 'realsayana.comunas.lat' (sin guión). Sin esto,
// generateLink usaba la Site URL default de Supabase (comunas.lat, la
// landing comercial) y el link de "crear tu contraseña" mandaba ahí en
// vez de al subdominio del municipio — confirmado en el mail real.
//
// `/portal/reset-password` es la única pantalla de la app que llama
// `supabase.auth.updateUser({ password })` — no existe un equivalente
// separado para staff, así que es el destino correcto tanto para
// invitación como para recovery (la página no distingue el tipo de
// token, solo necesita una sesión ya autenticada por el hash de la URL,
// que Supabase-js establece solo al cargar cualquier página).
//
// Si el municipio no tiene un subdominio registrado, cae a undefined
// (generateLink usa la Site URL default) en vez de romper — pero
// loguea un warning, porque significa que ese tenant quedó mal dado de
// alta (todo municipio real tiene que tener su fila en
// dominios_municipio, ver Dominios.jsx/superadmin).
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
      console.warn(`invite-user: el municipio ${municipioId} no tiene un subdominio activo en dominios_municipio — el link va a caer en la Site URL default. Revisar el alta de este tenant.`)
      return undefined
    }
    const host = String(data.dominio).replace(/^https?:\/\//, '').replace(/\/+$/, '')
    return `https://${host}/portal/reset-password`
  } catch (err) {
    console.warn('invite-user: no se pudo resolver el dominio del tenant, usando Site URL default:', err.message)
    return undefined
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, nombre, roles, municipio_id, dependencia_id } = req.body

  if (!email || !nombre || !roles || !municipio_id) {
    return res.status(400).json({ error: 'Faltan datos requeridos' })
  }

  let userId = null

  try {
    // 1. Generar el link de invitación en Auth SIN que Supabase mande
    //    el mail — ver comentario de arriba. redirectTo apunta al
    //    subdominio REAL del tenant (ver resolveRedirectTo) — sin esto
    //    el link caía en la Site URL default (comunas.lat, la landing
    //    comercial), confirmado en el mail real 2026-07-31.
    const redirectTo = await resolveRedirectTo(municipio_id)
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          data: { nombre },
          ...(redirectTo ? { redirectTo } : {}),
        },
      })

    if (linkError) throw linkError

    userId = linkData.user.id
    const actionLink = linkData.properties.action_link

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

    // 4. Mandar el mail vía Resend con la identidad del municipio. Si
    //    falla, rollback en cascada (ver rollbackUsuario) y un error
    //    distinguible — "no se pudo enviar el mail" en criollo, nunca
    //    el JSON técnico de Resend, que a un empleado municipal no le
    //    dice nada.
    try {
      await sendInviteEmail({ to: email, municipioNombre, logoUrl, actionLink, emailContacto })
    } catch (emailErr) {
      console.error('invite-user: fallo el envío del mail, rollback:', emailErr.message)
      await rollbackUsuario(userId)
      return res.status(502).json({
        error: 'No pudimos enviar el mail de invitación. No se creó ningún usuario — revisá el email e intentá de nuevo.',
        code:  'EMAIL_SEND_FAILED',
      })
    }

    return res.status(200).json({ success: true, userId })

  } catch (err) {
    console.error('invite-user error:', err)
    // Si el auth user ya se había creado antes de este error (ej. falló
    // el insert en `usuarios`), lo limpiamos también — mismo principio:
    // nunca dejar una cuenta a medio crear que bloquee reintentar.
    if (userId) {
      await rollbackUsuario(userId)
    }
    return res.status(500).json({ error: err.message })
  }
}
