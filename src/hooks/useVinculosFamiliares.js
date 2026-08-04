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
// Nombres de parámetro verificados contra la firma real en prod
// (2026-08-04, pg_get_functiondef) -- todos con prefijo p_, mismo
// criterio que abrir_vale/canjear_vale/preview_vale. La primera
// versión de este archivo NO tenía el prefijo y falló en vivo con
// "Could not find the function ... in the schema cache" al probar
// solicitar_vinculo_familiar -- por eso, de acá en más, verificar la
// firma ANTES de escribir el hook, no dejarlo para que falle en la
// verificación en vivo.
// =============================================================

async function fetchVinculosFamiliares() {
  const { data, error } = await supabase.rpc('mis_vinculos_familiares')
  if (error) throw error
  return data ?? { gestiono: [], me_gestionan: [] }
}

export function useVinculosFamiliares(vecinoId, ready = true) {
  return useQuery({
    // vecinoId no viaja a la RPC (resuelve identidad por
    // current_vecino_id() del lado del server, como el resto del
    // módulo) -- va en la key SOLO para que el cache de React Query no
    // pueda confundir los vínculos de un vecino con los del anterior
    // si la sesión cambia sin un reload completo de página. Mismo
    // criterio que ['vecino','vales', vecinoId] en useValesVecino.js.
    queryKey: ['vecino', 'vinculos-familiares', vecinoId ?? '__none__'],
    queryFn:  fetchVinculosFamiliares,
    enabled:  !!vecinoId && ready,
  })
}

async function solicitarVinculoFamiliar({ parentesco, familiar_dni, familiar_nombre, familiar_fecha_nac, dj_version }) {
  const { data, error } = await supabase.rpc('solicitar_vinculo_familiar', {
    p_parentesco: parentesco,
    p_familiar_dni: familiar_dni,
    p_familiar_nombre: familiar_nombre,
    p_familiar_fecha_nac: familiar_fecha_nac,
    p_dj_version: dj_version,
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
  const { data, error } = await supabase.rpc('revocar_vinculo_familiar', { p_vinculo_id: vinculoId })
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
  const { data, error } = await supabase.rpc('historia_clinica_familiar', { p_familiar_id: familiarId })
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
