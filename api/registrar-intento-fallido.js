import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// =============================================================
// registrar-intento-fallido — LOG parte 2: login fallido.
//
// POR QUÉ ES UNA FUNCIÓN DE VERCEL Y NO UN INSERT DIRECTO DEL CLIENTE
// Un login fallido no genera sesión, así que el insert saldría con la
// anon key sin ningún token — es decir, como el rol `anon`. Y a `anon`
// se le revocó INSERT en todas las tablas de public (sprint de cierre
// de escritura anónima), audit_log incluida. Además, esta es la ÚNICA
// pieza de todo el flujo de login que puede ver la IP real y el Host
// tal como los mandó el navegador — el cliente JS nunca los tiene.
//
// QUÉ NUNCA LLEGA ACÁ
// La contraseña. El cliente no la manda (ver las tres páginas que
// llaman a esto) y aunque llegara en el body, este archivo no la lee
// ni la reenvía a ningún lado — ni siquiera se destructura del body.
//
// MUNICIPIO — DESDE EL HOST, NO DESDE EL BODY
// El cliente podría mandar cualquier cosa en el body; el Host header
// lo pone el navegador según el subdominio real al que apuntó, y de
// ahí sale el tenant. Mismo mecanismo que ya usan invite-user.js y
// resend-invite.js para lo inverso (municipio_id -> subdominio):
// `dominios_municipio` (tipo='subdominio', activo=true). El dominio
// guardado ahí a veces incluye protocolo/slash final (ver esos dos
// archivos) — se normalizan los dos lados antes de comparar.
//
// RATE LIMITING CONTRA LA BASE, NO EN MEMORIA
// Una function serverless no tiene estado entre invocaciones (cada
// request puede caer en una instancia distinta) — cualquier contador
// en memoria de proceso se resetea o directamente no se comparte. Por
// eso el conteo es una query a audit_log por ip_address en los
// últimos 15 minutos. Pasado el umbral, se deja de insertar una fila
// por intento, PERO se escribe una única fila marcadora por ventana
// (accion LOGIN_FALLIDO igual, con datos_despues.silenciado=true) —
// sin esto, un ataque de fuerza bruta sostenido se vuelve invisible
// justo cuando más importa verlo. El cliente nunca se entera de nada
// de esto: siempre 200, silenciado o no.
// =============================================================

const VIAS_VALIDAS = ['login_staff', 'acceso', 'portal_acceso']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const VENTANA_MS = 15 * 60 * 1000
const MAX_INTENTOS_POR_VENTANA = 10

function obtenerIp(req) {
  const xff = req.headers['x-forwarded-for']
  if (xff) return String(xff).split(',')[0].trim()
  return req.socket?.remoteAddress ?? null
}

async function resolverMunicipioIdDesdeHost(host) {
  if (!host) return null
  const hostNorm = String(host).toLowerCase().replace(/:\d+$/, '')
  const { data, error } = await supabaseAdmin
    .from('dominios_municipio')
    .select('municipio_id, dominio')
    .eq('tipo', 'subdominio')
    .eq('activo', true)
  if (error) {
    console.error('registrar-intento-fallido: no se pudo leer dominios_municipio:', error.message)
    return null
  }
  const match = (data ?? []).find(row => {
    const dom = String(row.dominio ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '')
    return dom === hostNorm
  })
  return match?.municipio_id ?? null
}

async function contarIntentosRecientes(ip) {
  const desde = new Date(Date.now() - VENTANA_MS).toISOString()
  const { count, error } = await supabaseAdmin
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('accion', 'LOGIN_FALLIDO')
    .eq('ip_address', ip)
    .gte('created_at', desde)
  if (error) {
    console.error('registrar-intento-fallido: no se pudo contar intentos recientes:', error.message)
    // Fail-open sobre el conteo: un error de lectura no puede hacer que
    // dejemos de registrar el intento actual como si nada.
    return 0
  }
  return count ?? 0
}

async function yaHayMarcadorEnVentana(ip) {
  const desde = new Date(Date.now() - VENTANA_MS).toISOString()
  const { data, error } = await supabaseAdmin
    .from('audit_log')
    .select('id')
    .eq('accion', 'LOGIN_FALLIDO')
    .eq('ip_address', ip)
    .gte('created_at', desde)
    .filter('datos_despues->>silenciado', 'eq', 'true')
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('registrar-intento-fallido: no se pudo chequear el marcador de silenciado:', error.message)
    // Fail-safe hacia "no hay marcador todavía": preferible un marcador
    // duplicado de más (inofensivo) a que un ataque sostenido nunca
    // deje ni una sola fila visible por un error de lectura puntual.
    return false
  }
  return !!data
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { email, via } = req.body ?? {}

  if (!VIAS_VALIDAS.includes(via)) {
    return res.status(400).json({ error: 'via inválida' })
  }
  if (typeof email !== 'string' || email.length === 0 || email.length > 320 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'email inválido' })
  }

  const ip = obtenerIp(req)
  const hostname = req.headers['host'] ?? null

  try {
    const municipioId = await resolverMunicipioIdDesdeHost(hostname)
    if (!municipioId) {
      console.error('registrar-intento-fallido: no se pudo resolver municipio_id desde el host', { hostname })
    }

    if (ip) {
      const intentosRecientes = await contarIntentosRecientes(ip)
      if (intentosRecientes > MAX_INTENTOS_POR_VENTANA) {
        const marcadorYaExiste = await yaHayMarcadorEnVentana(ip)
        if (!marcadorYaExiste) {
          const { error } = await supabaseAdmin.from('audit_log').insert({
            municipio_id: municipioId,
            usuario_id: null,
            accion: 'LOGIN_FALLIDO',
            entidad: 'auth',
            entidad_id: null,
            ip_address: ip,
            descripcion: `Se silenciaron intentos de login fallidos desde esta IP por exceso — más de ${MAX_INTENTOS_POR_VENTANA} en 15 minutos`,
            datos_despues: { via, email, hostname, silenciado: true },
          })
          if (error) console.error('registrar-intento-fallido: no se pudo insertar el marcador:', error.message)
        }
        // El cliente nunca sabe si se silenció o no.
        return res.status(200).json({ ok: true })
      }
    }

    // usuario_id: si el email coincide con una cuenta de staff real, la
    // fila queda ligada a esa cuenta — permite ver "N intentos fallidos
    // contra la cuenta de Fulano". Si no existe, null y el email queda
    // en datos_despues (mismo criterio que registrarAcceso).
    let usuarioId = null
    try {
      const { data: row } = await supabaseAdmin
        .from('usuarios')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      usuarioId = row?.id ?? null
    } catch (e) {
      console.error('registrar-intento-fallido: no se pudo resolver usuario_id:', e.message)
    }

    const { error } = await supabaseAdmin.from('audit_log').insert({
      municipio_id: municipioId,
      usuario_id: usuarioId,
      accion: 'LOGIN_FALLIDO',
      entidad: 'auth',
      entidad_id: usuarioId,
      ip_address: ip,
      descripcion: `Intento de login fallido — ${email}`,
      datos_despues: { via, email, hostname },
    })
    if (error) {
      console.error('registrar-intento-fallido: insert falló:', error.message)
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('registrar-intento-fallido error:', err)
    // Nunca un error visible acá -- es telemetría best-effort, no puede
    // interferir con lo que el usuario ve tras un login fallido.
    return res.status(200).json({ ok: true })
  }
}
