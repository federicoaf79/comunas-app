import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Helper: Date → YYYY-MM-DD en TZ Argentina
const fmtDateArg = (d) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(d)

// =============================================================
// useBeneficiarios — programas de Ayuda Social del municipio.
// Schema: beneficiarios (id, municipio_id, vecino_id, tipo_ayuda,
//   descripcion, estado, fecha_inicio, created_at, updated_at)
// Estados (check constraint): activo | suspendido | baja
// =============================================================

const TIMEOUT_MS = 8000

const COLS = `
  id, municipio_id, vecino_id, tipo_ayuda, descripcion,
  estado, fecha_inicio, programa, nivel, monto_mensual,
  fecha_fin, observaciones, registrado_por, created_at,
  vecino:vecino_id ( id, dni, nombre, apellido, nombre_completo, telefono )
`

const PAGOS_COLS = `
  id, municipio_id, beneficiario_id, fecha, concepto,
  monto, nivel, programa, comprobante_url, registrado_por, created_at,
  beneficiario:beneficiario_id (
    id,
    vecino:vecino_id ( nombre_completo, dni )
  )
`

function withTimeout() {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS)
  return { signal: controller.signal, clear: () => clearTimeout(id) }
}

// Helper para calcular el primer día del mes siguiente (límite superior exclusivo)
// Evita el bug de `${mes}-32` que causa error Postgres 22008 (date out of range)
function primerDiaMesSiguiente(mesYYYYMM) {
  const [anio, mes] = mesYYYYMM.split('-').map(Number)
  // Date(año, mes, 1) con mes en base-1 (no 0-indexed) → primer día del mes siguiente
  const fecha = new Date(anio, mes, 1)
  const anioSig = fecha.getFullYear()
  const mesSig = String(fecha.getMonth() + 1).padStart(2, '0')
  return `${anioSig}-${mesSig}-01`
}

export async function fetchBeneficiarios({ municipioId, estado } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase
      .from('beneficiarios')
      .select(COLS)
      .order('fecha_inicio', { ascending: false })
      .abortSignal(signal)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    if (estado)      q = q.eq('estado', estado)
    const { data, error } = await q
    clear()
    if (error) {
      console.error('[useBeneficiarios] fetchBeneficiarios error:', error)
      throw error
    }
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function useBeneficiarios(filters = {}) {
  const { perfil } = useAuth()
  const municipioId = perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['beneficiarios', municipioId ?? '__ALL__', filters.estado ?? ''],
    queryFn:  () => fetchBeneficiarios({ municipioId, ...filters }),
    enabled:  !!perfil,
  })
}

export async function createBeneficiario(data) {
  const { data: row, error } = await supabase
    .from('beneficiarios')
    .insert({ ...data, estado: data.estado ?? 'activo' })
    .select(COLS)
    .single()
  if (error) {
    console.error('[useBeneficiarios] createBeneficiario error:', error)
    throw error
  }
  return row
}

export async function updateBeneficiarioEstado(id, estado) {
  const { data: row, error } = await supabase
    .from('beneficiarios')
    .update({ estado })
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) {
    console.error('[useBeneficiarios] updateBeneficiarioEstado error:', error)
    throw error
  }
  return row
}

export function useCreateBeneficiario() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createBeneficiario,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['beneficiarios'] }),
  })
}

export function useUpdateBeneficiarioEstado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, estado }) => updateBeneficiarioEstado(id, estado),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['beneficiarios'] }),
  })
}

// ─────────────────────────────────────────────────────────────────
// Pagos y entregas
// ─────────────────────────────────────────────────────────────────

export async function fetchPagos({ municipioId, mes, nivel, programa } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase
      .from('ayuda_social_pagos')
      .select(PAGOS_COLS)
      .order('fecha', { ascending: false })
      .abortSignal(signal)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    if (mes)         q = q.gte('fecha', `${mes}-01`).lt('fecha', primerDiaMesSiguiente(mes))
    if (nivel)       q = q.eq('nivel', nivel)
    if (programa)    q = q.ilike('programa', `%${programa}%`)
    const { data, error } = await q
    clear()
    if (error) {
      console.error('[useBeneficiarios] fetchPagos error:', error)
      throw error
    }
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function usePagos(filters = {}) {
  const { perfil } = useAuth()
  const municipioId = perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['ayuda-social-pagos', municipioId ?? '__ALL__', filters.mes ?? '', filters.nivel ?? '', filters.programa ?? ''],
    queryFn:  () => fetchPagos({ municipioId, ...filters }),
    enabled:  !!perfil,
  })
}

