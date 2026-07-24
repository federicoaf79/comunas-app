import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveMunicipioId } from './useEffectiveMunicipioId'
import { createAuditLog } from './useAuditLog'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[useProveedores] audit log:', e.message))
}

// =============================================================
// useProveedores — CRUD de comercios adheridos a Vales Electrónicos.
// Fase 0 del sprint Vales. Gateado por RLS (proveedores_staff_all
// en 20260724_vales_electronicos_fase0.sql): exige is_staff() +
// mismo municipio + módulo 'vales' activo — si el módulo está
// inactivo, la query devuelve vacío/[] aunque el componente no haga
// ningún chequeo propio (mismo patrón que Seguros.jsx/Patrimonio.jsx,
// sin guard de página, la RLS es la que realmente corta el acceso).
// =============================================================

const PROVEEDOR_COLS = 'id, municipio_id, nombre, categoria, telefono, direccion, activo, created_at'

async function fetchProveedores(municipioId) {
  if (!municipioId) return []
  const { data, error } = await supabase
    .from('proveedores')
    .select(PROVEEDOR_COLS)
    .eq('municipio_id', municipioId)
    .order('nombre', { ascending: true })
  if (error) throw error
  return data ?? []
}

export function useProveedores() {
  const { perfil } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  return useQuery({
    queryKey: ['proveedores', municipioId ?? '__NONE__'],
    queryFn:  () => fetchProveedores(municipioId),
    enabled:  !!perfil && !!municipioId,
  })
}

async function createProveedor(data) {
  const { data: row, error } = await supabase
    .from('proveedores')
    .insert(data)
    .select(PROVEEDOR_COLS)
    .single()
  if (error) throw error
  logAudit({
    accion: 'create', entidad: 'proveedores', entidadId: row.id,
    descripcion: `Alta de proveedor — ${row.nombre}`,
  })
  return row
}

async function updateProveedor({ id, ...patch }) {
  const { data: row, error } = await supabase
    .from('proveedores')
    .update(patch)
    .eq('id', id)
    .select(PROVEEDOR_COLS)
    .single()
  if (error) throw error
  logAudit({
    accion: 'update', entidad: 'proveedores', entidadId: id,
    descripcion: `Proveedor actualizado — ${row.nombre}`,
  })
  return row
}

export function useCreateProveedor() {
  const qc = useQueryClient()
  const { municipioId } = useEffectiveMunicipioId()
  return useMutation({
    // Inyecta el municipio del operador — la RLS (proveedores_staff_all)
    // exige municipio_id = current_usuario_municipio() en el WITH CHECK,
    // así que sin esto el INSERT siempre fallaba con "new row violates
    // row-level security policy" (bug real, encontrado en la
    // verificación en vivo de Fase 0). Mismo patrón que useVecinos.js.
    mutationFn: (data) => createProveedor({ ...data, municipio_id: municipioId }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['proveedores'] }),
  })
}

export function useUpdateProveedor() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: updateProveedor,
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['proveedores'] }),
  })
}

// Toggle activo/inactivo — mismo patrón que toggleUsuarioActivo() en
// Usuarios.jsx (columna boolean simple, sin baja física).
export function useToggleProveedorActivo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, activo }) => {
      const { data: row, error } = await supabase
        .from('proveedores')
        .update({ activo })
        .eq('id', id)
        .select('nombre')
        .single()
      if (error) throw error
      logAudit({
        accion: 'update', entidad: 'proveedores', entidadId: id,
        descripcion: `${activo ? 'Activación' : 'Desactivación'} de proveedor — ${row?.nombre ?? id}`,
      })
      return row
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores'] }),
  })
}
