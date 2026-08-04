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
// con componentes que esperan fecha_hora (e.g. VecinoDashboard).
//
// `hora_inicio` ya viene de Postgres como "HH:MM:SS" -- agregarle otro
// ":00" (como hacía la versión anterior) arma un ISO inválido tipo
// "...T09:00:00:00-03:00" que dateOf()/timeOf() no pueden parsear y
// termina mostrándose crudo en pantalla.
//
// Turnos sin horario fijo (Agencia de Desarrollo, Polideportivo por
// franja) tienen `hora_inicio` null -- eso es un dato válido, no un
// error. Sin este caso, fecha_hora quedaba `undefined` y hasta la
// FECHA (que sí existe) se mostraba como "—". Mismo criterio que
// turnoFechaHora() en DependenciaGestion.jsx: separar fecha de hora,
// nunca asumir que si falta la hora falta todo. Acá se rellena con
// mediodía solo para que dateOf()/timeOf() tengan un ISO válido que
// parsear -- los componentes de "Mis turnos" chequean
// `turno.hora_inicio` aparte antes de mostrar la hora, así que ese
// mediodía nunca llega a la pantalla.
function normalizarTurno(t) {
  if (!t) return t
  if (t.fecha_hora) return t
  if (!t.fecha) return t
  const hora = t.hora_inicio ? t.hora_inicio : '12:00:00'
  return { ...t, fecha_hora: `${t.fecha}T${hora}${ARG_OFFSET}` }
}

const ARG_OFFSET = '-03:00' // Timezone Argentina

// Mis turnos — todos los turnos del vecino (futuros + históricos),
// orden DESC por fecha + hora_inicio. El componente decide cómo agruparlos.
async function fetchTurnosByVecino(vecinoId, clientType) {
  if (!vecinoId) return []
  const client = clientType === 'auth' ? supabase : supabaseAnon
  const { data, error } = await client
    .from('turnos_agenda')
    .select(TURNO_COLS)
    .eq('vecino_id', vecinoId)
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: false })
    .limit(50)
  if (error) throw error
  // Normalizar turnos para que tengan fecha_hora
  return (data ?? []).map(normalizarTurno)
}

