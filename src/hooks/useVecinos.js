import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const PAGE_SIZE = 50

const COLS = 'id, municipio_id, dni, apellido, nombre, telefono, email, barrio, direccion, fecha_nac, sexo, localidad'

// Escapa wildcards de ilike (% y _) para que no se interpreten como
// comodines cuando el usuario los tipee en el buscador.
function escapeLike(s) {
  return s.replace(/[%_\\]/g, m => `\\${m}`)
}

// Lista vecinos. Si municipioId es null (caso superadmin sin municipio),
// devuelve todos los vecinos del sistema.
export async function fetchVecinos(municipioId, { search = '', barrio = '', page = 0 } = {}) {
  let q = supabase
    .from('vecinos')
    .select(COLS, { count: 'exact' })
    .order('apellido', { ascending: true })
    .order('nombre',   { ascending: true })

  if (municipioId) q = q.eq('municipio_id', municipioId)
  if (barrio)      q = q.eq('barrio', barrio)

  if (search.trim()) {
    const pattern = `%${escapeLike(search.trim())}%`
    q = q.or(`apellido.ilike.${pattern},nombre.ilike.${pattern},dni.ilike.${pattern}`)
  }

  const from = page * PAGE_SIZE
  const to   = from + PAGE_SIZE - 1
  q = q.range(from, to)

  const { data, error, count } = await q
  if (error) throw error
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
export function useVecinos({ search = '', barrio = '', page = 0 } = {}) {
  const { perfil } = useAuth()
  const qc = useQueryClient()
  const municipioId = perfil?.municipio_id ?? null

  const query = useQuery({
    queryKey: ['vecinos', { municipioId, search, barrio, page }],
    queryFn:  () => fetchVecinos(municipioId, { search, barrio, page }),
    enabled:  !!perfil,
    placeholderData: (prev) => prev, // mantiene la página anterior mientras carga la nueva
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
    isLoading:  query.isPending,
    isFetching: query.isFetching,
    error:      query.error,
    refetch:    query.refetch,
    create,
    update,
  }
}
