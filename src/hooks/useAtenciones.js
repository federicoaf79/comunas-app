import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// =============================================================
// useAtenciones — asiento clínico de la Sala PA.
//
// Tablas: atenciones + atencion_insumos (migration 20260511).
//
// Flujo típico:
//   1) operador click en un turno → useAtencionesPorTurno trae la
//      atención si ya existe (estado 'borrador') o devuelve null.
//   2) crea/actualiza con useCreateAtencion / useUpdateAtencion.
//   3) agrega insumos vía useCreateAtencionInsumo (queda pendiente
//      el descuento del stock).
//   4) cierra la atención con useCloseAtencion → marca estado
//      'cerrada', descuenta insumos del inventario via movimientos
//      tipo='salida', y marca el turno como 'atendido'.
//
// El descuento de stock vive cliente-side (sin trigger DB) porque
// usamos la misma función ya probada en useInventario.createMovimiento.
// =============================================================

const ATENCION_COLS = `
  id, municipio_id, turno_id, vecino_id, profesional_id, fecha_hora,
  motivo, anamnesis, examen_fisico, diagnostico, tratamiento,
  indicaciones, proxima_consulta, estado, derivacion_destino,
  created_at, updated_at,
  profesional:profesional_id ( id, nombre ),
  vecino:vecino_id ( id, dni, nombre, apellido, nombre_completo, fecha_nac )
`

const INSUMO_COLS = `
  id, atencion_id, inventario_id, cantidad, unidad, created_at,
  inventario:inventario_id ( id, nombre, unidad, stock_actual )
`

// ─────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────

