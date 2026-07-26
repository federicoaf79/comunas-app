import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// =============================================================
// useProveedorVecino — Vales Electrónicos, Fase 3 (sección Proveedor
// en la cuenta del vecino, para canjear vales).
//
// Reglas de producto centrales (ver CLAUDE.md "Vales Electrónicos"):
//   - Un vale se canjea SOLO en el comercio para el que fue emitido.
//   - Un teléfono (device_id) opera en UN SOLO comercio a la vez. El
//     dueño de varios comercios puede VER todos, pero solo CANJEAR
//     en el que su teléfono actual tiene vinculado.
//   - canjear_vale ahora recibe (p_codigo, p_device_id) -- la firma
//     vieja de un solo parámetro fue DROPEADA en prod.
//   - INSERT/UPDATE/DELETE sobre proveedor_dispositivos están
//     revocados al cliente -- vincular/desvincular van SIEMPRE por
//     RPC (vincular_dispositivo / desvincular_dispositivo).
// =============================================================

const PROVEEDOR_ACCESO_COLS = `
  id, rol, activo,
  proveedor:proveedor_id(id, nombre, categoria)
`

async function fetchAccesosVecino(vecinoId) {
  if (!vecinoId) return []
  const { data, error } = await supabase
    .from('proveedor_accesos')
    .select(PROVEEDOR_ACCESO_COLS)
    .eq('vecino_id', vecinoId)
    .eq('activo', true)
  if (error) throw error
  return data ?? []
}

// Accesos activos del vecino a comercios -- determina si la sección
// Proveedor debe existir para esta cuenta (un vecino común no tiene
// ninguna fila acá).
export function useAccesosProveedorVecino(vecinoId) {
  return useQuery({
    queryKey: ['vecino', 'proveedor-accesos', vecinoId ?? '__none__'],
    queryFn:  () => fetchAccesosVecino(vecinoId),
    enabled:  !!vecinoId,
  })
}

const DISPOSITIVO_COLS = `
  id, device_id, proveedor_id, alias, activo, vinculado_por, ultimo_uso_en,
  proveedor:proveedor_id(id, nombre, categoria)
`

async function fetchDispositivoVinculado(deviceId) {
  if (!deviceId) return null
  const { data, error } = await supabase
    .from('proveedor_dispositivos')
    .select(DISPOSITIVO_COLS)
    .eq('device_id', deviceId)
    .eq('activo', true)
    .maybeSingle()
  if (error) throw error
  return data
}

// Vinculación del dispositivo ACTUAL (este teléfono/navegador) -- a
// lo sumo una fila activa por device_id (índice único global).
export function useDispositivoVinculado(deviceId) {
  return useQuery({
    queryKey: ['proveedor', 'dispositivo', deviceId ?? '__none__'],
    queryFn:  () => fetchDispositivoVinculado(deviceId),
    enabled:  !!deviceId,
  })
}

async function vincularDispositivo({ deviceId, proveedorId, alias }) {
  const { data, error } = await supabase.rpc('vincular_dispositivo', {
    p_device_id: deviceId,
    p_proveedor_id: proveedorId,
    p_alias: alias ?? null,
  })
  if (error) throw error
  return data
}

export function useVincularDispositivo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: vincularDispositivo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedor', 'dispositivo'] }),
  })
}

// Desvincular NO borra la fila (activo=false, historial de qué
// teléfono operó en qué comercio se conserva) -- y solo lo puede
// ejecutar quien vinculó ese teléfono, o staff de la comuna. Un
// empleado cualquiera con acceso al comercio no puede: ese chequeo
// vive en el server (desvincular_dispositivo), no se duplica acá.
async function desvincularDispositivo(deviceId) {
  const { data, error } = await supabase.rpc('desvincular_dispositivo', {
    p_device_id: deviceId,
  })
  if (error) throw error
  return data
}

export function useDesvincularDispositivo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: desvincularDispositivo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedor', 'dispositivo'] }),
  })
}

// Preview de un vale por código -- ANTES de canjear. RLS
// (vales_proveedor_select_ventana) solo deja ver vales 'abierto'
// (dentro de ventana) o ya 'canjeado' de un comercio al que el
// vecino tenga proveedor_accesos activo -- cualquier otro código
// (inexistente, todavía no abierto por el beneficiario, vencido,
// quemado, o de un comercio ajeno) devuelve 0 filas, indistinguible
// de "no existe" desde acá. Eso es intencional: no hay forma honesta
// de decir más sin filtrar información que no es nuestra.
const VALE_PREVIEW_COLS = `
  id, codigo, descripcion, monto, cantidad, unidad, estado,
  emitido_en, vigencia_horas, abierto_en, vence_apertura_en, canjeado_en,
  proveedor_id,
  vecino:vecino_id(id, nombre_completo),
  proveedor:proveedor_id(id, nombre)
`

export async function fetchValePorCodigo(codigo) {
  if (!codigo) return null
  const { data, error } = await supabase
    .from('vales')
    .select(VALE_PREVIEW_COLS)
    .eq('codigo', codigo)
    .maybeSingle()
  if (error) throw error
  return data
}

async function canjearVale({ codigo, deviceId }) {
  const { data, error } = await supabase.rpc('canjear_vale', {
    p_codigo: codigo,
    p_device_id: deviceId,
  })
  if (error) throw error
  return data
}

export function useCanjearVale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: canjearVale,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedor'] }),
  })
}

// Vales canjeados de UN comercio puntual -- vista de solo lectura
// para "tus otros comercios" (el dueño ve, no opera). RLS ya scopea
// por proveedor_accesos, el filtro por proveedor_id acá es solo para
// no traer de más.
async function fetchValesCanjeadosProveedor(proveedorId) {
  if (!proveedorId) return []
  const { data, error } = await supabase
    .from('vales')
    .select(VALE_PREVIEW_COLS)
    .eq('proveedor_id', proveedorId)
    .eq('estado', 'canjeado')
    .order('canjeado_en', { ascending: false })
  if (error) throw error
  return data ?? []
}

export function useValesCanjeadosProveedor(proveedorId) {
  return useQuery({
    queryKey: ['proveedor', 'vales-canjeados', proveedorId ?? '__none__'],
    queryFn:  () => fetchValesCanjeadosProveedor(proveedorId),
    enabled:  !!proveedorId,
  })
}
