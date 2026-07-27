import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveMunicipioId } from './useEffectiveMunicipioId'
import { createAuditLog } from './useAuditLog'
import { ARG_OFFSET } from '../lib/datetime'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[useVales] audit log:', e.message))
}

// =============================================================
// useVales — Vales Electrónicos, Fase 1 (emisión desde el admin).
//
// La tabla real y su RLS ya existen desde Fase 0
// (20260724_vales_electronicos_fase0.sql): SELECT/UPDATE/DELETE
// para cualquier staff del municipio con el módulo activo, pero el
// INSERT (emitir) exige ADEMÁS usuarios.puede_emitir_vales = true
// en la fila de quien ejecuta -- ese candado es el único gate real
// (defensa en profundidad, no confiar solo en ocultar el botón acá).
// =============================================================

// canjeado_por y anulado_por son dos FKs distintos que apuntan a
// tablas distintas (vecinos / usuarios) -- se embeben especificando
// el nombre de columna FK como target, mismo patrón ya probado acá
// mismo con vecino_id/proveedor_id/emitido_por (PostgREST resuelve
// sin ambigüedad por columna, no por tabla).
const VALE_COLS = `
  id, municipio_id, descripcion, monto, cantidad, unidad, codigo,
  estado, vigencia_horas, emitido_en, canjeado_en,
  anulado_en, motivo_anulacion,
  vecino:vecino_id(id, nombre_completo, dni),
  proveedor:proveedor_id(id, nombre),
  emisor:emitido_por(id, nombre),
  canjeador:canjeado_por(id, nombre_completo, dni),
  anulador:anulado_por(id, nombre)
`

async function fetchVales(municipioId) {
  if (!municipioId) return []
  const { data, error } = await supabase
    .from('vales')
    .select(VALE_COLS)
    .eq('municipio_id', municipioId)
    .order('emitido_en', { ascending: false })
  if (error) throw error
  return data ?? []
}

export function useVales() {
  const { perfil } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  return useQuery({
    queryKey: ['vales', municipioId ?? '__NONE__'],
    queryFn:  () => fetchVales(municipioId),
    enabled:  !!perfil && !!municipioId,
  })
}

// Charset sin caracteres ambiguos (sin 0/O, 1/I/L) -- el código es
// para tipear/escanear a mano, no para criptografía. 8 chars alcanza
// de sobra dado el volumen esperado (vales por municipio, no millones).
const CODIGO_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
function generarCodigoVale() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  let s = ''
  for (const b of bytes) s += CODIGO_CHARSET[b % CODIGO_CHARSET.length]
  return `${s.slice(0, 4)}-${s.slice(4)}`
}

async function createVale({ municipio_id, vecino_id, proveedor_id, descripcion, monto, cantidad, unidad, vigencia_horas, emitido_por }) {
  const payload = {
    municipio_id,
    vecino_id,
    proveedor_id,
    descripcion,
    monto:    monto    ?? null,
    cantidad: cantidad ?? null,
    unidad:   unidad   ?? null,
    vigencia_horas,
    emitido_por,
  }
  // Reintento corto solo ante choque de código único (23505) --
  // probabilidad ínfima con 8 chars de charset 32, pero el codigo
  // se genera en el cliente así que vale cubrir la carrera.
  let lastError
  for (let intento = 0; intento < 3; intento++) {
    const { data, error } = await supabase
      .from('vales')
      .insert({ ...payload, codigo: generarCodigoVale() })
      .select(VALE_COLS)
      .single()
    if (!error) {
      logAudit({
        accion: 'create', entidad: 'vales', entidadId: data.id,
        descripcion: `Vale emitido — ${data.vecino?.nombre_completo ?? vecino_id} en ${data.proveedor?.nombre ?? proveedor_id} (${data.codigo})`,
      })
      return data
    }
    lastError = error
    if (error.code !== '23505') break
  }
  throw lastError
}

export function useCreateVale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createVale,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['vales'] }),
  })
}

// =============================================================
// Anulación — Fase 4 parte 1.
//
// anular_vale(p_codigo, p_motivo) ya vive en prod (SECURITY DEFINER):
// solo staff/superadmin, motivo obligatorio, y solo transiciona
// 'emitido' -> 'cancelado' (un vale ya 'abierto' se rechaza -- el
// vecino puede estar en el mostrador, hay que esperar a que se queme).
// Devuelve la fila cruda de `vales`, sin los embeds de vecino/
// proveedor/anulador (mismo patrón ya documentado para abrir_vale/
// canjear_vale) -- por eso invalidamos la query en vez de usar la
// respuesta para actualizar la lista.
//
// Si el RPC rechaza, el mensaje se propaga tal cual (error.message)
// -- no se traduce acá, a diferencia de canjear_vale/Proveedor.jsx.
// =============================================================

async function anularVale({ codigo, motivo }) {
  const { data, error } = await supabase.rpc('anular_vale', {
    p_codigo: codigo,
    p_motivo: motivo,
  })
  if (error) throw error
  logAudit({
    accion: 'update', entidad: 'vales', entidadId: data?.id ?? codigo,
    descripcion: `Vale anulado — ${codigo}: ${motivo}`,
  })
  return data
}

export function useAnularVale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: anularVale,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['vales'] }),
  })
}

// =============================================================
// Reporte de conciliación — Fase 4 parte 1.
//
// Solo vales 'canjeado' (lo que un comercio efectivamente cobra).
// canjeado_en es timestamptz -- el rango que elige el staff es en
// días de Argentina (UTC-3), así que los límites se arman con
// ARG_OFFSET explícito antes de mandarlos a Supabase (mismo patrón
// ya probado en useAuditLog.js). Sin esto, un canje de las últimas
// horas de un día cae en el día siguiente para Postgres (que compara
// en UTC) y el corte mensual queda mal.
// =============================================================

const CONCILIACION_COLS = `
  id, proveedor_id, descripcion, monto, cantidad, unidad, codigo,
  canjeado_en,
  vecino:vecino_id(id, nombre_completo, dni),
  proveedor:proveedor_id(id, nombre),
  canjeador:canjeado_por(id, nombre_completo, dni)
`

async function fetchValesConciliacion({ municipioId, proveedorId, desde, hasta }) {
  if (!municipioId || !desde || !hasta) return []
  let q = supabase
    .from('vales')
    .select(CONCILIACION_COLS)
    .eq('municipio_id', municipioId)
    .eq('estado', 'canjeado')
    .gte('canjeado_en', desde)
    .lte('canjeado_en', hasta)
    .order('canjeado_en', { ascending: true })
  if (proveedorId) q = q.eq('proveedor_id', proveedorId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// fechaDesde/fechaHasta: strings "YYYY-MM-DD" (día elegido por el
// staff, en días de Argentina). proveedorId vacío/undefined = todos.
export function useValesConciliacion({ proveedorId, fechaDesde, fechaHasta } = {}) {
  const { perfil } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  const desde = fechaDesde ? `${fechaDesde}T00:00:00${ARG_OFFSET}` : null
  const hasta = fechaHasta ? `${fechaHasta}T23:59:59.999${ARG_OFFSET}` : null
  return useQuery({
    queryKey: [
      'vales-conciliacion',
      municipioId ?? '__NONE__',
      proveedorId || '__TODOS__',
      desde ?? '', hasta ?? '',
    ],
    queryFn:  () => fetchValesConciliacion({ municipioId, proveedorId, desde, hasta }),
    enabled:  !!perfil && !!municipioId && !!desde && !!hasta,
  })
}
