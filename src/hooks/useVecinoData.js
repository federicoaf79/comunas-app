import { useQuery } from '@tanstack/react-query'
import { supabaseAnon } from '../lib/supabaseAnon'
import { supabase } from '../lib/supabase'

// =============================================================
// Hooks de datos del Portal del Vecino
//
// IMPORTANTE: Estos hooks ahora aceptan un parámetro `client`
// opcional para usar el cliente autenticado (supabase) en vez
// de supabaseAnon. El dashboard de cuenta completa (VecinoDashboard)
// debe pasar `supabase` para que las RLS con current_vecino_id()
// funcionen correctamente. El acceso rápido (sin sesión) sigue
// usando supabaseAnon por defecto.
// =============================================================

const TURNO_COLS = `
  id, fecha, hora_inicio, hora_fin, estado, canal, numero_turno, motivo, metadata,
  dependencia:dependencia_id ( id, nombre )
`

// Combina fecha + hora_inicio en un timestamp ISO para compatibilidad
// con componentes que esperan fecha_hora (e.g. VecinoDashboard)
function normalizarTurno(t) {
  if (!t) return t
  // Si ya tiene fecha_hora, devolverlo tal cual
  if (t.fecha_hora) return t
  // Combinar fecha + hora_inicio → fecha_hora
  if (t.fecha && t.hora_inicio) {
    return {
      ...t,
      fecha_hora: `${t.fecha}T${t.hora_inicio}:00${ARG_OFFSET}`
    }
  }
  return t
}

const ARG_OFFSET = '-03:00' // Timezone Argentina

// Mis turnos — todos los turnos del vecino (futuros + históricos),
// orden DESC por fecha + hora_inicio. El componente decide cómo agruparlos.
async function fetchTurnosByVecino(vecinoId, clientType) {
  console.log('[fetchTurnosByVecino] CALLED', { vecinoId, clientType })
  if (!vecinoId) {
    console.log('[fetchTurnosByVecino] NO vecinoId, returning []')
    return []
  }
  const client = clientType === 'auth' ? supabase : supabaseAnon
  console.log('[fetchTurnosByVecino] FETCHING from DB...')
  const { data, error } = await client
    .from('turnos_agenda')
    .select(TURNO_COLS)
    .eq('vecino_id', vecinoId)
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: false })
    .limit(50)
  if (error) {
    console.error('[fetchTurnosByVecino] ERROR', error)
    throw error
  }
  console.log('[fetchTurnosByVecino] SUCCESS', { rowCount: data?.length })
  // Normalizar turnos para que tengan fecha_hora
  return (data ?? []).map(normalizarTurno)
}

export function useTurnosVecino(vecinoId, client = supabaseAnon) {
  // Determinar el tipo de cliente una sola vez, evitando recalcular en cada render
  // Usamos un string estable como parte de la queryKey
  const clientType = client === supabase ? 'auth' : 'anon'
  const enabled = !!vecinoId
  console.log('[useTurnosVecino] HOOK CALLED', { vecinoId, clientType, enabled })
  return useQuery({
    queryKey: ['vecino', 'turnos', vecinoId ?? '__none__', clientType],
    queryFn:  () => fetchTurnosByVecino(vecinoId, clientType),
    enabled,
  })
}

// HC — vía RPC que verifica DNI + teléfono y devuelve sólo
// id/fecha/motivo/medico_nombre. Diagnóstico/receta NO se exponen
// por anon. La RPC limita a las últimas 3 (cap de la migración).
async function fetchHCPublica({ dni, telefono }) {
  if (!dni || !telefono) return []
  const { data, error } = await supabaseAnon.rpc('consultas_publicas_por_vecino', {
    p_dni:      dni,
    p_telefono: telefono,
  })
  if (error) throw error
  return data ?? []
}

export function useHCVecino({ dni, telefono }) {
  return useQuery({
    queryKey: ['vecino', 'hc', dni ?? '__none__', telefono ?? '__none__'],
    queryFn:  () => fetchHCPublica({ dni, telefono }),
    enabled:  !!dni && !!telefono,
  })
}

// Refresh del vecino contra la DB — útil cuando el vecino entró
// a su área y los operadores actualizan su perfil. Refresca los
// datos del context de manera explícita.
export async function refetchVecinoById(vecinoId) {
  if (!vecinoId) return null
  const { data, error } = await supabaseAnon
    .from('vecinos')
    .select('id, dni, nombre, apellido, nombre_completo, telefono, email, fecha_nac, sexo, direccion, localidad, barrio, municipio_id, grupo_sanguineo, alergias, sin_alergias_conocidas, contacto_emergencia_nombre, contacto_emergencia_telefono')
    .eq('id', vecinoId)
    .maybeSingle()
  if (error) {
    console.warn('[useVecinoData] refetchVecinoById error:', error.message)
    return null
  }
  return data
}

// Normaliza un teléfono a "los últimos 10 dígitos" — alcanza para
// matchear celulares argentinos sin importar el prefijo: +54, 54,
// 0 inicial, 9 móvil, espacios o guiones, todos colapsan al mismo
// número. Cubre los casos típicos: '+54 9 3854 123456',
// '543854123456', '3854123456', '0385 4-12-3456' → '3854123456'.
function normalizeTel(tel) {
  return String(tel ?? '').replace(/\D/g, '').slice(-10)
}

