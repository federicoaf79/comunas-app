import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveMunicipioId } from './useEffectiveMunicipioId'
import { createAuditLog } from './useAuditLog'

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

const VALE_COLS = `
  id, municipio_id, descripcion, monto, cantidad, unidad, codigo,
  estado, vigencia_horas, emitido_en, canjeado_en,
  vecino:vecino_id(id, nombre_completo, dni),
  proveedor:proveedor_id(id, nombre),
  emisor:emitido_por(id, nombre)
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
