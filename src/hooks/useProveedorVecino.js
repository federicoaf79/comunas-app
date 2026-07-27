import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { createAuditLogVecino } from './useAuditLog'

// Auditoría best-effort: nunca bloquea la mutación real si falla -- el
// vale/dispositivo ya se procesó del lado del server, un error de log no
// puede hacerle creer al vecino/comerciante que la operación falló. Mismo
// criterio que turnos_agenda/beneficiarios/reclamos (Fase 3 del sprint de
// auditoría): usuario_id siempre null acá, quien ejecuta es un vecino, no
// staff (audit_log.usuario_id tiene FK a `usuarios`).
function logAuditVecino(args) {
  createAuditLogVecino(args).catch(e => console.warn('[useProveedorVecino] audit log:', e.message))
}

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
//   - Desde 2026-07-27: vincular y desvincular un teléfono son
//     acciones EXCLUSIVAS del responsable del comercio (desvincular
//     también staff). Un secundario nunca da de alta ni de baja
//     teléfonos -- puede canjear, pero el circuito de "qué celular
//     puede operar acá" lo controla siempre el dueño.
// =============================================================

// `rol` vuelve a seleccionarse -- hace falta para decidir qué OFRECER
// en la UI de vincular/desvincular (solo el responsable puede hacer
// las dos cosas desde 2026-07-27). Sigue sin ser control de acceso:
// el server (vincular_dispositivo/desvincular_dispositivo) es la
// autoridad real y rechaza igual a un secundario aunque el cliente
// mienta. Lo que SÍ sigue sin usar `rol` es historial_canjes_proveedor
// -- ahí qué columnas vienen lo decide el server por su cuenta, nunca
// se lo preguntamos (ver esa función más abajo).
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

async function vincularDispositivo({ deviceId, proveedorId, alias, proveedorNombre, vecinoId, municipioId }) {
  const { data, error } = await supabase.rpc('vincular_dispositivo', {
    p_device_id: deviceId,
    p_proveedor_id: proveedorId,
    p_alias: alias ?? null,
  })
  if (error) throw error
  logAuditVecino({
    accion: 'update', entidad: 'proveedor_dispositivos', entidadId: deviceId,
    descripcion: `Teléfono vinculado a ${proveedorNombre ?? proveedorId ?? 'comercio'}`,
    municipioId, vecinoId,
    metadata: { device_id: deviceId, proveedor_id: proveedorId ?? null, alias: alias ?? null },
  })
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
// teléfono operó en qué comercio se conserva). Regla vigente desde
// 2026-07-27: solo el responsable del comercio o staff de la comuna
// puede desvincular -- ya NO alcanza con ser quien lo vinculó (eso
// dejaba a un secundario dar de baja su propio teléfono sin que el
// dueño se enterara). Un secundario no puede, aunque haya sido él
// quien lo vinculó: ese chequeo vive en el server
// (desvincular_dispositivo), no se duplica acá.
async function desvincularDispositivo({ deviceId, proveedorId, proveedorNombre, vecinoId, municipioId }) {
  const { data, error } = await supabase.rpc('desvincular_dispositivo', {
    p_device_id: deviceId,
  })
  if (error) throw error
  logAuditVecino({
    accion: 'update', entidad: 'proveedor_dispositivos', entidadId: deviceId,
    descripcion: `Teléfono desvinculado de ${proveedorNombre ?? proveedorId ?? 'comercio'}`,
    municipioId, vecinoId,
    metadata: { device_id: deviceId, proveedor_id: proveedorId ?? null },
  })
  return data
}

export function useDesvincularDispositivo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: desvincularDispositivo,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedor', 'dispositivo'] }),
  })
}

