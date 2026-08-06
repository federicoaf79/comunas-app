import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, supabasePublic } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveMunicipioId } from './useEffectiveMunicipioId'

// =============================================================
// useAuditLog — lectura y registro del log de auditoría.
//
// Schema REAL de la tabla (verificado contra el error
// "column audit_log.actor_email does not exist"):
//   audit_log (id, municipio_id, usuario_id, accion, entidad,
//     entidad_id, descripcion, datos_antes, datos_despues,
//     ip_address, created_at)
//
// NO existen: actor_email, actor_nombre, metadata, ip, user_agent.
// El nombre/email del actor se obtienen por join a `usuarios`
// vía la FK usuario_id (embed key `usuarios`).
//
// Acciones soportadas (texto libre, este conjunto es el que la
// UI sabe pintar con badges):
//   LOGIN | LOGIN_FALLIDO | LOGOUT | create | update | approve |
//   reject | delete | export | access
//
// LOGIN/LOGIN_FALLIDO/LOGOUT van en mayúscula a propósito (histórico,
// ver registrarAcceso() más abajo) — el resto queda en minúscula. No
// unificar el casing: reescribiría filas viejas reales de un log de
// auditoría, que no se reescribe.
// =============================================================

const COLS = `
  id, municipio_id, usuario_id, accion, entidad, entidad_id,
  descripcion, datos_antes, datos_despues, ip_address, created_at,
  usuarios:usuario_id ( nombre, email )
`

const LIMIT_DEFAULT = 100

export async function fetchAuditLog({
  municipioId, actorId, accion, entidad,
  fechaDesde, fechaHasta, limit = LIMIT_DEFAULT,
} = {}) {
  let q = supabase
    .from('audit_log')
    .select(COLS)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (municipioId) q = q.eq('municipio_id', municipioId)
  if (actorId)     q = q.eq('usuario_id', actorId)
  if (accion)      q = q.eq('accion', accion)
  if (entidad)     q = q.eq('entidad', entidad)
  if (fechaDesde)  q = q.gte('created_at', `${fechaDesde}T00:00:00-03:00`)
  if (fechaHasta)  q = q.lte('created_at', `${fechaHasta}T23:59:59.999-03:00`)
  const { data, error } = await q
  if (error) {
    console.warn('[useAuditLog] fetch error:', error.message)
    // Si la tabla todavía no existe, devolvemos vacío para que la
    // página renderice un empty-state limpio en vez de un error
    // confuso. El admin verá la nota de que falta correr la migration.
    if (/relation .*audit_log.*does not exist/i.test(error.message ?? '')) return []
    throw error
  }
  return data ?? []
}

export function useAuditLog(filtros = {}) {
  const { perfil } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  const isSuperadmin = (perfil?.roles ?? []).includes('superadmin')
  // superadmin puede ver el log de todos los municipios; admin_comuna
  // siempre va con su municipio efectivo.
  const muniFiltro = isSuperadmin
    ? (filtros.municipioId ?? null)
    : municipioId
  return useQuery({
    queryKey: [
      'audit-log',
      muniFiltro ?? '__ALL__',
      filtros.actorId ?? '',
      filtros.accion ?? '',
      filtros.entidad ?? '',
      filtros.fechaDesde ?? '',
      filtros.fechaHasta ?? '',
      filtros.limit ?? LIMIT_DEFAULT,
    ],
    queryFn:  () => fetchAuditLog({
      municipioId: muniFiltro,
      ...filtros,
    }),
    enabled: !!perfil,
    staleTime: 30 * 1000,
  })
}

// Hook auxiliar para KPI de "Usuarios activos hoy" (cantidad de
// usuario_id distintos con login hoy). Usa la misma RLS que el log.
export function useAccesosHoy() {
  const { perfil } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  return useQuery({
    queryKey: ['audit-accesos-hoy', municipioId ?? '__ALL__'],
    queryFn: async () => {
      const today = new Date()
      const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      let q = supabase
        .from('audit_log')
        .select('usuario_id, created_at')
        .eq('accion', 'LOGIN')
        .gte('created_at', `${ymd}T00:00:00-03:00`)
        .lte('created_at', `${ymd}T23:59:59.999-03:00`)
      if (municipioId) q = q.eq('municipio_id', municipioId)
      const { data, error } = await q
      if (error) {
        if (/relation .*audit_log.*does not exist/i.test(error.message ?? '')) {
          return { usuariosActivos: 0, totalAccesos: 0 }
        }
        throw error
      }
      const rows = data ?? []
      const distinct = new Set(rows.map(r => r.usuario_id).filter(Boolean))
      return {
        usuariosActivos: distinct.size,
        totalAccesos:    rows.length,
      }
    },
    enabled: !!perfil,
    staleTime: 60 * 1000,
  })
}