// Atención asociada a un turno. Devuelve null cuando todavía no se
// abrió una atención para ese turno. Si hubiera varias filas (caso
// excepcional), retorna la más reciente.
export function useAtencionPorTurno(turnoId) {
  return useQuery({
    queryKey: ['atencion', 'turno', turnoId ?? '__none__'],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('atenciones')
        .select(ATENCION_COLS)
        .eq('turno_id', turnoId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!turnoId,
  })
}

// Historia clínica completa del vecino (todas las atenciones,
// ordenadas DESC). Si limit no se pasa trae todas.
export function useAtencionesVecino(vecinoId, { limit } = {}) {
  return useQuery({
    queryKey: ['atenciones', 'vecino', vecinoId ?? '__none__', limit ?? 'all'],
    queryFn:  async () => {
      let q = supabase
        .from('atenciones')
        .select(ATENCION_COLS)
        .eq('vecino_id', vecinoId)
        .order('fecha_hora', { ascending: false })
      if (limit) q = q.limit(limit)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    enabled: !!vecinoId,
  })
}

// Insumos cargados en una atención (con join al item de inventario
// para mostrar nombre y unidad sin segundo round-trip).
export function useAtencionInsumos(atencionId) {
  return useQuery({
    queryKey: ['atencion-insumos', atencionId ?? '__none__'],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('atencion_insumos')
        .select(INSUMO_COLS)
        .eq('atencion_id', atencionId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!atencionId,
  })
}

// Catálogo de insumos asignables a una atención: filtrado por
// municipio + categorías médicas + (opcional) dependencia salud.
// Si `dependenciaId` viene, también acota a esa dependencia.
const CATEGORIAS_SALA = ['insumo_medico', 'medicamento', 'limpieza', 'Insumos', 'Salud']
export function useInsumosDisponibles({ municipioId, dependenciaId } = {}) {
  return useQuery({
    queryKey: ['insumos-disponibles', municipioId ?? '__NONE__', dependenciaId ?? '__ANY__'],
    queryFn:  async () => {
      let q = supabase
        .from('inventario')
        .select('id, nombre, unidad, stock_actual, categoria, dependencia_id, precio_referencia')
        .order('nombre', { ascending: true })
      if (municipioId)   q = q.eq('municipio_id', municipioId)
      if (dependenciaId) q = q.eq('dependencia_id', dependenciaId)
      // Filtro por categorías médicas. Tolerante con variaciones de
      // capitalización por si el seed real difiere.
      q = q.in('categoria', CATEGORIAS_SALA)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    enabled: !!municipioId,
  })
}

// ─────────────────────────────────────────────────────────────────
// Mutaciones
// ─────────────────────────────────────────────────────────────────

async function createAtencion(data) {
  const payload = { ...data, estado: data.estado ?? 'borrador' }
  const { data: row, error } = await supabase
    .from('atenciones').insert(payload).select(ATENCION_COLS).single()
  if (error) throw error
  return row
}

async function updateAtencion({ id, ...patch }) {
  patch.updated_at = new Date().toISOString()
  const { data: row, error } = await supabase
    .from('atenciones').update(patch).eq('id', id).select(ATENCION_COLS).single()
  if (error) throw error
  return row
}

async function createAtencionInsumo(data) {
  const { data: row, error } = await supabase
    .from('atencion_insumos').insert(data).select(INSUMO_COLS).single()
  if (error) throw error
  return row
}

async function deleteAtencionInsumo(id) {
  const { error } = await supabase.from('atencion_insumos').delete().eq('id', id)
  if (error) throw error
}

// Cierra la atención: marca estado='cerrada', descuenta los insumos
// del stock e inserta movimientos. Si todos los insumos descuentan
// OK, marca el turno como 'atendido' (best-effort).
//
// Sin transacción real client-side — si algún paso falla, se loggea
// y el caller decide. Lo razonable es revisar manualmente el stock
// si se reportó error en el descuento.
async function closeAtencion({ atencionId, registradoPor }) {
  // 1) traer atención + insumos
  const { data: atencion, error: aErr } = await supabase
    .from('atenciones').select('id, estado, turno_id').eq('id', atencionId).single()
  if (aErr) throw aErr

  const { data: insumos, error: iErr } = await supabase
    .from('atencion_insumos').select('id, inventario_id, cantidad').eq('atencion_id', atencionId)
  if (iErr) throw iErr

  // 2) por cada insumo: leer stock_actual → UPDATE − cantidad →
  //    INSERT movimientos_inventario tipo='salida'.
  const errores = []
  for (const ins of (insumos ?? [])) {
    try {
      const { data: inv, error: rErr } = await supabase
        .from('inventario').select('id, stock_actual').eq('id', ins.inventario_id).single()
      if (rErr) throw rErr
      const anterior  = Number(inv.stock_actual ?? 0)
      const cantidad  = Number(ins.cantidad)
      const posterior = anterior - cantidad
      const { error: upErr } = await supabase
        .from('inventario').update({ stock_actual: posterior }).eq('id', ins.inventario_id)
      if (upErr) throw upErr
      const { error: movErr } = await supabase
        .from('movimientos_inventario').insert({
          inventario_id:   ins.inventario_id,
          tipo:            'salida',
          cantidad,
          stock_anterior:  anterior,
          stock_posterior: posterior,
          motivo:          `Atención clínica ${atencionId.slice(0, 8)}`,
          registrado_por:  registradoPor ?? null,
          fecha:           new Date().toISOString(),
        })
      if (movErr) throw movErr
    } catch (e) {
      console.warn('[useAtenciones] descuento insumo falló:', e.message)
      errores.push(e.message)
    }
  }

  // 3) marcar atención como cerrada
  const { data: cerrada, error: cErr } = await supabase
    .from('atenciones')
    .update({ estado: 'cerrada', updated_at: new Date().toISOString() })
    .eq('id', atencionId)
    .select(ATENCION_COLS)
    .single()
  if (cErr) throw cErr

  // 4) marcar el turno como atendido (best-effort)
  if (atencion.turno_id) {
    const { error: tErr } = await supabase
      .from('turnos').update({ estado: 'atendido' }).eq('id', atencion.turno_id)
    if (tErr) console.warn('[useAtenciones] update turno→atendido falló:', tErr.message)
  }

  return { atencion: cerrada, errores }
}

export function useCreateAtencion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createAtencion,
    onSuccess:  (row) => {
      qc.invalidateQueries({ queryKey: ['atencion', 'turno', row.turno_id] })
      qc.invalidateQueries({ queryKey: ['atenciones', 'vecino', row.vecino_id] })
    },
  })
}

export function useUpdateAtencion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateAtencion,
    onSuccess:  (row) => {
      qc.invalidateQueries({ queryKey: ['atencion', 'turno', row.turno_id] })
      qc.invalidateQueries({ queryKey: ['atenciones', 'vecino', row.vecino_id] })
    },
  })
}

export function useCreateAtencionInsumo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createAtencionInsumo,
    onSuccess:  (row) => qc.invalidateQueries({ queryKey: ['atencion-insumos', row.atencion_id] }),
  })
}

export function useDeleteAtencionInsumo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id /*, atencionId */ }) => deleteAtencionInsumo(id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['atencion-insumos', vars.atencionId] })
    },
  })
}

