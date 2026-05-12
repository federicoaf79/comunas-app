import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useInventario — stock, movimientos y órdenes de compra
//
// Schema asumido (existente en Supabase):
//   inventario             (id, municipio_id, dependencia_id, nombre,
//                           categoria, unidad, stock_actual, stock_minimo,
//                           precio_referencia, partida_codigo, created_at)
//   movimientos_inventario (id, inventario_id, tipo entrada|salida|ajuste,
//                           cantidad, stock_anterior, stock_posterior,
//                           motivo, registrado_por, fecha timestamptz)
//   ordenes_compra         (id, municipio_id, dependencia_id, numero,
//                           proveedor, descripcion, monto_total,
//                           partida_codigo, tipo directa|cotizacion,
//                           estado borrador|pendiente|aprobada|rechazada,
//                           comprobante_url, fecha, created_by,
//                           fecha_aprobacion, gasto_id)
//   partidas_tipo          (codigo, nombre, descripcion)
//
// Las mutaciones que tocan stock (entrada/salida) lo hacen en dos
// pasos sin transacción: SELECT stock → UPDATE → INSERT movimiento.
// Hay una ventana de carrera microscópica, aceptable para el volumen
// de un panel municipal.
// =============================================================

const TIMEOUT_MS = 8000

const INV_COLS = `
  id, municipio_id, dependencia_id, nombre, categoria, unidad,
  stock_actual, stock_minimo, precio_referencia, partida_codigo, created_at,
  dependencia:dependencia_id ( id, nombre )
`
const MOV_COLS = `
  id, inventario_id, tipo, cantidad, stock_anterior, stock_posterior,
  motivo, registrado_por, fecha,
  inventario:inventario_id (
    id, nombre, unidad, dependencia_id,
    dependencia:dependencia_id ( id, nombre )
  )
`
const OC_COLS = `
  id, municipio_id, dependencia_id, numero, proveedor, descripcion,
  monto_total, partida_codigo, tipo, estado, comprobante_url, fecha,
  created_by, fecha_aprobacion, gasto_id,
  dependencia:dependencia_id ( id, nombre )
`

// Límite de compra directa — superado obliga a tipo='cotizacion'.
// El valor exacto depende de la normativa provincial; lo dejamos
// como const exportada para que el wizard provincial lo pise si
// hace falta. 500 mil pesos = piso razonable Q2 2026.
export const LIMITE_COMPRA_DIRECTA = 500_000

function withTimeout() {
  const c = new AbortController()
  const id = setTimeout(() => c.abort(), TIMEOUT_MS)
  return { signal: c.signal, clear: () => clearTimeout(id) }
}

// ─────────────────────────────────────────────────────────────────
// Inventario
// ─────────────────────────────────────────────────────────────────

async function fetchInventario({ municipioId, dependenciaId, categoria } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase.from('inventario').select(INV_COLS)
      .order('nombre', { ascending: true })
      .abortSignal(signal)
    if (municipioId)   q = q.eq('municipio_id',   municipioId)
    if (dependenciaId) q = q.eq('dependencia_id', dependenciaId)
    if (categoria)     q = q.eq('categoria',      categoria)
    const { data, error } = await q
    clear()
    if (error) throw error
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function useInventario(filters = {}, { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: [
      'inventario', municipioId ?? '__ALL__',
      filters.dependenciaId ?? '', filters.categoria ?? '',
    ],
    queryFn: () => fetchInventario({ municipioId, ...filters }),
    enabled: !!perfil,
  })
}

// ─────────────────────────────────────────────────────────────────
// Movimientos
// ─────────────────────────────────────────────────────────────────

