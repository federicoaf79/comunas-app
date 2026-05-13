import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useAdministracion — gastos, ingresos y presupuesto del municipio
//
// Asume el siguiente schema (ya creado en Supabase con datos):
//
//   gastos      (id, municipio_id, fecha date, descripcion, categoria,
//                dependencia_id, monto numeric, estado, comprobante_url,
//                created_at)
//   ingresos    (id, municipio_id, fecha date, descripcion, origen,
//                monto numeric, created_at)
//   presupuesto (id, municipio_id, dependencia_id, anio, monto_asignado)
//
// Todos los fetches usan AbortController de 8s y filtran por
// municipio del perfil actual (excepto superadmin que ve todo).
// =============================================================

const TIMEOUT_MS = 8000

const GASTO_COLS = `
  id, municipio_id, fecha, descripcion, categoria, dependencia_id,
  monto, estado, comprobante_url, created_at,
  dependencia:dependencia_id ( id, nombre )
`
const INGRESO_COLS = `
  id, municipio_id, fecha, descripcion, origen, monto, created_at
`
const PRESUPUESTO_COLS = `
  id, municipio_id, dependencia_id, anio, monto_asignado,
  dependencia:dependencia_id ( id, nombre )
`

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

// Convierte "YYYY-MM" en { first: 'YYYY-MM-01', next: 'YYYY-(MM+1)-01' }
// — usado para filtrar gastos/ingresos por mes.
export function monthRange(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  const first = `${y}-${String(m).padStart(2, '0')}-01`
  const ny    = m === 12 ? y + 1 : y
  const nm    = m === 12 ? 1     : m + 1
  const next  = `${ny}-${String(nm).padStart(2, '0')}-01`
  return { first, next }
}

// Mes actual como "YYYY-MM" — la app trabaja en horario local del
// usuario admin. No usamos timezone Argentina porque las fechas en
// gastos/ingresos son `date` (sin hora) y el calendario contable
// se mueve al ritmo del dispositivo del operador.
export function currentMonthYYYYMM(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

// Año actual.
export function currentYear(date = new Date()) {
  return date.getFullYear()
}

function withTimeout() {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

function rethrowAbort(e, signal, label) {
  if (signal.aborted || e?.name === 'AbortError' || /abort/i.test(e?.message ?? '')) {
    const err = new Error(`${label} timeout (${TIMEOUT_MS}ms)`)
    console.error(`[useAdministracion] ${label} timeout`)
    throw err
  }
  throw e
}

// ─────────────────────────────────────────────────────────────────
// Gastos
// ─────────────────────────────────────────────────────────────────

export async function fetchGastos({
  municipioId, mes, categoria, dependenciaId, estado, fechaFrom, fechaTo,
} = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase.from('gastos').select(GASTO_COLS).order('fecha', { ascending: false }).abortSignal(signal)
    if (municipioId)    q = q.eq('municipio_id', municipioId)
    if (categoria)      q = q.eq('categoria', categoria)
    if (dependenciaId)  q = q.eq('dependencia_id', dependenciaId)
    if (estado)         q = q.eq('estado', estado)
    if (mes) {
      const { first, next } = monthRange(mes)
      q = q.gte('fecha', first).lt('fecha', next)
    }
    if (fechaFrom) q = q.gte('fecha', fechaFrom)
    if (fechaTo)   q = q.lt('fecha', fechaTo)
    const { data, error } = await q
    clear()
    if (error) {
      console.error('[useAdministracion] fetchGastos error:', {
        message: error.message,
        details: error.details,
        hint:    error.hint,
        code:    error.code,
        filters: { municipioId, mes, categoria, dependenciaId, estado, fechaFrom, fechaTo },
      })
      throw error
    }
    return data ?? []
  } catch (e) {
    clear()
    rethrowAbort(e, signal, 'fetchGastos')
  }
}

// `municipioIdOverride` permite al caller forzar un municipio
// destino (caso superadmin con perfil.municipio_id null que cae
// a "primer municipio activo" via useEffectiveMunicipioId).
export function useGastos(filters = {}, { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: [
      'gastos',
      municipioId ?? '__ALL__',
      filters.mes           ?? '',
      filters.categoria     ?? '',
      filters.dependenciaId ?? '',
      filters.estado        ?? '',
      filters.fechaFrom     ?? '',
      filters.fechaTo       ?? '',
    ],
    queryFn: () => fetchGastos({ municipioId, ...filters }),
    enabled: !!perfil,
  })
}

export async function createGasto(data) {
  const { data: row, error } = await supabase
    .from('gastos')
    .insert({ ...data, estado: data.estado ?? 'borrador' })
    .select(GASTO_COLS)
    .single()
  if (error) {
    console.error('[useAdministracion] createGasto error:', error)
    throw error
  }
  return row
}

