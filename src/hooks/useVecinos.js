import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveMunicipioId } from './useEffectiveMunicipioId'
import { createAuditLog } from './useAuditLog'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[useVecinos] audit log:', e.message))
}

const PAGE_SIZE  = 50
const TIMEOUT_MS = 8000

// COLS mínimas para el listado del CRM. Si en algún momento se
// necesitan campos adicionales en otra vista (detalle, edición),
// se hace un select propio con sus columnas.
const COLS = 'id, nombre_completo, apellido, nombre, dni, barrio, telefono, zona, email, portal_estado'

// Columnas para la ficha de detalle del vecino — incluye datos
// personales que el listado no necesita (email, dirección, sexo, etc.).
const DETAIL_COLS = 'id, municipio_id, dni, nombre_completo, apellido, nombre, telefono, email, barrio, direccion, fecha_nac, sexo, localidad, zona'

// Escapa wildcards de ilike (% y _) para que no se interpreten como
// comodines cuando el usuario los tipee en el buscador.
function escapeLike(s) {
  return s.replace(/[%_\\]/g, m => `\\${m}`)
}

// Lista vecinos. Si municipioId es null/undefined (caso superadmin
// sin municipio asignado) la query NO filtra por municipio_id —
// trae todos los vecinos del sistema. La RLS (`vecinos staff lee
// municipio` con cláusula `is_superadmin()`) habilita ese acceso.
//
// Timeout de 8s: si el fetch no responde, el AbortController dispara
// y la query falla con un error claro en lugar de quedar colgada.
export async function fetchVecinos(municipioId, { search = '', barrio = '', zona = '', portal_estado = '', page = 0 } = {}) {
  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let q = supabase
    .from('vecinos')
    .select(COLS, { count: 'exact' })
    .order('apellido', { ascending: true })
    .order('nombre',   { ascending: true })
    .abortSignal(controller.signal)

  // Filtro por municipio sólo si hay uno asignado. Para superadmin
  // (municipioId null) NO agregamos .eq y la query devuelve TODOS
  // los vecinos de TODOS los municipios.
  if (municipioId != null) q = q.eq('municipio_id', municipioId)
  if (barrio)              q = q.eq('barrio', barrio)
  if (zona)                q = q.eq('zona', zona)
  if (portal_estado)       q = q.eq('portal_estado', portal_estado)

  if (search.trim()) {
    const pattern = `%${escapeLike(search.trim())}%`
    q = q.or(`apellido.ilike.${pattern},nombre.ilike.${pattern},dni.ilike.${pattern}`)
  }

  const from = page * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1
  q = q.range(from, to)

  try {
    const { data, error, count } = await q
    clearTimeout(timeoutId)
    if (error) {
      console.error('[useVecinos] fetchVecinos error:', error)
      throw error
    }
    return { rows: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE }
  } catch (e) {
    clearTimeout(timeoutId)
    if (controller.signal.aborted || e?.name === 'AbortError' || /abort/i.test(e?.message ?? '')) {
      const err = new Error(`fetchVecinos timeout: la query no respondió en ${TIMEOUT_MS}ms`)
      console.error('[useVecinos] fetchVecinos timeout:', err.message)
      throw err
    }
    throw e
  }
}

// Trae un único vecino por id. Devuelve null si no existe (o si la
// RLS niega el acceso). Mismo patrón de timeout que fetchVecinos.
export async function fetchVecino(id) {
  if (!id) return null

  const controller = new AbortController()
  const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const { data, error } = await supabase
      .from('vecinos')
      .select(DETAIL_COLS)
      .eq('id', id)
      .abortSignal(controller.signal)
      .maybeSingle()
    clearTimeout(timeoutId)
    if (error) {
      console.error('[useVecinos] fetchVecino error:', error)
      throw error
    }
    return data
  } catch (e) {
    clearTimeout(timeoutId)
    if (controller.signal.aborted || e?.name === 'AbortError' || /abort/i.test(e?.message ?? '')) {
      const err = new Error(`fetchVecino timeout: la query no respondió en ${TIMEOUT_MS}ms`)
      console.error('[useVecinos] fetchVecino timeout:', err.message)
      throw err
    }
    throw e
  }
}