// Preview de un vale por código -- ANTES de canjear. Vía RPC
// (preview_vale), no un SELECT directo: un SELECT con embed a
// vecino_id devuelve null para un comerciante real, que no tiene
// permiso de SELECT sobre la fila de OTRO vecino -- por eso la RPC
// es SECURITY DEFINER y arma el jsonb del lado del server, sin abrir
// la tabla `vecinos` (PII) a comerciantes.
//
// Formas del jsonb devuelto:
//   - normal (mismo comercio vinculado): es_otro_comercio=false +
//     codigo/estado/descripcion/monto/cantidad/unidad/
//     vence_apertura_en/canjeado_en/proveedor_nombre/vecino_nombre/
//     vecino_dni
//   - vale de OTRO comercio del MISMO dueño: es_otro_comercio=true +
//     proveedor_nombre -- sin datos del vale ni del vecino
//   - vale de un comercio ajeno: la RPC tira 'Vale no encontrado',
//     igual que un código inexistente -- no confirma que exista
export async function fetchValePorCodigo(codigo, deviceId) {
  if (!codigo) return null
  const { data, error } = await supabase.rpc('preview_vale', {
    p_codigo: codigo,
    p_device_id: deviceId,
  })
  if (error) throw error
  return data
}

async function canjearVale({ codigo, deviceId, proveedorId, proveedorNombre, vecinoId, municipioId }) {
  const { data, error } = await supabase.rpc('canjear_vale', {
    p_codigo: codigo,
    p_device_id: deviceId,
  })
  if (error) throw error
  logAuditVecino({
    accion: 'update', entidad: 'vales', entidadId: data?.id ?? codigo,
    descripcion: `Vale canjeado — ${data?.codigo ?? codigo} en ${proveedorNombre ?? proveedorId ?? 'comercio'}`,
    municipioId, vecinoId,
    metadata: {
      codigo: data?.codigo ?? codigo,
      proveedor_id: data?.proveedor_id ?? proveedorId ?? null,
      proveedor_nombre: proveedorNombre ?? null,
      monto: data?.monto ?? null,
      cantidad: data?.cantidad ?? null,
      unidad: data?.unidad ?? null,
    },
  })
  return data
}

export function useCanjearVale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: canjearVale,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedor'] }),
  })
}

// Historial de canjes de UN comercio -- Fase 4 parte 2. Vía RPC
// (historial_canjes_proveedor), no un SELECT directo: la policy
// vales_proveedor_select_ventana ya no deja a un secundario ver vales
// 'canjeado' por consulta directa (RLS filtra filas, no columnas) --
// un SELECT acá le devolvería [] en silencio a cualquier secundario,
// sin error (mismo modo de falla ya visto con el "Vecino: —" de
// preview_vale en Fase 3).
//
// La RPC (SECURITY DEFINER) decide QUÉ COLUMNAS devolver según el rol
// real de quien llama para ESE proveedor_id -- responsable ve el
// detalle completo (codigo, canjeado_en, estado, descripcion, monto,
// cantidad, unidad, vecino_nombre, vecino_dni, canjeado_por);
// secundario ve solo codigo, canjeado_en, estado. Nunca se le pide el
// rol al cliente: el componente detecta qué vino por presencia de
// campo en la fila (ver Proveedor.jsx), no reimplementa la regla.
//
// Motivo de producto: que el teléfono de un empleado (secundario) no
// termine acumulando un padrón de quién recibe ayuda social en el
// pueblo y por cuánto -- el dato pasa por sus manos para operar el
// canje, no se le queda después. Ya viene ordenado por canjeado_en
// descendente; nunca devuelve null, `[]` si no hay canjes.
async function fetchHistorialCanjesProveedor(proveedorId) {
  if (!proveedorId) return []
  const { data, error } = await supabase.rpc('historial_canjes_proveedor', {
    p_proveedor_id: proveedorId,
  })
  if (error) throw error
  return data ?? []
}

export function useHistorialCanjesProveedor(proveedorId) {
  return useQuery({
    queryKey: ['proveedor', 'historial-canjes', proveedorId ?? '__none__'],
    queryFn:  () => fetchHistorialCanjesProveedor(proveedorId),
    enabled:  !!proveedorId,
  })
}
