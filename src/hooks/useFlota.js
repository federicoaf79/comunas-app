import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useFlota — vehículos, combustible y service
//
// Schema asumido (existente en Supabase):
//   vehiculos          (id, municipio_id, dependencia_id, patente,
//                       marca, modelo, anio, tipo, km_actuales,
//                       estado, seguro_vencimiento, vtv_vencimiento,
//                       observaciones, created_at)
//   combustible_log    (id, vehiculo_id, fecha, litros, km_al_cargar,
//                       tipo_combustible, costo_total, proveedor)
//   service_vehiculos  (id, vehiculo_id, fecha, tipo_service,
//                       descripcion, km_al_service, proximo_service_km,
//                       costo, taller)
// =============================================================

const TIMEOUT_MS = 8000

const VEH_COLS = `
  id, municipio_id, dependencia_id, patente, marca, modelo, anio,
  tipo, km_actuales, estado, seguro_vencimiento, vtv_vencimiento,
  observaciones, created_at,
  dependencia:dependencia_id ( id, nombre )
`
const COMB_COLS = `
  id, vehiculo_id, fecha, litros, km_al_cargar, tipo_combustible,
  costo_total, proveedor,
  vehiculo:vehiculo_id ( id, patente, marca, modelo )
`
const SERV_COLS = `
  id, vehiculo_id, fecha, tipo_service, descripcion, km_al_service,
  proximo_service_km, costo, taller,
  vehiculo:vehiculo_id ( id, patente, marca, modelo )
`

function withTimeout() {
  const c = new AbortController()
  const id = setTimeout(() => c.abort(), TIMEOUT_MS)
  return { signal: c.signal, clear: () => clearTimeout(id) }
}

// ─────────────────────────────────────────────────────────────────
// Vehículos
// ─────────────────────────────────────────────────────────────────

async function fetchVehiculos({ municipioId, dependenciaId } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase.from('vehiculos').select(VEH_COLS)
      .order('patente', { ascending: true })
      .abortSignal(signal)
    if (municipioId)   q = q.eq('municipio_id',   municipioId)
    if (dependenciaId) q = q.eq('dependencia_id', dependenciaId)
    const { data, error } = await q
    clear()
    if (error) throw error
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function useVehiculos(filters = {}, { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['vehiculos', municipioId ?? '__ALL__', filters.dependenciaId ?? ''],
    queryFn:  () => fetchVehiculos({ municipioId, ...filters }),
    enabled:  !!perfil,
  })
}

// ─────────────────────────────────────────────────────────────────
// Combustible
// ─────────────────────────────────────────────────────────────────

