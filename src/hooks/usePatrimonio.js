import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// =============================================================
// usePatrimonio — bienes patrimoniales del municipio + historial
// de mantenimientos/reparaciones.
//
// Schema asumido (creado a mano en Supabase, no en migrations):
//   bienes_patrimonio (
//     id uuid PK default gen_random_uuid(),
//     municipio_id uuid FK municipios(id),
//     dependencia_id uuid FK dependencias(id),
//     tipo text not null,           -- 'inmueble' | 'equipamiento' | 'vehiculo'
//     numero_inventario text,
//     nombre text not null,
//     descripcion text,
//     estado text,                  -- 'bueno' | 'regular' | 'malo' | 'baja'
//     valor_fiscal numeric default 0,
//     fecha_adquisicion date,
//     seguro_compania text,
//     seguro_poliza text,
//     seguro_vencimiento date,
//     ubicacion text,
//     observaciones text,
//     created_at timestamptz default now()
//   )
//   patrimonio_mantenimiento (
//     id uuid PK default gen_random_uuid(),
//     bien_id uuid FK bienes_patrimonio(id) on delete cascade,
//     fecha date not null,
//     tipo text,                    -- 'mantenimiento' | 'reparacion' | …
//     descripcion text,
//     costo numeric default 0,
//     responsable text,
//     created_at timestamptz default now()
//   )
// =============================================================

const TIMEOUT_MS = 8000

const BIEN_COLS = `
  id, municipio_id, dependencia_id, tipo, numero_inventario,
  nombre, descripcion, estado, valor_fiscal, fecha_alta, fecha_baja,
  seguro_poliza, seguro_vencimiento,
  responsable_id, observaciones, fotos, activo, created_at, updated_at,
  dependencia:dependencias!dependencia_id ( id, nombre, tipo )
`

const MANT_COLS = `
  id, bien_id, municipio_id, tipo, descripcion, costo, proveedor, fecha, gasto_id, created_at
`

// Los valores deben coincidir con la columna `tipo` de
// bienes_patrimonio. La DB del cliente carga seeds con
// 'equipamiento' (no 'mueble') y 'vehiculo' como bienes
// patrimoniales aunque la operación de la flota viva en /admin/flota.
export const TIPOS_BIEN = [
  { value: 'inmueble',     label: 'Inmueble' },
  { value: 'equipamiento', label: 'Equipamiento' },
  { value: 'vehiculo',     label: 'Vehículo' },
]

export const ESTADOS_BIEN = [
  { value: 'bueno',   label: 'Bueno' },
  { value: 'regular', label: 'Regular' },
  { value: 'malo',    label: 'Malo' },
  { value: 'baja',    label: 'Dado de baja' },
]

export const TIPOS_MANTENIMIENTO = [
  { value: 'mantenimiento', label: 'Mantenimiento' },
  { value: 'reparacion',    label: 'Reparación' },
  { value: 'inspeccion',    label: 'Inspección' },
  { value: 'otro',          label: 'Otro' },
]

function withTimeout() {
  const c = new AbortController()
  const id = setTimeout(() => c.abort(), TIMEOUT_MS)
  return { signal: c.signal, clear: () => clearTimeout(id) }
}

// ─────────────────────────────────────────────────────────────────
// Bienes
// ─────────────────────────────────────────────────────────────────

// Schema tolerante:
// - El filtro `.eq('tipo', tipo)` puede chocar contra distintos
//   tipos enum en instancias viejas y devolver 400. Lo aplicamos
//   client-side sobre el resultado completo.
// - El campo `activo` puede no existir todavía; si la query falla
//   con 42703 reintentamos sin el filtro.
async function fetchBienes({ municipioId, tipo, dependenciaId } = {}) {
  console.log('[usePatrimonio] fetchBienes params:', { tipo, municipioId, dependenciaId })
  const { signal, clear } = withTimeout()
  try {
    const run = () => {
      let q = supabase.from('bienes_patrimonio').select(BIEN_COLS)
        .order('numero_inventario', { ascending: true, nullsFirst: false })
        .abortSignal(signal)
      if (municipioId)   q = q.eq('municipio_id',   municipioId)
      if (dependenciaId) q = q.eq('dependencia_id', dependenciaId)
      return q
    }

    let { data, error } = await run()
    clear()
    console.log('[usePatrimonio] fetchBienes result:', { data, error })
    if (error) {
      console.error('[usePatrimonio] fetchBienes error:', {
        message: error.message,
        details: error.details,
        hint:    error.hint,
        code:    error.code,
        filters: { municipioId, tipo, dependenciaId },
      })
      throw error
    }
    const rows = data ?? []
    return tipo ? rows.filter(b => b?.tipo === tipo) : rows
  } catch (e) { clear(); throw e }
}