export function useTurnosVecino(vecinoId, client = supabaseAnon, ready = true) {
  // Determinar el tipo de cliente una sola vez, evitando recalcular en cada render
  // Usamos un string estable como parte de la queryKey
  const clientType = client === supabase ? 'auth' : 'anon'
  const enabled = !!vecinoId && ready
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
  'id, vecino_id, tipo, descripcion, ubicacion, estado, prioridad, canal, created_at, fotos_urls'

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

export function useReclamosVecino(vecinoId, client = supabaseAnon, ready = true) {
  const clientType = client === supabase ? 'auth' : 'anon'
  const enabled = !!vecinoId && ready
  console.log('[useReclamosVecino] HOOK CALLED', { vecinoId, clientType, ready, enabled })
  return useQuery({
    queryKey: ['vecino', 'reclamos', vecinoId ?? '__none__', clientType],
    queryFn:  () => fetchReclamosByVecino(vecinoId, clientType),
    enabled,
  })
}

// ─────────────────────────────────────────────────────────────────
// Atenciones del vecino (HC completa en el portal)
//
// Trae todas las atenciones del vecino con joins a profesional y
// dependencia. Para uso en el portal del vecino.
// ─────────────────────────────────────────────────────────────────

// La HC completa (asientos del profesional) ya NO se trae con un
// SELECT directo a `atenciones` -- se lee vía la RPC
// historia_clinica_vecino() (SECURITY DEFINER, identidad por
// current_vecino_id()), que devuelve solo los campos pensados para
// que el paciente los vea (nunca anamnesis/examen_fisico/receta) y
// solo atenciones finalizadas -- whitelist de estado
// ('atendido'/'cerrada'/'derivada'), nunca 'borrador'. Ver
// supabase/migrations/20260803_mi_historia_clinica_rpc.sql.
//
// El nombre real en prod es `historia_clinica_vecino`, no
// `mi_historia_clinica` como decía la primera versión de este
// archivo/la migración -- confirmado 2026-08-03 llamando la RPC en
// vivo (PGRST202 sugirió el nombre correcto). Este archivo quedó
// alineado al nombre que ya existe en la base, no al revés.
//
// La RPC exige sesión autenticada real (revocada para anon) -- por
// eso `fetchAtencionesVecino` ya no elige entre supabase/supabaseAnon
// según `clientType`: solo tiene sentido llamarla con el cliente
// autenticado, y el hook queda deshabilitado si no lo es.
async function fetchAtencionesVecino() {
  const { data, error } = await supabase.rpc('historia_clinica_vecino')
  if (error) throw error
  return data ?? []
}

export function useAtencionesVecino(vecinoId, client = supabaseAnon, ready = true) {
  const clientType = client === supabase ? 'auth' : 'anon'
  const enabled = !!vecinoId && ready && clientType === 'auth'
  return useQuery({
    queryKey: ['vecino', 'atenciones', vecinoId ?? '__none__', clientType],
    queryFn:  fetchAtencionesVecino,
    enabled,
  })
}

// ─────────────────────────────────────────────────────────────────
// Derivaciones del vecino (internas/digitales + físicas) — Fase 4.
//
// Se embebe dependencia_destino (nombre) pero NO profesional: la
// tabla `profesionales` solo es legible por staff autenticado (sin
// policy pública para vecinos), así que ese embed devolvería null
// del lado del portal. dependencia_destino sí es legible por ambos.
// ─────────────────────────────────────────────────────────────────

const ORDEN_DERIVACION_COLS = `
  id, vecino_id, profesional_id, dependencia_destino_id, especialidad_destino,
  diagnostico, indicaciones, origen, estado, turno_id, created_at,
  archivo_url, archivo_nombre,
  dependencia_destino:dependencia_destino_id ( id, nombre )
`

async function fetchOrdenesDerivacionVecino(vecinoId, clientType) {
  if (!vecinoId) return []
  const client = clientType === 'auth' ? supabase : supabaseAnon
  const { data, error } = await client
    .from('ordenes_derivacion')
    .select(ORDEN_DERIVACION_COLS)
    .eq('vecino_id', vecinoId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return data ?? []
}

export function useOrdenesDerivacionVecino(vecinoId, client = supabaseAnon, ready = true) {
  const clientType = client === supabase ? 'auth' : 'anon'
  const enabled = !!vecinoId && ready
  return useQuery({
    queryKey: ['vecino', 'ordenes-derivacion', vecinoId ?? '__none__', clientType],
    queryFn:  () => fetchOrdenesDerivacionVecino(vecinoId, clientType),
    enabled,
  })
}

// Documentos de una atención específica (para mostrar en el portal)
async function fetchDocumentosAtencion(atencionId, clientType) {
  if (!atencionId) return []
  const client = clientType === 'auth' ? supabase : supabaseAnon
  const { data, error } = await client
    .from('hc_documentos')
    .select('id, atencion_id, vecino_id, tipo, nombre, storage_path, fecha, created_at')
    .eq('atencion_id', atencionId)
    .order('created_at', { ascending: false })
  if (error) throw error

  return (data ?? []).map(d => ({
    ...d,
    nombre_archivo: d.nombre || filenameFromPath(d.storage_path),
  }))
}

function filenameFromPath(path) {
  if (!path) return ''
  const idx = path.lastIndexOf('/')
  return idx === -1 ? path : path.slice(idx + 1)
}

// documentos-hc es un bucket PRIVADO — no hay URL pública. Firmar bajo
// demanda (al abrir el documento), nunca al listar: firmar en el
// .map() de fetchDocumentosAtencion dispararía N requests por render y
// la firma vence mientras la pantalla sigue abierta. `client` tiene
// que ser el mismo que resolvió la lista (el vecino solo puede firmar
// sus propios documentos, autenticado).
export async function fetchDocumentoSignedUrl(storagePath, client = supabaseAnon) {
  if (!storagePath) return null
  const { data, error } = await client.storage.from('documentos-hc').createSignedUrl(storagePath, 3600)
  if (error) throw error
  return data.signedUrl
}

export function useDocumentosAtencion(atencionId, client = supabaseAnon) {
  // Determinar el tipo de cliente una sola vez, evitando recalcular en cada render
  const clientType = client === supabase ? 'auth' : 'anon'
  return useQuery({
    queryKey: ['vecino', 'documentos', atencionId ?? '__none__', clientType],
    queryFn:  () => fetchDocumentosAtencion(atencionId, clientType),
    enabled:  !!atencionId,
    staleTime: 5 * 60 * 1000, // 5 minutos
  })
}