export async function createVecino(data) {
  const { data: row, error } = await supabase
    .from('vecinos')
    .insert(data)
    .select(COLS)
    .single()
  if (error) throw error
  logAudit({
    accion: 'create', entidad: 'vecinos', entidadId: row.id,
    descripcion: `Alta de vecino — ${row.nombre_completo ?? `${row.nombre ?? ''} ${row.apellido ?? ''}`.trim()} (DNI ${row.dni ?? '—'})`,
  })
  return row
}

// No se registran los valores editados en metadata (alergias,
// teléfono, contacto de emergencia, etc. son datos sensibles) —
// solo qué campos cambiaron, no su contenido.
export async function updateVecino(id, data) {
  const { data: row, error } = await supabase
    .from('vecinos')
    .update(data)
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) throw error
  logAudit({
    accion: 'update', entidad: 'vecinos', entidadId: id,
    descripcion: `Datos actualizados — ${row.nombre_completo ?? id}`,
    metadata: { campos: Object.keys(data) },
  })
  return row
}

// Hook React: encapsula el estado de carga, paginación y mutaciones.
// El municipio_id se resuelve vía useEffectiveMunicipioId — para
// admin_comuna/operador devuelve el municipio del perfil; para
// superadmin sin municipio asignado cae al primer municipio activo.
// Sin este fallback, el listado quedaba sin datos para superadmin
// porque la RLS o el query devolvían 0 filas.
export function useVecinos({ search = '', barrio = '', zona = '', portal_estado = '', page = 0 } = {}) {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const { municipioId } = useEffectiveMunicipioId()

  // La query se dispara apenas haya perfil cargado. NO requiere
  // municipio: superadmin con municipio_id = null debe ver todos
  // los vecinos del sistema (filtro por municipio se omite en
  // fetchVecinos cuando municipioId es null).
  const enabled = !!perfil

  const query = useQuery({
    // Array de primitivos: TanStack puede comparar más rápido y
    // descartamos cualquier issue con object identity en la key.
    // Para municipioId null usamos el sentinel '__ALL__' para que
    // el key sea estable y no colisione con un uuid real.
    queryKey: ['vecinos', municipioId ?? '__ALL__', search, barrio, zona, portal_estado, page],
    queryFn:  () => fetchVecinos(municipioId, { search, barrio, zona, portal_estado, page }),
    enabled,
  })

  const create = useMutation({
    mutationFn: (data) => createVecino({
      // Inyecta el municipio del operador. Superadmin debe pasarlo
      // explícitamente en `data.municipio_id`.
      ...(municipioId ? { municipio_id: municipioId } : {}),
      ...data,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vecinos'] }),
  })

  const update = useMutation({
    mutationFn: ({ id, ...data }) => updateVecino(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vecinos'] }),
  })

  return {
    rows:       query.data?.rows ?? [],
    total:      query.data?.total ?? 0,
    page:       query.data?.page ?? 0,
    pageSize:   query.data?.pageSize ?? PAGE_SIZE,
    // isLoading (no isPending): solo true mientras hay un fetch en
    // vuelo. Cuando la query devuelve [] (tabla vacía), pasa a false
    // y el consumidor puede mostrar el empty state en lugar de spinner.
    isLoading:  query.isLoading,
    isFetching: query.isFetching,
    error:      query.error,
    refetch:    query.refetch,
    create,
    updateVecino: update,
  }
}

// Hook para una sola ficha de vecino. Usado por VecinoDetail.
// Devuelve `vecino: null` si la fila no existe o la RLS niega.
export function useVecino(id) {
  const { perfil } = useAuth()
  const enabled = !!perfil && !!id

  const query = useQuery({
    queryKey: ['vecino', id ?? '__none__'],
    queryFn:  () => fetchVecino(id),
    enabled,
  })

  return {
    vecino:     query.data ?? null,
    isLoading:  query.isLoading,
    isFetching: query.isFetching,
    error:      query.error,
    refetch:    query.refetch,
  }
}
