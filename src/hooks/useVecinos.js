import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const PAGE_SIZE = 50

// `nombre_completo` se incluye en el select porque algunas filas
// tienen sólo ese campo cargado (no apellido/nombre separados).
// Los componentes muestran apellido+nombre cuando existen y caen
// a nombre_completo como fallback.
const COLS = 'id, municipio_id, dni, apellido, nombre, nombre_completo, telefono, email, barrio, direccion, fecha_nac, sexo, localidad'

// Escapa wildcards de ilike (% y _) para que no se interpreten como
// comodines cuando el usuario los tipee en el buscador.
function escapeLike(s) {
  return s.replace(/[%_\\]/g, m => `\\${m}`)
}

// Lista vecinos. Si municipioId es null/undefined (caso superadmin
// sin municipio asignado) la query NO filtra por municipio_id —
// trae todos los vecinos del sistema. La RLS (`vecinos staff lee
// municipio` con cláusula `is_superadmin()`) habilita ese acceso.
export async function fetchVecinos(municipioId, { search = '', barrio = '', page = 0 } = {}) {
  // [DEBUG TEMPORAL — confirmar que fetchVecinos se ejecuta]
  console.log('[useVecinos] fetchVecinos START', { municipioId, search, barrio, page })

  let q = supabase
    .from('vecinos')
    .select(COLS, { count: 'exact' })
    .order('apellido', { ascending: true })
    .order('nombre',   { ascending: true })

  // Filtro por municipio sólo si hay uno asignado. Para superadmin
  // (municipioId null) NO agregamos .eq y la query devuelve TODOS
  // los vecinos de TODOS los municipios.
  if (municipioId != null) q = q.eq('municipio_id', municipioId)
  if (barrio)              q = q.eq('barrio', barrio)

  if (search.trim()) {
    const pattern = `%${escapeLike(search.trim())}%`
    q = q.or(`apellido.ilike.${pattern},nombre.ilike.${pattern},dni.ilike.${pattern}`)
  }

  const from = page * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1
  q = q.range(from, to)

  const { data, error, count } = await q
  if (error) {
    console.error('[useVecinos] fetchVecinos ERROR', error)
    throw error
  }
  console.log('[useVecinos] fetchVecinos OK', { rows: data?.length ?? 0, total: count })
  return { rows: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE }
}

export async function createVecino(data) {
  const { data: row, error } = await supabase
    .from('vecinos')
    .insert(data)
    .select(COLS)
    .single()
  if (error) throw error
  return row
}

export async function updateVecino(id, data) {
  const { data: row, error } = await supabase
    .from('vecinos')
    .update(data)
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) throw error
  return row
}

// Hook React: encapsula el estado de carga, paginación y mutaciones.
// El municipio_id se resuelve del perfil del usuario logueado.
// - admin_comuna / operador: filtra por su municipio.
// - superadmin (municipio_id null): trae todos los municipios.
export function useVecinos({ search = '', barrio = '', page = 0 } = {}) {
  const { perfil } = useAuth()
  const qc = useQueryClient()

  // Tomamos el campo tal cual viene del perfil; null acá significa
  // explícitamente "todos los municipios" (caso superadmin).
  const municipioId = perfil?.municipio_id ?? null

  // La query se dispara apenas haya perfil cargado. NO requiere
  // municipio: superadmin con municipio_id = null debe ver todos
  // los vecinos del sistema (filtro por municipio se omite en
  // fetchVecinos cuando municipioId es null).
  const enabled = !!perfil

  // [DEBUG TEMPORAL]
  console.log('[useVecinos] hook render', {
    hasPerfil:   !!perfil,
    perfilId:    perfil?.id,
    municipioId,
    enabled,
    search, barrio, page,
  })

  const query = useQuery({
    // Array de primitivos: TanStack puede comparar más rápido y
    // descartamos cualquier issue con object identity en la key.
    // Para municipioId null usamos el sentinel '__ALL__' para que
    // el key sea estable y no colisione con un uuid real.
    queryKey: ['vecinos', municipioId ?? '__ALL__', search, barrio, page],
    queryFn:  () => fetchVecinos(municipioId, { search, barrio, page }),
    // Disparamos en cuanto haya perfil. NO requerimos municipio:
    // superadmin tiene municipio_id null y debe ver todos los vecinos.
    enabled,
  })

  // [DEBUG TEMPORAL]
  console.log('[useVecinos] query state', {
    status:      query.status,
    fetchStatus: query.fetchStatus,
    isLoading:   query.isLoading,
    isPending:   query.isPending,
    isFetching:  query.isFetching,
    hasData:     query.data != null,
    rows:        query.data?.rows?.length,
    error:       query.error?.message,
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
    mutationFn: ({ id, data }) => updateVecino(id, data),
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
    update,
  }
}