export async function createPago(data) {
  const { data: row, error } = await supabase
    .from('ayuda_social_pagos')
    .insert(data)
    .select(PAGOS_COLS)
    .single()
  if (error) {
    console.error('[useBeneficiarios] createPago error:', error)
    throw error
  }
  return row
}

export function useCreatePago() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createPago,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['ayuda-social-pagos'] }),
  })
}

// ─────────────────────────────────────────────────────────────────
// Entregas (Bolsines + otros programas de distribución)
// ─────────────────────────────────────────────────────────────────

const ENTREGAS_COLS = `
  id, municipio_id, vecino_id, programa, variante, cantidad, unidad,
  fecha, notas, registrado_por, created_at,
  vecino:vecino_id ( nombre_completo, dni )
`

export async function fetchEntregas({ municipioId, mes, programa } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase
      .from('ayuda_social_entregas')
      .select(ENTREGAS_COLS)
      .order('fecha', { ascending: false })
      .abortSignal(signal)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    if (mes)         q = q.gte('fecha', `${mes}-01`).lt('fecha', primerDiaMesSiguiente(mes))
    if (programa)    q = q.ilike('programa', `%${programa}%`)
    const { data, error } = await q
    clear()
    if (error) {
      console.error('[useBeneficiarios] fetchEntregas error:', error)
      throw error
    }
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function useEntregas(filters = {}) {
  const { perfil } = useAuth()
  const municipioId = perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['ayuda-social-entregas', municipioId ?? '__ALL__', filters.mes ?? '', filters.programa ?? ''],
    queryFn:  () => fetchEntregas({ municipioId, ...filters }),
    enabled:  !!perfil,
  })
}

export async function createEntrega(data) {
  // Validación anti-duplicados: verificar si ya existe una entrega
  // del mismo programa para el mismo vecino dentro del período configurado
  const { municipio_id, vecino_id, programa, fecha } = data

  // 1. Leer configuración del período anti-duplicado
  const { data: configRow, error: configError } = await supabase
    .from('configuracion_portal')
    .select('valor')
    .eq('municipio_id', municipio_id)
    .eq('clave', 'ayuda_social_config')
    .maybeSingle()

  if (configError) {
    console.warn('[createEntrega] Error leyendo configuración, usando default 30 días:', configError)
  }

  let periodoDias = 30 // default
  if (configRow?.valor) {
    try {
      const config = typeof configRow.valor === 'string'
        ? JSON.parse(configRow.valor)
        : configRow.valor
      periodoDias = config.periodo_antiduplicado_dias ?? 30
    } catch {
      console.warn('[createEntrega] Configuración malformada, usando default 30 días')
    }
  }

  // 2. Calcular fecha límite (fecha - periodoDias)
  const fechaObj = new Date(fecha + 'T00:00:00')
  const fechaLimite = new Date(fechaObj)
  fechaLimite.setDate(fechaLimite.getDate() - periodoDias)
  const fechaLimiteStr = fmtDateArg(fechaLimite)

  // 3. Buscar entregas duplicadas en la ventana
  const { data: duplicados, error: dupError } = await supabase
    .from('ayuda_social_entregas')
    .select('id, fecha, vecino:vecino_id ( nombre_completo )')
    .eq('vecino_id', vecino_id)
    .eq('programa', programa)
    .gte('fecha', fechaLimiteStr)
    .lte('fecha', fecha)

  if (dupError) {
    console.error('[createEntrega] Error verificando duplicados:', dupError)
    throw dupError
  }

  // Si ya existe una entrega en el período, bloquear
  if (duplicados && duplicados.length > 0) {
    const dup = duplicados[0]
    const nombreVecino = dup.vecino?.nombre_completo ?? 'este vecino'
    const fechaDup = new Date(dup.fecha + 'T00:00:00').toLocaleDateString('es-AR')
    throw new Error(
      `Ya se registró "${programa}" para ${nombreVecino} el ${fechaDup} — no se puede repetir dentro de los próximos ${periodoDias} días.`
    )
  }

  // 4. Insertar la entrega
  const { data: row, error } = await supabase
    .from('ayuda_social_entregas')
    .insert(data)
    .select(ENTREGAS_COLS)
    .single()

  if (error) {
    console.error('[useBeneficiarios] createEntrega error:', error)
    throw error
  }
  return row
}

export function useCreateEntrega() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createEntrega,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['ayuda-social-entregas'] }),
  })
}