async function fetchMovimientos({
  municipioId, dependenciaId, tipo, fechaDesde, fechaHasta, limit = 50,
} = {}) {
  const { signal, clear } = withTimeout()
  try {
    // Filtramos por municipio vía join inventario; Supabase no permite
    // filtrar columnas de tablas anidadas con .eq() — usamos un
    // pre-fetch de inventarios del municipio cuando hace falta.
    let inventarioIds = null
    if (municipioId || dependenciaId) {
      let invQ = supabase.from('inventario').select('id').abortSignal(signal)
      if (municipioId)   invQ = invQ.eq('municipio_id',   municipioId)
      if (dependenciaId) invQ = invQ.eq('dependencia_id', dependenciaId)
      const { data: invIds, error: invErr } = await invQ
      if (invErr) throw invErr
      inventarioIds = (invIds ?? []).map(r => r.id)
      if (inventarioIds.length === 0) {
        clear()
        return []
      }
    }

    let q = supabase.from('movimientos_inventario').select(MOV_COLS)
      .order('fecha', { ascending: false })
      .limit(limit)
      .abortSignal(signal)
    if (inventarioIds)  q = q.in('inventario_id', inventarioIds)
    if (tipo)           q = q.eq('tipo', tipo)
    if (fechaDesde)     q = q.gte('fecha', fechaDesde)
    if (fechaHasta)     q = q.lt('fecha', fechaHasta)

    const { data, error } = await q
    clear()
    if (error) throw error
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function useMovimientos(filters = {}, { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: [
      'mov-inventario', municipioId ?? '__ALL__',
      filters.dependenciaId ?? '', filters.tipo ?? '',
      filters.fechaDesde ?? '', filters.fechaHasta ?? '',
    ],
    queryFn: () => fetchMovimientos({ municipioId, ...filters }),
    enabled: !!perfil,
  })
}

// ─────────────────────────────────────────────────────────────────
// Órdenes de compra
// ─────────────────────────────────────────────────────────────────

async function fetchOrdenes({ municipioId, dependenciaId, estado } = {}) {
  const { signal, clear } = withTimeout()
  try {
    let q = supabase.from('ordenes_compra').select(OC_COLS)
      .order('fecha', { ascending: false })
      .abortSignal(signal)
    if (municipioId)   q = q.eq('municipio_id',   municipioId)
    if (dependenciaId) q = q.eq('dependencia_id', dependenciaId)
    if (estado)        q = q.eq('estado',         estado)
    const { data, error } = await q
    clear()
    if (error) throw error
    return data ?? []
  } catch (e) {
    clear()
    throw e
  }
}

export function useOrdenesCompra(filters = {}, { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: [
      'ordenes-compra', municipioId ?? '__ALL__',
      filters.dependenciaId ?? '', filters.estado ?? '',
    ],
    queryFn: () => fetchOrdenes({ municipioId, ...filters }),
    enabled: !!perfil,
  })
}

// ─────────────────────────────────────────────────────────────────
// Partidas tipo (catálogo)
// ─────────────────────────────────────────────────────────────────

export function usePartidasTipo() {
  return useQuery({
    queryKey: ['partidas-tipo'],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('partidas_tipo')
        .select('codigo, nombre, descripcion')
        .order('codigo')
      if (error) throw error
      return data ?? []
    },
    staleTime: 60 * 60 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────
// Mutaciones — items de inventario
// ─────────────────────────────────────────────────────────────────

async function createInventarioItem(data) {
  const { data: row, error } = await supabase
    .from('inventario').insert(data).select(INV_COLS).single()
  if (error) throw error
  return row
}
async function updateInventarioItem({ id, ...patch }) {
  const { data: row, error } = await supabase
    .from('inventario').update(patch).eq('id', id).select(INV_COLS).single()
  if (error) throw error
  return row
}

export function useCreateInventarioItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createInventarioItem,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['inventario'] }),
  })
}
export function useUpdateInventarioItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateInventarioItem,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['inventario'] }),
  })
}

// ─────────────────────────────────────────────────────────────────
// Mutaciones — movimientos (con UPDATE de stock)
// ─────────────────────────────────────────────────────────────────