// Hook para el KPI mensual.
export function useAccesosMes() {
  const { perfil } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  return useQuery({
    queryKey: ['audit-accesos-mes', municipioId ?? '__ALL__'],
    queryFn: async () => {
      const today = new Date()
      const first = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
      let q = supabase
        .from('audit_log')
        .select('id, created_at', { count: 'exact', head: true })
        .eq('accion', 'LOGIN')
        .gte('created_at', `${first}T00:00:00-03:00`)
      if (municipioId) q = q.eq('municipio_id', municipioId)
      const { count, error } = await q
      if (error) {
        if (/relation .*audit_log.*does not exist/i.test(error.message ?? '')) return 0
        throw error
      }
      return count ?? 0
    },
    enabled: !!perfil,
    staleTime: 60 * 1000,
  })
}

export async function createAuditLog({
  accion, entidad, entidadId, descripcion, metadata, datosAntes, municipioId,
} = {}) {
  if (!accion) throw new Error('createAuditLog: accion es requerida.')
  const { data: { user } = {} } = await supabase.auth.getUser()
  if (!user) throw new Error('createAuditLog: sin sesión activa.')
  // Por default, municipio_id se infiere de la propia fila del actor en
  // `usuarios` — correcto para el 100% de las acciones de staff dentro
  // de su propio municipio. `municipioId` es un override explícito para
  // el único caso que rompe ese supuesto: un superadmin editando la
  // configuración de OTRO municipio (ej. /superadmin/modulos) — ahí
  // inferir del actor guardaría el municipio del superadmin (o null,
  // si no tiene fila en `usuarios`), nunca el tenant real que se editó.
  let municipio_id = municipioId ?? null
  if (!municipio_id) {
    try {
      const { data: row } = await supabase
        .from('usuarios')
        .select('municipio_id')
        .eq('id', user.id)
        .maybeSingle()
      municipio_id = row?.municipio_id ?? null
    } catch { /* falla silenciosa — seguimos con lo que tenemos */ }
  }
  const { error } = await supabase
    .from('audit_log')
    .insert({
      municipio_id,
      usuario_id:  user.id,
      accion,
      entidad:     entidad ?? null,
      entidad_id:  entidadId == null ? null : String(entidadId),
      descripcion: descripcion ?? null,
      // `datosAntes` es opcional a propósito — la mayoría de las
      // acciones (create, por ejemplo) no tienen un "antes" real.
      // `null` distingue "no se capturó" de "el antes era {}".
      datos_antes:   datosAntes ?? null,
      // El payload libre que antes iba a `metadata` (columna
      // inexistente) ahora se persiste en `datos_despues` (jsonb).
      datos_despues: metadata ?? {},
    })
  if (error) {
    if (/relation .*audit_log.*does not exist/i.test(error.message ?? '')) return
    console.warn('[useAuditLog] createAuditLog error:', error.message)
    throw error
  }
}

export function useCreateAuditLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createAuditLog,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['audit-log'] }),
  })
}

// Auditoría para acciones disparadas por un VECINO desde el portal
// (no staff). `usuario_id` siempre queda null — un vecino no tiene
// fila en `usuarios`, y esa columna tiene FK a usuarios.id, así que
// pasarle el auth.uid() del vecino (o inventar uno) rompe con
// violación de FK. Quién hizo la acción se guarda en datos_despues
// como { actor: 'vecino', vecino_id }.
//
// Usa supabasePublic (no supabase) porque se llama desde contextos
// 100% públicos — "acceso rápido" (DNI+teléfono) ni siquiera tiene
// sesión de Supabase Auth, así que no hay nada que resolver vía
// supabase.auth.getUser() como hace createAuditLog().
//
// Requiere policy de INSERT para anon en audit_log con
// WITH CHECK (usuario_id IS NULL) — sin esa policy el insert
// devuelve 401 y esta función lo absorbe silenciosamente (best-effort).
export async function createAuditLogVecino({
  accion, entidad, entidadId, descripcion, municipioId, vecinoId, metadata,
} = {}) {
  if (!accion) throw new Error('createAuditLogVecino: accion es requerida.')
  const { error } = await supabasePublic
    .from('audit_log')
    .insert({
      municipio_id:  municipioId ?? null,
      usuario_id:    null,
      accion,
      entidad:       entidad ?? null,
      entidad_id:    entidadId == null ? null : String(entidadId),
      descripcion:   descripcion ?? null,
      datos_despues: { actor: 'vecino', vecino_id: vecinoId ?? null, ...(metadata ?? {}) },
    })
  if (error) {
    if (/relation .*audit_log.*does not exist/i.test(error.message ?? '')) return
    console.warn('[useAuditLog] createAuditLogVecino error:', error.message)
    throw error
  }
}

