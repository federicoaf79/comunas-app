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
        .eq('accion', 'login')
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
        .eq('accion', 'login')
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
// usuario_id es FK a usuarios.id, que para cuentas de staff coincide
// con el auth uid pero un vecino puro no tiene fila ahí — insertar su
// auth uid como usuario_id rompería con violación de FK (mismo motivo
// que createAuditLogVecino más arriba). Por eso se confirma antes: si
// no hay fila en `usuarios`, usuario_id queda null y la identidad real
// vive en datos_despues.auth_user_id.
//
// Si el INSERT falla, NUNCA queda en un catch mudo — se ve en consola
// con un tag identificable. Tampoco se relanza: un fallo de auditoría
// no puede tumbar un login o un logout que ya ocurrió de verdad.
// =============================================================
export async function registrarAcceso({ resultado, via, userId, email } = {}) {
  if (!resultado) throw new Error('registrarAcceso: resultado es requerido.')
  if (!via) throw new Error('registrarAcceso: via es requerida.')
  if (!userId) throw new Error('registrarAcceso: userId es requerido.')

  const accion = resultado === 'logout' ? 'LOGOUT' : 'LOGIN'

  let municipio_id = null
  let usuarioIdFk = null
  try {
    const { data: row } = await supabase
      .from('usuarios')
      .select('id, municipio_id')
      .eq('id', userId)
      .maybeSingle()
    if (row) {
      usuarioIdFk = row.id
      municipio_id = row.municipio_id ?? null
    }
  } catch { /* seguimos con usuario_id/municipio_id en null -- la identidad real queda en datos_despues */ }

  const { error } = await supabase
    .from('audit_log')
    .insert({
      municipio_id,
      usuario_id: usuarioIdFk,
      accion,
      entidad: 'auth',
      entidad_id: userId,
      descripcion: accion === 'LOGOUT'
        ? `Cierre de sesión — ${email ?? userId}`
        : `Inicio de sesión — ${email ?? userId}`,
      datos_despues: {
        via,
        email: email ?? null,
        auth_user_id: userId,
        timestamp: new Date().toISOString(),
      },
    })
  if (error) {
    console.error('[useAuditLog] registrarAcceso falló:', { accion, via, userId, error: error.message })
  }
}
