import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createAuditLog } from './useAuditLog'

// =============================================================
// useVinculosFamiliaresAdmin — bandeja de aprobación del ERP.
//
// ⚠️ SIN VERIFICAR EN VIVO: no hay ninguna RPC de listado para staff
// en la especificación que dio el cliente (mis_vinculos_familiares()
// es vecino-only, resuelve por current_vecino_id()). Para la bandeja
// leo la tabla directo -- asumí que se llama `vinculos_familiares`
// (singular "vinculo", igual que el nombre de las RPCs
// solicitar_vinculo_familiar/aprobar_vinculo_familiar), NO
// `vecinos_familiares` como se llamaba en la migración vieja que
// nunca corrió. Si el nombre real es otro, esta query va a fallar
// con 42P01 apenas se pruebe -- visible de inmediato, no en silencio.
// Mismo supuesto para las columnas del select de abajo.
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
    vinculo_id:   vinculoId,
    puede_ver_hc: puedeVerHc,
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
    vinculo_id: vinculoId,
    motivo,
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