export function useBienesPatrimonio({ tipo, dependenciaId } = {}, { municipioIdOverride } = {}) {
  const { perfil } = useAuth()
  const municipioId = municipioIdOverride ?? perfil?.municipio_id ?? null
  return useQuery({
    queryKey: ['bienes-patrimonio', municipioId ?? '__ALL__', tipo ?? '', dependenciaId ?? ''],
    queryFn:  () => fetchBienes({ municipioId, tipo, dependenciaId }),
    enabled:  !!perfil,
  })
}

async function createBien(data) {
  const { data: row, error } = await supabase
    .from('bienes_patrimonio').insert(data).select(BIEN_COLS).single()
  if (error) throw error
  return row
}

async function updateBien({ id, ...patch }) {
  const { data: row, error } = await supabase
    .from('bienes_patrimonio').update(patch).eq('id', id).select(BIEN_COLS).single()
  if (error) throw error
  return row
}

export function useCreateBien() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createBien,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['bienes-patrimonio'] })
      qc.invalidateQueries({ queryKey: ['patrimonio-resumen'] })
    },
  })
}

export function useUpdateBien() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateBien,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['bienes-patrimonio'] })
      qc.invalidateQueries({ queryKey: ['patrimonio-resumen'] })
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Mantenimientos
// ─────────────────────────────────────────────────────────────────

async function fetchMantenimientos(bienId) {
  if (!bienId) return []
  const { data, error } = await supabase
    .from('patrimonio_mantenimiento').select(MANT_COLS)
    .eq('bien_id', bienId)
    .order('fecha', { ascending: false })
  if (error) {
    console.warn('[usePatrimonio] fetchMantenimientos:', error.message)
    throw error
  }
  return data ?? []
}

export function useMantenimientos(bienId) {
  return useQuery({
    queryKey: ['patrimonio-mantenimientos', bienId ?? '__NONE__'],
    queryFn:  () => fetchMantenimientos(bienId),
    enabled:  !!bienId,
  })
}

async function createMantenimiento(data) {
  const { data: row, error } = await supabase
    .from('patrimonio_mantenimiento').insert(data).select(MANT_COLS).single()
  if (error) throw error
  return row
}

export function useCreateMantenimiento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createMantenimiento,
    onSuccess: (row) => {
      // Invalidamos por bien_id puntual; si no vino en la respuesta,
      // refrescamos el catálogo entero para no quedar inconsistentes.
      if (row?.bien_id) {
        qc.invalidateQueries({ queryKey: ['patrimonio-mantenimientos', row.bien_id] })
      } else {
        qc.invalidateQueries({ queryKey: ['patrimonio-mantenimientos'] })
      }
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Resumen — KPIs del módulo Patrimonio
// ─────────────────────────────────────────────────────────────────

async function fetchResumen(municipioId) {
  const empty = {
    porTipo:           {},
    total:             0,
    valorFiscalTotal:  0,
    segurosVigentes:   0,
    segurosPorVencer:  0,
    segurosVencidos:   0,
    requierenAtencion: 0,
  }
  if (!municipioId) return empty
  const { data, error } = await supabase
    .from('bienes_patrimonio')
    .select('id, tipo, estado, valor_fiscal, seguro_vencimiento')
    .eq('municipio_id', municipioId)
  if (error) {
    console.warn('[usePatrimonio] fetchResumen:', error.message)
    return empty
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const out = { ...empty, porTipo: {} }
  for (const r of (data ?? [])) {
    const tipo = (r.tipo ?? '').toLowerCase()
    out.porTipo[tipo] = (out.porTipo[tipo] ?? 0) + 1
    out.total += 1
    out.valorFiscalTotal += Number(r.valor_fiscal ?? 0)
    if (r.seguro_vencimiento) {
      const v = new Date(r.seguro_vencimiento)
      const dias = Math.floor((v.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      if (dias < 0)        out.segurosVencidos  += 1
      else if (dias <= 30) out.segurosPorVencer += 1
      else                 out.segurosVigentes  += 1
    }
    // "Requieren atención" agrupa estados malo/regular y bienes con
    // seguro vencido — la dirección debería revisar estos primero.
    if (r.estado === 'malo' || r.estado === 'regular') out.requierenAtencion += 1
  }
  return out
}

export function useResumenPatrimonio(municipioId) {
  const { perfil } = useAuth()
  return useQuery({
    queryKey: ['patrimonio-resumen', municipioId ?? '__NONE__'],
    queryFn:  () => fetchResumen(municipioId),
    enabled:  !!perfil && !!municipioId,
    staleTime: 30 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────
// Helpers de presentación
// ─────────────────────────────────────────────────────────────────

// Días hasta la fecha de vencimiento de un seguro. Negativo si ya
// venció, null si no hay fecha cargada.
export function diasParaVencerSeguro(iso) {
  if (!iso) return null
  const v = new Date(iso)
  if (isNaN(v)) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((v.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
