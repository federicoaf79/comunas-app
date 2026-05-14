import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useObras — listado de obras públicas + historial de cambios.
//
// Schema (migrations 20260514_obras.sql + 20260514_obras_historial.sql):
//   obras            (id, municipio_id, dependencia_id, nombre,
//                     descripcion, estado, porcentaje_avance,
//                     fecha_inicio, fecha_fin_estimada, fecha_fin_real,
//                     presupuesto_total, gasto_acumulado,
//                     forma_pago, tipo_financiamiento,
//                     partida_presupuestaria, responsable_id,
//                     cantidad_obreros, tiene_seguro, tiene_permisos,
//                     observaciones, created_at)
//   obras_historial  (id, obra_id, usuario_id, estado_anterior,
//                     estado_nuevo, avance_anterior, avance_nuevo,
//                     nota, created_at)
//
// Si la tabla `obras` o la columna `forma_pago` todavía no se aplicó,
// los queries fallan con 42703 / 42P01 y el listado degrada a vacío
// (warn en consola). Mismo criterio que useInventario / usePatrimonio.
// =============================================================

export const ESTADOS_OBRA = [
  { value: 'planificacion', label: 'En planificación' },
  { value: 'en_ejecucion',  label: 'En ejecución' },
  { value: 'demorada',      label: 'Demorada' },
  { value: 'finalizada',    label: 'Finalizada' },
  { value: 'cancelada',     label: 'Cancelada' },
]

export const FORMAS_PAGO = [
  { value: 'licitacion',      label: 'Licitación' },
  { value: 'cotizacion',      label: 'Cotización' },
  { value: 'compra_directa',  label: 'Compra directa' },
]

export const TIPOS_FINANCIAMIENTO = [
  { value: 'municipal',  label: 'Municipal' },
  { value: 'provincial', label: 'Provincial' },
  { value: 'nacional',   label: 'Nacional' },
  { value: 'mixto',      label: 'Mixto' },
]

// Subset seguro para retry si la migration _historial todavía no
// se aplicó (la columna `forma_pago` aún no existe). Postgres devuelve
// 42703 y la query falla con 400 — caemos a esta whitelist.
const OBRAS_COLS_BASE = `
  id, municipio_id, dependencia_id, nombre, descripcion, estado,
  porcentaje_avance, fecha_inicio, fecha_fin_estimada, fecha_fin_real,
  presupuesto_total, gasto_acumulado, tipo_financiamiento,
  partida_presupuestaria, responsable_id, cantidad_obreros,
  tiene_seguro, tiene_permisos, observaciones, created_at,
  dependencia:dependencia_id ( id, nombre, tipo )
`
const OBRAS_COLS_FULL = OBRAS_COLS_BASE + ', forma_pago'

async function fetchObras({ municipioId, dependenciaId, estado } = {}) {
  if (!municipioId) return []

  const buildQuery = (cols) => {
    let q = supabase.from('obras').select(cols)
      .eq('municipio_id', municipioId)
      .order('fecha_inicio', { ascending: false, nullsFirst: false })
    if (dependenciaId) q = q.eq('dependencia_id', dependenciaId)
    if (estado)        q = q.eq('estado',          estado)
    return q
  }

  // Retry silencioso: si la migration _historial no se aplicó, cae a BASE.
  let { data, error } = await buildQuery(OBRAS_COLS_FULL)
  if (error && /column .* does not exist|42703/i.test(error.message ?? '')) {
    ;({ data, error } = await buildQuery(OBRAS_COLS_BASE))
  }
  if (error) {
    console.warn('[useObras] fetchObras error:', error.message)
    return []
  }
  return data ?? []
}

export function useObras(filters = {}, { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: [
      'obras', municipioId ?? '__NONE__',
      filters.dependenciaId ?? '', filters.estado ?? '',
    ],
    queryFn: () => fetchObras({ municipioId, ...filters }),
    enabled: !!perfil && !!municipioId,
  })
}

// Lista de usuarios del municipio para el select de "Responsable".
// Trae solo id + nombre + email para no exponer datos sensibles.
async function fetchUsuariosDelMunicipio(municipioId) {
  if (!municipioId) return []
  const { data, error } = await supabase
    .from('usuarios')
    .select('id, nombre, email')
    .eq('municipio_id', municipioId)
    .eq('activo', true)
    .order('nombre', { ascending: true })
  if (error) {
    console.warn('[useObras] fetchUsuariosDelMunicipio error:', error.message)
    return []
  }
  return data ?? []
}

export function useUsuariosDelMunicipio(municipioId) {
  const { perfil } = useAuth()
  return useQuery({
    queryKey: ['usuarios-del-municipio', municipioId ?? '__NONE__'],
    queryFn:  () => fetchUsuariosDelMunicipio(municipioId),
    enabled:  !!perfil && !!municipioId,
    staleTime: 5 * 60 * 1000,
  })
}

// Historial de una obra — orden cronológico inverso (más reciente arriba).
// Incluye el nombre del usuario que hizo el cambio (join a usuarios).
async function fetchObraHistorial(obraId) {
  if (!obraId) return []
  const { data, error } = await supabase
    .from('obras_historial')
    .select(`
      id, obra_id, usuario_id, estado_anterior, estado_nuevo,
      avance_anterior, avance_nuevo, nota, created_at,
      usuario:usuario_id ( id, nombre, email )
    `)
    .eq('obra_id', obraId)
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('[useObras] fetchObraHistorial error:', error.message)
    return []
  }
  return data ?? []
}

