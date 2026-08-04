import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// =============================================================
// useVinculosFamiliares — Módulo Familia (portal del vecino).
//
// Las 6 RPCs (solicitar/mis_vinculos/revocar/aprobar/rechazar/
// historia_clinica_familiar) son SECURITY DEFINER y resuelven
// identidad por current_vecino_id() del lado del servidor -- este
// hook siempre usa el cliente autenticado `supabase`, nunca
// supabaseAnon (mismo criterio que useValesVecino.js).
//
// OJO -- nombres de parámetro SIN VERIFICAR EN VIVO todavía: no tuve
// sesión de browser disponible para confirmarlos contra prod antes de
// escribir esto. Uso los nombres tal como los pasó el cliente
// (parentesco, familiar_dni, vinculo_id, etc., sin prefijo p_, a
// diferencia de abrir_vale/canjear_vale que sí lo usan). Si Postgres
// espera otro nombre, PostgREST devuelve un error explícito
// (function not found / parámetro inesperado) -- no falla en
// silencio, se detecta apenas se pruebe.
// =============================================================

async function fetchVinculosFamiliares() {
  const { data, error } = await supabase.rpc('mis_vinculos_familiares')
  if (error) throw error
  return data ?? { gestiono: [], me_gestionan: [] }
}

export function useVinculosFamiliares(ready = true) {
  return useQuery({
    queryKey: ['vecino', 'vinculos-familiares'],
    queryFn:  fetchVinculosFamiliares,
    enabled:  ready,
  })
}

async function solicitarVinculoFamiliar({ parentesco, familiar_dni, familiar_nombre, familiar_fecha_nac, dj_version }) {
  const { data, error } = await supabase.rpc('solicitar_vinculo_familiar', {
    parentesco,
    familiar_dni,
    familiar_nombre,
    familiar_fecha_nac,
    dj_version,
  })
  if (error) throw error
  return data
}

export function useSolicitarVinculoFamiliar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: solicitarVinculoFamiliar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vecino', 'vinculos-familiares'] }),
  })
}

async function revocarVinculoFamiliar(vinculoId) {
  const { data, error } = await supabase.rpc('revocar_vinculo_familiar', { vinculo_id: vinculoId })
  if (error) throw error
  return data
}

export function useRevocarVinculoFamiliar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: revocarVinculoFamiliar,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vecino', 'vinculos-familiares'] }),
  })
}

async function fetchHistoriaClinicaFamiliar(familiarId) {
  if (!familiarId) return []
  const { data, error } = await supabase.rpc('historia_clinica_familiar', { familiar_id: familiarId })
  if (error) throw error
  return data ?? []
}

export function useHistoriaClinicaFamiliar(familiarId, enabled = true) {
  return useQuery({
    queryKey: ['vecino', 'hc-familiar', familiarId ?? '__none__'],
    queryFn:  () => fetchHistoriaClinicaFamiliar(familiarId),
    enabled:  !!familiarId && enabled,
  })
}

// Versión de la declaración jurada vigente -- se manda a
// solicitar_vinculo_familiar() para que quede registrado qué texto
// aceptó el titular. Subir este string el día que cambie el texto
// real (todavía placeholder, lo escribe el cliente).
export const DJ_VERSION_ACTUAL = 'v1'

// Placeholder -- el texto final lo escribe el cliente. No hace falta
// tocar el resto del componente cuando llegue: solo reemplazar este
// string y, si corresponde, DJ_LINK_HREF.
export const DJ_TEXTO_PLACEHOLDER =
  'Declaro bajo juramento que me hago responsable de la gestión, las comunicaciones y los turnos de esta persona ante la Comisión Municipal.'
export const DJ_LINK_HREF  = '#'
export const DJ_LINK_LABEL = 'Ver las reglas completas'
