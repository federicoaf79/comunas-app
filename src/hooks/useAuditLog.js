import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveMunicipioId } from './useEffectiveMunicipioId'

// =============================================================
// useAuditLog — lectura y registro del log de auditoría.
//
// Schema: ver migration 20260514_audit_log.sql
//   audit_log (id, municipio_id, actor_id, actor_email, accion,
//     entidad, entidad_id, descripcion, metadata, ip, user_agent,
//     created_at)
//
// Acciones soportadas (texto libre, este conjunto es el que la
// UI sabe pintar con badges):
//   login | logout | create | update | approve | reject |
//   delete | export | access
// =============================================================

const COLS = `
  id, municipio_id, actor_id, actor_email, accion, entidad,
  entidad_id, descripcion, metadata, ip, user_agent, created_at,
  actor:actor_id ( id, nombre, email )
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
  if (actorId)     q = q.eq('actor_id', actorId)
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
  const municipioId = useEffectiveMunicipioId()
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
// actor_id distintos con login hoy). Usa la misma RLS que el log.
export function useAccesosHoy() {
  const { perfil } = useAuth()
  const municipioId = useEffectiveMunicipioId()
  return useQuery({
    queryKey: ['audit-accesos-hoy', municipioId ?? '__ALL__'],
    queryFn: async () => {
      const today = new Date()
      const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      let q = supabase
        .from('audit_log')
        .select('actor_id, created_at')
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
      const distinct = new Set(rows.map(r => r.actor_id).filter(Boolean))
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
  const municipioId = useEffectiveMunicipioId()
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
  accion, entidad, entidadId, descripcion, metadata,
} = {}) {
  if (!accion) throw new Error('createAuditLog: accion es requerida.')
  const { data: { user } = {} } = await supabase.auth.getUser()
  if (!user) throw new Error('createAuditLog: sin sesión activa.')
  // Resolvemos email + municipio_id del usuario para snapshot.
  let actor_email = user.email ?? null
  let municipio_id = null
  try {
    const { data: row } = await supabase
      .from('usuarios')
      .select('email, municipio_id')
      .eq('id', user.id)
      .maybeSingle()
    if (row?.email) actor_email = row.email
    municipio_id = row?.municipio_id ?? null
  } catch { /* falla silenciosa — seguimos con lo que tenemos */ }
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : null
  const { error } = await supabase
    .from('audit_log')
    .insert({
      municipio_id,
      actor_id:    user.id,
      actor_email,
      accion,
      entidad:     entidad ?? null,
      entidad_id:  entidadId == null ? null : String(entidadId),
      descripcion: descripcion ?? null,
      metadata:    metadata ?? {},
      user_agent:  ua,
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