// Crea un movimiento Y actualiza el stock_actual del item. tipo:
//   'entrada' → stock_actual += cantidad
//   'salida'  → stock_actual -= cantidad
//   'ajuste'  → stock_actual = cantidad (toma cantidad como valor final)
async function createMovimiento({ inventarioId, tipo, cantidad, motivo, registradoPor }) {
  // 1) leer stock actual
  const { data: inv, error: invErr } = await supabase
    .from('inventario')
    .select('id, stock_actual')
    .eq('id', inventarioId)
    .single()
  if (invErr) throw invErr

  const anterior = Number(inv.stock_actual ?? 0)
  let posterior
  if      (tipo === 'entrada') posterior = anterior + Number(cantidad)
  else if (tipo === 'salida')  posterior = anterior - Number(cantidad)
  else                         posterior = Number(cantidad) // ajuste

  // 2) actualizar stock
  const { error: upErr } = await supabase
    .from('inventario')
    .update({ stock_actual: posterior })
    .eq('id', inventarioId)
  if (upErr) throw upErr

  // 3) insertar movimiento
  const payload = {
    inventario_id:    inventarioId,
    tipo,
    cantidad:         tipo === 'ajuste' ? (posterior - anterior) : Number(cantidad),
    stock_anterior:   anterior,
    stock_posterior:  posterior,
    motivo:           motivo || null,
    registrado_por:   registradoPor || null,
    fecha:            new Date().toISOString(),
  }
  const { data: mov, error: movErr } = await supabase
    .from('movimientos_inventario').insert(payload).select(MOV_COLS).single()
  if (movErr) throw movErr
  return mov
}

export function useCreateMovimiento() {
  const qc = useQueryClient()
  const { perfil } = useAuth()
  return useMutation({
    mutationFn: (params) => createMovimiento({ registradoPor: perfil?.id, ...params }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['inventario'] })
      qc.invalidateQueries({ queryKey: ['mov-inventario'] })
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Mutaciones — órdenes de compra
// ─────────────────────────────────────────────────────────────────

// Crea una orden de compra. Si `crearGastoPendiente=true`, primero
// inserta un gasto en estado 'pendiente' y luego enlaza la orden a
// ese gasto vía `gasto_id`. Esto permite al SubAdmin pre-registrar
// el gasto cuando solicita los insumos; al aprobar la orden el
// gasto se promueve a 'aprobado' (no se duplica).
async function createOrdenCompra(data) {
  const { crearGastoPendiente, ...rest } = data ?? {}
  let gastoId = null

  if (crearGastoPendiente) {
    const { data: g, error: gErr } = await supabase
      .from('gastos')
      .insert({
        municipio_id:    rest.municipio_id,
        fecha:           rest.fecha ?? new Date().toISOString().slice(0, 10),
        descripcion:     buildGastoDesc(rest),
        categoria:       'Insumos',
        dependencia_id:  rest.dependencia_id,
        monto:           Number(rest.monto_total ?? 0),
        estado:          'pendiente',
        comprobante_url: rest.comprobante_url ?? null,
      })
      .select('id')
      .single()
    if (gErr) throw gErr
    gastoId = g.id
  }

  const { data: row, error } = await supabase
    .from('ordenes_compra')
    .insert({ ...rest, gasto_id: gastoId })
    .select(OC_COLS)
    .single()
  if (error) {
    // Rollback manual: si la inserción falla y ya creamos el gasto,
    // lo borramos para no dejar un gasto pendiente huérfano.
    if (gastoId) {
      const { error: dErr } = await supabase.from('gastos').delete().eq('id', gastoId)
      if (dErr) console.warn('[useInventario] rollback gasto huérfano falló:', dErr.message)
    }
    throw error
  }
  return row
}

// Descripción canónica del gasto asociado a una OC. Centralizada
// para que coincida entre el pre-registro (pendiente) y la
// creación automática al aprobar.
function buildGastoDesc(oc) {
  return `OC ${oc.numero ?? ''} — ${oc.proveedor ?? ''}: ${oc.descripcion ?? ''}`.trim()
}

export function useCreateOrdenCompra() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createOrdenCompra,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra'] })
      qc.invalidateQueries({ queryKey: ['gastos'] })
    },
  })
}