// =============================================================
// registrarAcceso — punto único de escritura para login/logout.
//
// Unifica el REGISTRO, no el acceso: /login, /acceso y /portal/acceso
// siguen siendo tres páginas separadas para tres audiencias distintas.
// Cada una llama a esta función con su propio `via` justo después de
// autenticarse (o justo antes de cerrar sesión) — nunca se llama sola
// desde acá.
//
//   via: 'login_staff'   → /login
//        'acceso'        → /acceso (unificado, rama vecino o empleado)
//        'portal_acceso' → /portal/acceso (VecinoAcceso.jsx)
//
// A propósito NO depende de que exista una fila en `usuarios`: si
// signInWithPassword() devolvió un user, la persona SE AUTENTICÓ, y
// eso es lo que este registro certifica — no si además tiene perfil
// de staff. Por eso el caller nunca espera a fetchPerfil() para
// llamar a esto (ver AuthContext.signIn de versiones anteriores, que
// sí lo hacía y por eso perdía logins reales sin dejar rastro).
//
// SIN SELECTs propios para resolver municipio_id (versión anterior
// consultaba `usuarios` acá adentro — un vecino puro no tiene fila
// ahí, así que esa consulta devolvía null y la fila quedaba con
// municipio_id NULL, invisible para cualquier admin_comuna porque
// Auditoria.jsx filtra con .eq('municipio_id', ...). Una query más que
// puede fallar/devolver vacío en silencio es exactamente el tipo de
// pieza que este sprint vino a sacar, no a sumar).
//
//   municipioId — responsabilidad del caller. Sale del SUBDOMINIO por
//   el que la persona entró, no de si tiene fila en `usuarios` o en
//   `vecinos`. Quien se loguea en realsayana.comunas.lat está entrando
//   al tenant de Real Sayana siempre, tenga o no perfil de staff. Cada
//   página ya tiene una fuente para esto (usePortalMunicipioId en las
//   tres, o perfil.municipio_id ya cargado en los dos logout).
//
//   usuarioId — FK a usuarios.id (coincide con el auth uid para
//   staff). A DIFERENCIA de municipioId, ESTE si se valida acá adentro
//   contra la sesión viva (ver más abajo) — no es responsabilidad del
//   caller acertarlo, es un guardrail estructural.
//
// Si municipioId llega null/undefined, es un bug de armado en el
// caller (no un caso válido) — se grita por consola en vez de dejar
// que la fila desaparezca sola detrás de un filtro, pero el insert
// sigue adelante igual: un fallo de auditoría no puede tumbar un
// login o un logout que ya ocurrió de verdad.
//
// GUARDRAIL DE usuarioId CONTRA LA SESIÓN VIVA (caso real, 2026-08-06):
// AuthContext.signOut() armaba `usuarioId: perfil?.id` desde React
// state. Ese estado se actualiza en un setTimeout(0) disparado por
// onAuthStateChange (ver el comentario de la zona frágil en
// AuthContext.jsx) — hay una ventana real, entre un signInWithPassword()
// de OTRA persona y que ese setTimeout corra, donde `perfil` sigue
// siendo el de la sesión ANTERIOR mientras la sesión de Supabase Auth
// ya cambió. Caso real: vecino.demo entra por /login, la app lo
// rechaza (sin fila en `usuarios`) y llama signOut() — pero `perfil`
// todavía era el de Enrique (login previo en la misma pestaña). El
// insert intentó usuario_id = Enrique con la sesión de vecino.demo ya
// activa, y la policy audit_insert_staff (usuario_id = auth.uid())
// lo rechazó con 42501 -- la RLS hizo bien su trabajo, pero significa
// que ningún caller puede confiar en su propio estado para esto.
//
// Por eso acá adentro, si viene `usuarioId`, se confirma contra
// supabase.auth.getSession() (lee la sesión ya en memoria, sin viaje de
// red) ANTES de usarlo. Si no coincide con el uid de la sesión viva,
// se descarta -- la fila sigue escribiéndose (con `usuario_id: null`),
// nunca se pierde el evento por esto. El resultado: una identidad
// desactualizada no puede producir una fila con la persona equivocada,
// ni con la correcta tampoco -- directamente no puede escribir nada en
// usuario_id salvo que coincida.
//
// Si el INSERT en sí falla, NUNCA queda en un catch mudo — se ve en
// consola con un tag identificable. Tampoco se relanza.
// =============================================================
export async function registrarAcceso({ resultado, via, userId, email, municipioId, usuarioId, motivo } = {}) {
  if (!resultado) throw new Error('registrarAcceso: resultado es requerido.')
  if (!via) throw new Error('registrarAcceso: via es requerida.')
  if (!userId) throw new Error('registrarAcceso: userId es requerido.')

  if (municipioId == null) {
    console.error('[useAuditLog] registrarAcceso: municipioId llegó null/undefined -- revisar el caller', { via, userId })
  }

  const accion = resultado === 'logout' ? 'LOGOUT'
    : resultado === 'rechazado' ? 'LOGIN_RECHAZADO'
    : 'LOGIN'

  let usuarioIdFinal = null
  if (usuarioId != null) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.id === usuarioId) {
      usuarioIdFinal = usuarioId
    } else {
      console.error('[useAuditLog] registrarAcceso: usuarioId no coincide con la sesión viva -- se descarta para no atribuir la fila a la persona equivocada', {
        usuarioIdPasado: usuarioId,
        sesionViva: session?.user?.id ?? null,
        via,
      })
    }
  }

  const descripcion = accion === 'LOGOUT'
    ? `Cierre de sesión — ${email ?? userId}`
    : accion === 'LOGIN_RECHAZADO'
    ? `Login rechazado — ${email ?? userId}${motivo ? ` (${motivo})` : ''}`
    : `Inicio de sesión — ${email ?? userId}`

  const { error } = await supabase
    .from('audit_log')
    .insert({
      municipio_id: municipioId ?? null,
      usuario_id: usuarioIdFinal,
      accion,
      entidad: 'auth',
      entidad_id: userId,
      descripcion,
      datos_despues: {
        via,
        email: email ?? null,
        auth_user_id: userId,
        ...(motivo ? { motivo } : {}),
        // Red de contención de la carrera con usePortalMunicipioId: si
        // esta fila termina con municipio_id null (query de municipio
        // sin resolver todavía en el momento del submit), el hostname
        // sigue siendo atribuible a un tenant a simple vista. Síncrono
        // y sin ninguna carrera propia -- window.location.hostname ya
        // está resuelto en el momento en que el componente ejecuta esto.
        hostname: typeof window !== 'undefined' ? window.location.hostname : null,
        timestamp: new Date().toISOString(),
      },
    })
  if (error) {
    console.error('[useAuditLog] registrarAcceso falló:', { accion, via, userId, error: error.message })
  }
}

// =============================================================
// registrarIntentoFallido — dispara la función de Vercel que anota un
// LOGIN_FALLIDO (api/registrar-intento-fallido.js). Nunca se llama con
// `await` desde las páginas: el usuario tiene que ver "Email o
// contraseña incorrectos" al instante, no esperar a que esto termine.
//
// Por qué es una función de Vercel y no un insert directo de acá: un
// login fallido no genera sesión, así que el insert saldría con la
// anon key sin token -- es decir, como el rol `anon`. Y a `anon` se le
// revocó INSERT en todas las tablas de public (sprint de cierre de
// escritura anónima), audit_log incluida. Además esa función es la
// única pieza que ve la IP real y el Host, que le dan sentido a la fila.
//
// Nunca manda la contraseña -- ni falta que hace, el servidor no la
// necesita para registrar que el intento falló.
// =============================================================
export function registrarIntentoFallido({ email, via }) {
  fetch('/api/registrar-intento-fallido', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, via }),
  }).catch(e => console.warn('[useAuditLog] registrarIntentoFallido:', e.message))
}