export function useObraHistorial(obraId) {
  const { perfil } = useAuth()
  return useQuery({
    queryKey: ['obra-historial', obraId ?? '__NONE__'],
    queryFn:  () => fetchObraHistorial(obraId),
    enabled:  !!perfil && !!obraId,
  })
}

// ─────────────────────────────────────────────────────────────────
// Mutaciones
// ─────────────────────────────────────────────────────────────────

async function createObra({ payload, usuarioId }) {
  const { data, error } = await supabase
    .from('obras')
    .insert(payload)
    .select(OBRAS_COLS_FULL)
    .single()
  if (error) {
    // Fallback si la columna forma_pago no existe — reintentamos
    // SIN forma_pago en el payload y SIN pedirla en el select.
    if (/column .* does not exist|42703/i.test(error.message ?? '')) {
      const { forma_pago: _omit, ...rest } = payload
      const retry = await supabase.from('obras').insert(rest).select(OBRAS_COLS_BASE).single()
      if (retry.error) throw retry.error
      // Aún si no hay forma_pago, registramos la creación en el
      // historial — el WITH CHECK de obras_historial valida que el
      // usuario tenga acceso al municipio.
      await insertHistorial({
        obraId:        retry.data.id,
        usuarioId,
        estadoNuevo:   retry.data.estado,
        avanceNuevo:   retry.data.porcentaje_avance,
        nota:          'Obra creada.',
      })
      return retry.data
    }
    throw error
  }
  await insertHistorial({
    obraId:      data.id,
    usuarioId,
    estadoNuevo: data.estado,
    avanceNuevo: data.porcentaje_avance,
    nota:        'Obra creada.',
  })
  return data
}

// Update con tracking de historial: si cambia estado o avance,
// se registra una fila en obras_historial. La nota libre del form
// (si la hubiera) se concatena al log.
async function updateObra({ id, patch, prev, usuarioId, nota }) {
  // Si la columna forma_pago no existe en la instancia, evitamos
  // mandarla — el retry de fetch ya cae a BASE, pero la mutación
  // necesita un payload limpio.
  let { data, error } = await supabase
    .from('obras')
    .update(patch)
    .eq('id', id)
    .select(OBRAS_COLS_FULL)
    .single()
  if (error && /column .* does not exist|42703/i.test(error.message ?? '')) {
    const { forma_pago: _omit, ...rest } = patch
    ;({ data, error } = await supabase
      .from('obras')
      .update(rest)
      .eq('id', id)
      .select(OBRAS_COLS_BASE)
      .single())
  }
  if (error) throw error

  const cambioEstado = prev && prev.estado !== data.estado
  const cambioAvance = prev && Number(prev.porcentaje_avance ?? 0) !== Number(data.porcentaje_avance ?? 0)
  if (cambioEstado || cambioAvance || nota) {
    await insertHistorial({
      obraId:          id,
      usuarioId,
      estadoAnterior:  prev?.estado ?? null,
      estadoNuevo:     data.estado,
      avanceAnterior:  prev?.porcentaje_avance ?? null,
      avanceNuevo:     data.porcentaje_avance,
      nota:            nota || buildNotaAutomatica({ cambioEstado, cambioAvance }),
    })
  }
  return data
}

function buildNotaAutomatica({ cambioEstado, cambioAvance }) {
  if (cambioEstado && cambioAvance) return 'Cambio de estado y avance.'
  if (cambioEstado)                 return 'Cambio de estado.'
  if (cambioAvance)                 return 'Actualización de avance.'
  return null
}

async function insertHistorial({
  obraId, usuarioId, estadoAnterior, estadoNuevo,
  avanceAnterior, avanceNuevo, nota,
}) {
  const { error } = await supabase.from('obras_historial').insert({
    obra_id:         obraId,
    usuario_id:      usuarioId ?? null,
    estado_anterior: estadoAnterior ?? null,
    estado_nuevo:    estadoNuevo ?? null,
    avance_anterior: avanceAnterior ?? null,
    avance_nuevo:    avanceNuevo ?? null,
    nota:            nota ?? null,
  })
  if (error) {
    // La tabla de historial puede no existir si la migration no se
    // aplicó — degrada en silencio sin fallar la mutación principal.
    console.warn('[useObras] insertHistorial:', error.message)
  }
}

export function useCreateObra() {
  const qc = useQueryClient()
  const { perfil } = useAuth()
  return useMutation({
    mutationFn: (payload) => createObra({ payload, usuarioId: perfil?.id }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['obras'] })
      qc.invalidateQueries({ queryKey: ['dashboard', 'obras-en-curso'] })
    },
  })
}

export function useUpdateObra() {
  const qc = useQueryClient()
  const { perfil } = useAuth()
  return useMutation({
    mutationFn: ({ id, patch, prev, nota }) =>
      updateObra({ id, patch, prev, usuarioId: perfil?.id, nota }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['obras'] })
      qc.invalidateQueries({ queryKey: ['obra-historial', data?.id] })
      qc.invalidateQueries({ queryKey: ['dashboard', 'obras-en-curso'] })
    },
  })
}