// Aprobar / Rechazar / Enviar a aprobación.
//
//   borrador  → pendiente : la solicitud queda visible para el Admin
//                            Comuna en la cola de aprobación.
//   pendiente → aprobada  : si la orden tiene gasto_id, ese gasto se
//                            promueve a 'aprobado'. Si no, se crea
//                            un gasto nuevo en 'aprobado' y se
//                            vincula a la orden.
//   pendiente → rechazada : si la orden tiene gasto_id, ese gasto se
//                            marca como 'rechazado'.
async function updateOrdenEstado({ id, estado, fechaAprobacion }) {
  const patch = { estado }
  if (estado === 'aprobada') {
    patch.fecha_aprobacion = fechaAprobacion ?? new Date().toISOString().slice(0, 10)
  }
  const { data: row, error } = await supabase
    .from('ordenes_compra').update(patch).eq('id', id).select(OC_COLS).single()
  if (error) throw error

  if (estado === 'aprobada') {
    const fechaAprob = row.fecha_aprobacion ?? new Date().toISOString().slice(0, 10)

    if (row.gasto_id) {
      // Promover el gasto pre-registrado al estado 'aprobado'.
      const { error: upErr } = await supabase
        .from('gastos')
        .update({
          estado:          'aprobado',
          fecha:           fechaAprob,
          monto:           Number(row.monto_total ?? 0),
          descripcion:     buildGastoDesc(row),
          comprobante_url: row.comprobante_url ?? null,
        })
        .eq('id', row.gasto_id)
      if (upErr) {
        console.warn('[useInventario] no se pudo promover el gasto pre-cargado:', upErr.message)
      }
    } else {
      // No hay gasto vinculado — creamos uno nuevo en 'aprobado'
      // y lo vinculamos a la orden para futuras consultas.
      const { data: g, error: gErr } = await supabase
        .from('gastos')
        .insert({
          municipio_id:    row.municipio_id,
          fecha:           fechaAprob,
          descripcion:     buildGastoDesc(row),
          categoria:       'Insumos',
          dependencia_id:  row.dependencia_id,
          monto:           Number(row.monto_total ?? 0),
          estado:          'aprobado',
          comprobante_url: row.comprobante_url ?? null,
        })
        .select('id')
        .single()
      if (gErr) {
        console.warn('[useInventario] gasto auto-creado falló:', gErr.message)
      } else {
        const { error: linkErr } = await supabase
          .from('ordenes_compra')
          .update({ gasto_id: g.id })
          .eq('id', row.id)
        if (linkErr) console.warn('[useInventario] no se pudo enlazar gasto a OC:', linkErr.message)
      }
    }
  } else if (estado === 'rechazada' && row.gasto_id) {
    // Sincronizamos el gasto pre-cargado al rechazo de la orden.
    const { error: upErr } = await supabase
      .from('gastos')
      .update({ estado: 'rechazado' })
      .eq('id', row.gasto_id)
    if (upErr) console.warn('[useInventario] no se pudo rechazar el gasto vinculado:', upErr.message)
  }

  return row
}

export function useUpdateOrdenEstado() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateOrdenEstado,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra'] })
      qc.invalidateQueries({ queryKey: ['gastos'] })
    },
  })
}

// Atajo semántico: borrador → pendiente. Es el mismo update bajo el
// capó, pero la UI lee mejor con un hook explícito para "enviar a
// aprobación".
export function useEnviarSolicitudOC() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }) => updateOrdenEstado({ id, estado: 'pendiente' }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['ordenes-compra'] })
      qc.invalidateQueries({ queryKey: ['gastos'] })
    },
  })
}