export function useCloseAtencion() {
  const qc = useQueryClient()
  const { perfil } = useAuth()
  return useMutation({
    mutationFn: ({ atencionId }) => closeAtencion({ atencionId, registradoPor: perfil?.id }),
    onSuccess:  ({ atencion }) => {
      qc.invalidateQueries({ queryKey: ['atencion', 'turno', atencion.turno_id] })
      qc.invalidateQueries({ queryKey: ['atenciones', 'vecino', atencion.vecino_id] })
      qc.invalidateQueries({ queryKey: ['atencion-insumos', atencion.id] })
      qc.invalidateQueries({ queryKey: ['inventario'] })
      qc.invalidateQueries({ queryKey: ['mov-inventario'] })
      qc.invalidateQueries({ queryKey: ['turnos'] })
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Documentos adjuntos (hc_documentos)
//
// Schema real: id, municipio_id, vecino_id, consulta_id, tipo,
// descripcion, storage_path, mime_type, uploaded_by, created_at,
// atencion_id (migration 20260511_atencion_documentos).
//
// `tipo` está restringido por check constraint a:
//   ('estudio','receta','informe','imagen','otro')
// El UI mapea "Derivación" → 'informe' para encajar.
// ─────────────────────────────────────────────────────────────────

const DOC_COLS = `
  id, municipio_id, vecino_id, atencion_id, consulta_id,
  tipo, descripcion, storage_path, mime_type, uploaded_by, created_at
`

export function useDocumentosAtencion(atencionId) {
  return useQuery({
    queryKey: ['hc-documentos', 'atencion', atencionId ?? '__none__'],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('hc_documentos')
        .select(DOC_COLS)
        .eq('atencion_id', atencionId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []).map(d => ({
        ...d,
        public_url: publicUrlFor(d.storage_path),
        nombre_archivo: filenameFromPath(d.storage_path),
      }))
    },
    enabled: !!atencionId,
  })
}

function filenameFromPath(path) {
  if (!path) return ''
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

function publicUrlFor(path) {
  if (!path) return null
  const { data } = supabase.storage.from('documentos-hc').getPublicUrl(path)
  return data?.publicUrl ?? null
}

// Sanitiza un filename para usarlo en el path del bucket: minúsculas,
// guiones, sin acentos, sin caracteres raros. Conserva la extensión.
function safeFilename(name) {
  if (!name) return `doc-${Date.now()}`
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'doc'
  const ext = dot > 0 ? name.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '') : ''
  return `${base}${ext}`
}

async function uploadDocumento({
  file, atencionId, vecinoId, municipioId, uploadedBy,
  tipo, descripcion,
}) {
  if (!file || !atencionId || !vecinoId || !municipioId) {
    throw new Error('Faltan datos para subir el documento.')
  }
  const path = `${municipioId}/${vecinoId}/${atencionId}/${Date.now()}_${safeFilename(file.name)}`
  const { error: upErr } = await supabase.storage
    .from('documentos-hc')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert:      false,
    })
  if (upErr) {
    console.error('[useAtenciones] upload documento:', upErr)
    throw new Error(upErr.message ?? 'No pudimos subir el archivo.')
  }
  const payload = {
    municipio_id: municipioId,
    vecino_id:    vecinoId,
    atencion_id:  atencionId,
    tipo,                                  // estudio|receta|informe|imagen|otro
    descripcion:  descripcion?.trim() || null,
    storage_path: path,
    mime_type:    file.type || null,
    uploaded_by:  uploadedBy ?? null,
  }
  const { data: row, error: insErr } = await supabase
    .from('hc_documentos').insert(payload).select(DOC_COLS).single()
  if (insErr) {
    // Si el INSERT falla, el archivo quedó huérfano en storage.
    // Best-effort cleanup.
    await supabase.storage.from('documentos-hc').remove([path]).catch(() => {})
    throw insErr
  }
  return row
}

export function useUploadDocumento() {
  const qc = useQueryClient()
  const { perfil } = useAuth()
  return useMutation({
    mutationFn: (vars) => uploadDocumento({ uploadedBy: perfil?.id, ...vars }),
    onSuccess:  (row) => qc.invalidateQueries({ queryKey: ['hc-documentos', 'atencion', row.atencion_id] }),
  })
}

async function deleteDocumento({ id, storagePath }) {
  // Primero saco el archivo del bucket, después la fila. Si falla
  // el storage seguimos con el delete de la fila para no dejar
  // referencias colgadas.
  if (storagePath) {
    const { error } = await supabase.storage.from('documentos-hc').remove([storagePath])
    if (error) console.warn('[useAtenciones] remove storage:', error.message)
  }
  const { error } = await supabase.from('hc_documentos').delete().eq('id', id)
  if (error) throw error
}

export function useDeleteDocumento() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: deleteDocumento,
    onSuccess:  (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['hc-documentos', 'atencion', vars.atencionId] })
    },
  })
}

// Helper: edad en años a partir de fecha_nac (YYYY-MM-DD).
export function edadDesdeFechaNac(iso) {
  if (!iso) return null
  const fn = new Date(iso)
  if (isNaN(fn)) return null
  const hoy = new Date()
  let edad = hoy.getFullYear() - fn.getFullYear()
  const m = hoy.getMonth() - fn.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) edad--
  return edad
}