async function fetchCombustibleLog({ vehiculoId, vehiculoIds, limit = 30 } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase.from('combustible_log').select(COMB_COLS)
      .order('fecha', { ascending: false })
      .limit(limit)
      .abortSignal(signal)
    if (vehiculoId)        q = q.eq('vehiculo_id', vehiculoId)
    else if (vehiculoIds)  q = q.in('vehiculo_id', vehiculoIds)
    const { data, error } = await q
    clear()
    if (error) throw error
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

// Usamos vehiculoIds (lista) cuando el usuario filtra por municipio
// y queremos restringir el log a la flota de ese municipio sin tocar
// la tabla combustible_log que no tiene municipio_id.
export function useCombustibleLog({ vehiculoId, vehiculoIds, limit } = {}) {
  return useQuery({
    queryKey: ['combustible-log', vehiculoId ?? '', (vehiculoIds ?? []).join(','), limit ?? 30],
    queryFn:  () => fetchCombustibleLog({ vehiculoId, vehiculoIds, limit }),
    enabled:  vehiculoId ? true : Array.isArray(vehiculoIds),
  })
}

// ─────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────

async function fetchServiceVehiculos({ vehiculoId, vehiculoIds, limit = 50 } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase.from('service_vehiculos').select(SERV_COLS)
      .order('fecha', { ascending: false })
      .limit(limit)
      .abortSignal(signal)
    if (vehiculoId)        q = q.eq('vehiculo_id', vehiculoId)
    else if (vehiculoIds)  q = q.in('vehiculo_id', vehiculoIds)
    const { data, error } = await q
    clear()
    if (error) throw error
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function useServiceVehiculos({ vehiculoId, vehiculoIds, limit } = {}) {
  return useQuery({
    queryKey: ['service-vehiculos', vehiculoId ?? '', (vehiculoIds ?? []).join(','), limit ?? 50],
    queryFn:  () => fetchServiceVehiculos({ vehiculoId, vehiculoIds, limit }),
    enabled:  vehiculoId ? true : Array.isArray(vehiculoIds),
  })
}

// ─────────────────────────────────────────────────────────────────
// Mutaciones
// ─────────────────────────────────────────────────────────────────

async function createVehiculo(data) {
  const { data: row, error } = await supabase
    .from('vehiculos').insert(data).select(VEH_COLS).single()
  if (error) throw error
  return row
}

// Crea la carga y, si km_al_cargar > km_actuales del vehículo,
// actualiza el vehículo. El UPDATE adicional no se aborta si falla —
// la carga ya quedó registrada y el operador puede ajustar km a mano.
async function createCombustible(data) {
  const { data: row, error } = await supabase
    .from('combustible_log').insert(data).select(COMB_COLS).single()
  if (error) throw error
  if (data.km_al_cargar) {
    await maybeBumpKm(data.vehiculo_id, Number(data.km_al_cargar))
  }
  return row
}

async function createService(data) {
  const { data: row, error } = await supabase
    .from('service_vehiculos').insert(data).select(SERV_COLS).single()
  if (error) throw error
  if (data.km_al_service) {
    await maybeBumpKm(data.vehiculo_id, Number(data.km_al_service))
  }
  return row
}

async function maybeBumpKm(vehiculoId, candidato) {
  const { data: v, error } = await supabase
    .from('vehiculos').select('id, km_actuales').eq('id', vehiculoId).single()
  if (error || !v) return
  if (Number(v.km_actuales ?? 0) >= candidato) return
  const { error: upErr } = await supabase
    .from('vehiculos').update({ km_actuales: candidato }).eq('id', vehiculoId)
  if (upErr) console.warn('[useFlota] bump km falló:', upErr.message)
}

async function updateVehiculoKm({ id, km }) {
  const { error } = await supabase
    .from('vehiculos').update({ km_actuales: km }).eq('id', id)
  if (error) throw error
}

export function useCreateVehiculo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createVehiculo,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['vehiculos'] }),
  })
}
export function useCreateCombustible() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createCombustible,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['combustible-log'] })
      qc.invalidateQueries({ queryKey: ['vehiculos'] })
    },
  })
}
export function useCreateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createService,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['service-vehiculos'] })
      qc.invalidateQueries({ queryKey: ['vehiculos'] })
    },
  })
}
export function useUpdateVehiculoKm() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateVehiculoKm,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['vehiculos'] }),
  })
}

// ─────────────────────────────────────────────────────────────────
// Helpers de presentación / alertas
// ─────────────────────────────────────────────────────────────────

export const TIPOS_VEHICULO = [
  { value: 'camioneta',   label: 'Camioneta' },
  { value: 'tractor',     label: 'Tractor' },
  { value: 'auto',        label: 'Auto' },
  { value: 'moto',        label: 'Moto' },
  { value: 'utilitario',  label: 'Utilitario' },
  { value: 'maquinaria',  label: 'Maquinaria' },
  { value: 'otro',        label: 'Otro' },
]

export const ESTADOS_VEHICULO = [
  { value: 'operativo',          label: 'Operativo' },
  { value: 'en_service',         label: 'En service' },
  { value: 'fuera_de_servicio',  label: 'Fuera de servicio' },
]

export const TIPOS_COMBUSTIBLE = [
  { value: 'nafta',  label: 'Nafta' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'gnc',    label: 'GNC' },
]

export const TIPOS_SERVICE = [
  { value: 'aceite',           label: 'Aceite' },
  { value: 'frenos',           label: 'Frenos' },
  { value: 'neumaticos',       label: 'Neumáticos' },
  { value: 'revision_general', label: 'Revisión general' },
  { value: 'otro',             label: 'Otro' },
]

// Días que faltan para `iso` desde hoy (negativo si vencido).
export function diasParaVencer(iso) {
  if (!iso) return null
  const target = new Date(iso)
  const today  = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
