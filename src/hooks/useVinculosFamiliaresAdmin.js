import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createAuditLog } from './useAuditLog'

// =============================================================
// useVinculosFamiliaresAdmin — bandeja de aprobación del ERP.
//
// La tabla `vinculos_familiares` (verificada en vivo 2026-08-04,
// mis_vinculos_familiares/solicitar_vinculo_familiar corriendo contra
// prod) -- no `vecinos_familiares`, que era el nombre de la migración
// vieja que nunca corrió. Para la bandeja se lee la tabla directo
// porque no hay RPC de listado para staff (mis_vinculos_familiares()
// es vecino-only, resuelve por current_vecino_id()).
//
// aprobar_vinculo_familiar/rechazar_vinculo_familiar -- nombres de
// parámetro verificados contra la firma real en prod (pg_get_functiondef,
// 2026-08-04): p_vinculo_id, p_puede_ver_hc, p_motivo, todos con
// prefijo p_, mismo criterio que abrir_vale/canjear_vale.
// =============================================================

const VINCULO_ADMIN_COLS = `
  id, municipio_id, parentesco, estado, puede_ver_hc,
  familiar_id, familiar_dni, familiar_nombre, familiar_fecha_nac,
  dj_version, dj_aceptada_en, motivo_rechazo, created_at,
  titular:titular_id ( id, nombre_completo, dni ),
  familiar:familiar_id ( id, nombre_completo, dni )
`

async function fetchVinculosPendientes(municipioId) {
  if (!municipioId) return []
  const { data, error } = await supabase
    .from('vinculos_familiares')
    .select(VINCULO_ADMIN_COLS)
    .eq('municipio_id', municipioId)
    .in('estado', ['pendiente', 'revision_mayoria_edad'])
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export function useVinculosFamiliaresPendientes(municipioId) {
  return useQuery({
    queryKey: ['admin', 'vinculos-familiares-pendientes', municipioId ?? '__none__'],
    queryFn:  () => fetchVinculosPendientes(municipioId),
    enabled:  !!municipioId,
  })
}

async function aprobarVinculo({ vinculoId, puedeVerHc, titularNombre, familiarNombre }) {
  const { data, error } = await supabase.rpc('aprobar_vinculo_familiar', {
    p_vinculo_id:   vinculoId,
    p_puede_ver_hc: puedeVerHc,
  })
  if (error) throw error
  await createAuditLog({
    accion: 'update', entidad: 'vinculos_familiares', entidadId: vinculoId,
    descripcion: `Vínculo familiar aprobado — ${titularNombre ?? vinculoId} → ${familiarNombre ?? ''} (HC: ${puedeVerHc ? 'sí' : 'no'})`,
  }).catch(e => console.warn('[useVinculosFamiliaresAdmin] audit log:', e.message))
  return data
}

export function useAprobarVinculoFamiliar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: aprobarVinculo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vinculos-familiares-pendientes'] }),
  })
}

async function rechazarVinculo({ vinculoId, motivo, titularNombre, familiarNombre }) {
  const { data, error } = await supabase.rpc('rechazar_vinculo_familiar', {
    p_vinculo_id: vinculoId,
    p_motivo: motivo,
  })
  if (error) throw error
  await createAuditLog({
    accion: 'update', entidad: 'vinculos_familiares', entidadId: vinculoId,
    descripcion: `Vínculo familiar rechazado — ${titularNombre ?? vinculoId} → ${familiarNombre ?? ''} (motivo: ${motivo})`,
  }).catch(e => console.warn('[useVinculosFamiliaresAdmin] audit log:', e.message))
  return data
}

export function useRechazarVinculoFamiliar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: rechazarVinculo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'vinculos-familiares-pendientes'] }),
  })
}