export async function updateGastoEstado(id, estado) {
  const { data: row, error } = await supabase
    .from('gastos')
    .update({ estado })
    .eq('id', id)
    .select(GASTO_COLS)
    .single()
  if (error) {
    console.error('[useAdministracion] updateGastoEstado error:', error)
    throw error
  }
  return row
}

// ─────────────────────────────────────────────────────────────────
// Ingresos
// ─────────────────────────────────────────────────────────────────

export async function fetchIngresos({
  municipioId, mes, fechaFrom, fechaTo,
} = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase.from('ingresos').select(INGRESO_COLS).order('fecha', { ascending: false }).abortSignal(signal)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    if (mes) {
      const { first, next } = monthRange(mes)
      q = q.gte('fecha', first).lt('fecha', next)
    }
    if (fechaFrom) q = q.gte('fecha', fechaFrom)
    if (fechaTo)   q = q.lt('fecha', fechaTo)
    const { data, error } = await q
    clear()
    if (error) {
      console.error('[useAdministracion] fetchIngresos error:', {
        message: error.message,
        details: error.details,
        hint:    error.hint,
        code:    error.code,
        filters: { municipioId, mes, fechaFrom, fechaTo },
      })
      throw error
    }
    return data ?? []
  } catch (e) {
    clear()
    rethrowAbort(e, signal, 'fetchIngresos')
  }
}

export function useIngresos(filters = {}, { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: [
      'ingresos',
      municipioId ?? '__ALL__',
      filters.mes       ?? '',
      filters.fechaFrom ?? '',
      filters.fechaTo   ?? '',
    ],
    queryFn: () => fetchIngresos({ municipioId, ...filters }),
    enabled: !!perfil,
  })
}

export async function createIngreso(data) {
  const { data: row, error } = await supabase
    .from('ingresos')
    .insert(data)
    .select(INGRESO_COLS)
    .single()
  if (error) {
    console.error('[useAdministracion] createIngreso error:', error)
    throw error
  }
  return row
}

// ─────────────────────────────────────────────────────────────────
// Presupuesto
// ─────────────────────────────────────────────────────────────────

export async function fetchPresupuesto({ municipioId, anio } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase.from('presupuesto').select(PRESUPUESTO_COLS).abortSignal(signal)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    if (anio)        q = q.eq('anio', anio)
    const { data, error } = await q
    clear()
    if (error) {
      console.error('[useAdministracion] fetchPresupuesto error:', error)
      throw error
    }
    return data ?? []
  } catch (e) {
    clear()
    rethrowAbort(e, signal, 'fetchPresupuesto')
  }
}

export function usePresupuesto(anio = currentYear(), { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['presupuesto', municipioId ?? '__ALL__', anio],
    queryFn: () => fetchPresupuesto({ municipioId, anio }),
    enabled: !!perfil,
  })
}

// ─────────────────────────────────────────────────────────────────
// Presupuesto por partidas — granularidad fina (dependencia + partida
// + fuente). Convive con `presupuesto` (monto anual por dependencia)
// que sigue siendo la fuente del tab Presupuesto clásico. La nueva
// tabla `presupuesto_partidas` es la que el sistema usa para alinear
// con la rendición provincial (SARC).
// ─────────────────────────────────────────────────────────────────

const PARTIDAS_COLS = `
  id, municipio_id, dependencia_id, partida_codigo, fuente,
  monto_asignado, anio,
  dependencia:dependencia_id ( id, nombre )
`

export async function fetchPresupuestoPartidas({ municipioId, anio } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase.from('presupuesto_partidas').select(PARTIDAS_COLS).abortSignal(signal)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    if (anio)        q = q.eq('anio', anio)
    const { data, error } = await q
    clear()
    if (error) {
      console.error('[useAdministracion] fetchPresupuestoPartidas:', error)
      throw error
    }
    return data ?? []
  } catch (e) {
    clear()
    rethrowAbort(e, signal, 'fetchPresupuestoPartidas')
  }
}

export function usePresupuestoPartidas(anio = currentYear(), { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['presupuesto-partidas', municipioId ?? '__ALL__', anio],
    queryFn:  () => fetchPresupuestoPartidas({ municipioId, anio }),
    enabled:  !!perfil,
  })
}

export async function createPresupuestoPartida(data) {
  const { data: row, error } = await supabase
    .from('presupuesto_partidas').insert(data).select(PARTIDAS_COLS).single()
  if (error) throw error
  return row
}

export function useCreatePresupuestoPartida() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createPresupuestoPartida,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['presupuesto-partidas'] }),
  })
}

// ─────────────────────────────────────────────────────────────────
// Mutations React-friendly — invalidan los queries afectados
// ─────────────────────────────────────────────────────────────────

export function useCreateGasto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createGasto,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['gastos'] }),
  })
}

export function useUpdateGastoEstado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, estado }) => updateGastoEstado(id, estado),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['gastos'] }),
  })
}

export function useCreateIngreso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createIngreso,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['ingresos'] }),
  })
}