// Login del vecino — match DNI + teléfono. Devuelve el vecino si
// matchea, null si no. NO crea sesión — eso lo hace el llamador.
export async function findVecinoByDniTelefono({ dni, telefono }) {
  const dniClean   = (dni ?? '').trim()
  const telInputN  = normalizeTel(telefono)
  if (!dniClean || !telInputN) return null

  const { data, error } = await supabaseAnon
    .from('vecinos')
    .select('id, dni, nombre, apellido, nombre_completo, telefono, email, fecha_nac, sexo, direccion, localidad, barrio, municipio_id, grupo_sanguineo, alergias, sin_alergias_conocidas, contacto_emergencia_nombre, contacto_emergencia_telefono')
    .eq('dni', dniClean)
    .limit(5)
  if (error) throw error
  if (!data || data.length === 0) return null

  // Comparación equality sobre los últimos 10 dígitos. Si el
  // registro guardado tiene menos de 10 dígitos (raro) la función
  // los compara igual contra el suffix del input.
  for (const v of data) {
    if (normalizeTel(v.telefono) === telInputN) {
      return v
    }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────
// Reclamos del vecino (lectura desde el área "Mi cuenta")
//
// La policy "vecino ve sus reclamos" (migration
// 20260509000004_reclamos_anon_select) abre SELECT a anon SOLO
// para filas con vecino_id != null. El filtro por id-del-vecino se
// hace en el cliente, así que vale el mismo trade-off que el
// resto de "Mi cuenta": cualquiera con la anon key podría
// enumerar reclamos vinculados a un vecino. Aceptable para un
// portal sin auth real; si la privacidad lo requiere se puede
// reemplazar por una RPC con verificación DNI+teléfono.
// ─────────────────────────────────────────────────────────────────

const RECLAMO_COLS_PUBLIC =
  'id, vecino_id, tipo, descripcion, ubicacion, estado, prioridad, canal, created_at'

async function fetchReclamosByVecino(vecinoId, clientType) {
  console.log('[fetchReclamosByVecino] CALLED', { vecinoId, clientType })
  if (!vecinoId) return []
  const client = clientType === 'auth' ? supabase : supabaseAnon
  const { data, error } = await client
    .from('reclamos')
    .select(RECLAMO_COLS_PUBLIC)
    .eq('vecino_id', vecinoId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    console.error('[fetchReclamosByVecino] ERROR', error)
    throw error
  }
  console.log('[fetchReclamosByVecino] SUCCESS', { rowCount: data?.length })
  return data ?? []
}

export function useReclamosVecino(vecinoId, client = supabaseAnon) {
  const clientType = client === supabase ? 'auth' : 'anon'
  return useQuery({
    queryKey: ['vecino', 'reclamos', vecinoId ?? '__none__', clientType],
    queryFn:  () => fetchReclamosByVecino(vecinoId, clientType),
    enabled:  !!vecinoId,
  })
}

// ─────────────────────────────────────────────────────────────────
// Atenciones del vecino (HC completa en el portal)
//
// Trae todas las atenciones del vecino con joins a profesional y
// dependencia. Para uso en el portal del vecino.
// ─────────────────────────────────────────────────────────────────

const ATENCION_COLS_PUBLIC = `
  id, vecino_id, dependencia_id, profesional_id, fecha_hora,
  motivo, diagnostico, receta,
  profesional:profesional_id ( id, nombre ),
  dependencia:dependencia_id ( id, nombre )
`

async function fetchAtencionesVecino(vecinoId, clientType) {
  console.log('[fetchAtencionesVecino] CALLED', { vecinoId, clientType })
  if (!vecinoId) return []
  const client = clientType === 'auth' ? supabase : supabaseAnon
  const { data, error } = await client
    .from('atenciones')
    .select(ATENCION_COLS_PUBLIC)
    .eq('vecino_id', vecinoId)
    .order('fecha_hora', { ascending: false })
    .limit(100)
  if (error) {
    console.error('[fetchAtencionesVecino] ERROR', error)
    throw error
  }
  console.log('[fetchAtencionesVecino] SUCCESS', { rowCount: data?.length })
  return data ?? []
}

export function useAtencionesVecino(vecinoId, client = supabaseAnon) {
  const clientType = client === supabase ? 'auth' : 'anon'
  return useQuery({
    queryKey: ['vecino', 'atenciones', vecinoId ?? '__none__', clientType],
    queryFn:  () => fetchAtencionesVecino(vecinoId, clientType),
    enabled:  !!vecinoId,
  })
}

// Documentos de una atención específica (para mostrar en el portal)
async function fetchDocumentosAtencion(atencionId) {
  if (!atencionId) return []
  const { data, error } = await supabaseAnon
    .from('hc_documentos')
    .select('id, atencion_id, tipo, descripcion, storage_path, created_at')
    .eq('atencion_id', atencionId)
    .order('created_at', { ascending: false })
  if (error) throw error

  // Generar URLs públicas para cada documento
  return (data ?? []).map(d => ({
    ...d,
    public_url: publicUrlFor(d.storage_path),
    nombre_archivo: filenameFromPath(d.storage_path),
  }))
}

function filenameFromPath(path) {
  if (!path) return ''
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

function publicUrlFor(path) {
  if (!path) return null
  const { data } = supabaseAnon.storage.from('documentos-hc').getPublicUrl(path)
  return data?.publicUrl ?? null
}

export function useDocumentosAtencion(atencionId) {
  return useQuery({
    queryKey: ['vecino', 'documentos', atencionId ?? '__none__'],
    queryFn:  () => fetchDocumentosAtencion(atencionId),
    enabled:  !!atencionId,
    staleTime: 5 * 60 * 1000, // 5 minutos
  })
}
