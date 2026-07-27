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

// =============================================================
// Personas autorizadas (proveedor_accesos) — Fase 4 parte 2.
//
// La policy proveedor_accesos_staff_all es FOR ALL -- CRUD directo
// con el cliente, sin RPC (a diferencia de proveedor_dispositivos,
// más abajo, donde INSERT/UPDATE/DELETE sí están revocados).
// `rol` solo acepta 'responsable'/'secundario'
// (proveedor_accesos_rol_check); no hay columna municipio_id en esta
// tabla, así que "mismo municipio" se valida contra vecinos.municipio_id
// del lado del cliente antes de insertar (ver createProveedorAcceso).
// =============================================================

const PROVEEDOR_ACCESO_ADMIN_COLS = `
  id, proveedor_id, vecino_id, rol, activo, created_at,
  vecino:vecino_id(id, nombre_completo, dni)
`

async function fetchProveedorAccesosAdmin(proveedorId) {
  if (!proveedorId) return []
  const { data, error } = await supabase
    .from('proveedor_accesos')
    .select(PROVEEDOR_ACCESO_ADMIN_COLS)
    .eq('proveedor_id', proveedorId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export function useProveedorAccesos(proveedorId) {
  const { perfil } = useAuth()
  return useQuery({
    queryKey: ['proveedor-accesos', proveedorId ?? '__none__'],
    queryFn:  () => fetchProveedorAccesosAdmin(proveedorId),
    enabled:  !!perfil && !!proveedorId,
  })
}

// `proveedorMunicipioId` viene de la fila de `proveedores` ya cargada
// en pantalla -- no hay columna municipio_id en proveedor_accesos para
// que la DB lo valide sola, así que el chequeo vive acá, ANTES del
// insert. Es la única defensa real para esta regla puntual.
async function createProveedorAcceso({ proveedorId, proveedorNombre, proveedorMunicipioId, vecino, rol }) {
  if (vecino?.municipio_id !== proveedorMunicipioId) {
    throw new Error('El vecino elegido no pertenece al mismo municipio que el comercio.')
  }
  const { data: row, error } = await supabase
    .from('proveedor_accesos')
    .insert({ proveedor_id: proveedorId, vecino_id: vecino.id, rol, activo: true })
    .select(PROVEEDOR_ACCESO_ADMIN_COLS)
    .single()
  if (error) {
    // uq_proveedor_accesos_proveedor_vecino: una persona tiene un solo
    // acceso por comercio -- "agregar de nuevo" es reactivar/cambiar rol
    // en la fila existente, no un alta nueva. Sin esto el postgres crudo
    // ("duplicate key value violates unique constraint...") llegaba tal
    // cual a la pantalla del empleado.
    if (error.code === '23505') {
      throw new Error('Esta persona ya tiene un acceso a este comercio. Buscala en la lista de abajo para reactivarla o cambiarle el rol.')
    }
    throw error
  }
  logAudit({
    accion: 'create', entidad: 'proveedor_accesos', entidadId: row.id,
    descripcion: `Acceso otorgado — ${vecino.nombre_completo ?? vecino.id} como ${rol} de ${proveedorNombre}`,
  })
  return row
}

export function useCreateProveedorAcceso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: createProveedorAcceso,
    onSuccess:  (_row, { proveedorId }) => qc.invalidateQueries({ queryKey: ['proveedor-accesos', proveedorId] }),
  })
}

// Cambio de rol -- acción separada de activar/desactivar porque el
// audit log necesita describir cada una distinto (y porque activar/
// desactivar de un acceso ya cancelado no debería reabrir la
// posibilidad de tocar el rol sin querer desde el mismo botón).
async function cambiarRolAcceso({ id, proveedorId, rol, vecinoNombre, proveedorNombre }) {
  const { error } = await supabase
    .from('proveedor_accesos')
    .update({ rol })
    .eq('id', id)
  if (error) throw error
  logAudit({
    accion: 'update', entidad: 'proveedor_accesos', entidadId: id,
    descripcion: `Cambio de rol — ${vecinoNombre ?? id} ahora es ${rol} de ${proveedorNombre}`,
  })
}

export function useCambiarRolAcceso() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: cambiarRolAcceso,
    onSuccess:  (_r, { proveedorId }) => qc.invalidateQueries({ queryKey: ['proveedor-accesos', proveedorId] }),
  })
}

async function toggleAccesoActivo({ id, proveedorId, activo, vecinoNombre, proveedorNombre }) {
  const { error } = await supabase
    .from('proveedor_accesos')
    .update({ activo })
    .eq('id', id)
  if (error) throw error
  logAudit({
    accion: 'update', entidad: 'proveedor_accesos', entidadId: id,
    descripcion: `${activo ? 'Reactivación' : 'Desactivación'} de acceso — ${vecinoNombre ?? id} en ${proveedorNombre}`,
  })
}

export function useToggleAccesoActivo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: toggleAccesoActivo,
    onSuccess:  (_r, { proveedorId }) => qc.invalidateQueries({ queryKey: ['proveedor-accesos', proveedorId] }),
  })
}

// =============================================================
// Teléfonos (proveedor_dispositivos) — Fase 4 parte 2.
//
// SELECT directo permitido; INSERT/UPDATE/DELETE revocados al
// cliente. No hay "vincular" desde acá a propósito: vincular_dispositivo
// exige proveedor_accesos de quien llama, y un staff nunca tiene uno
// (no es vecino); además el device_id vive en el localStorage del
// teléfono del comerciante, no en ningún lado que el admin pueda leer.
// Vincular es siempre una acción del responsable desde SU propio
// teléfono -- acá solo se lista y se desvincula (con bypass de staff
// ya resuelto del lado del server).
// =============================================================

const PROVEEDOR_DISPOSITIVO_ADMIN_COLS = `
  id, device_id, alias, activo, vinculado_en, ultimo_uso_en,
  vinculado:vinculado_por(id, nombre_completo)
`

async function fetchProveedorDispositivosAdmin(proveedorId, soloActivos) {
  if (!proveedorId) return []
  let q = supabase
    .from('proveedor_dispositivos')
    .select(PROVEEDOR_DISPOSITIVO_ADMIN_COLS)
    .eq('proveedor_id', proveedorId)
    .order('vinculado_en', { ascending: false })
  if (soloActivos) q = q.eq('activo', true)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export function useProveedorDispositivos(proveedorId, { soloActivos = true } = {}) {
  const { perfil } = useAuth()
  return useQuery({
    queryKey: ['proveedor-dispositivos', proveedorId ?? '__none__', soloActivos],
    queryFn:  () => fetchProveedorDispositivosAdmin(proveedorId, soloActivos),
    enabled:  !!perfil && !!proveedorId,
  })
}

// Mismo RPC que usa el propio comerciante (useProveedorVecino.js) --
// desvincular_dispositivo tiene bypass de staff del lado del server,
// así que no hace falta una RPC aparte. Lo que sí es propio de acá es
// el audit log: es sensible que alguien del municipio corte la
// operatoria de un comercio, y el hook del vecino no loguea (no tiene
// motivo -- ver createAuditLogVecino solo para acciones sin sesión de
// staff).
async function desvincularDispositivoStaff({ deviceId, proveedorId, alias, proveedorNombre }) {
  const { data, error } = await supabase.rpc('desvincular_dispositivo', {
    p_device_id: deviceId,
  })
  if (error) throw error
  logAudit({
    accion: 'update', entidad: 'proveedor_dispositivos',
    descripcion: `Teléfono desvinculado${alias ? ` (${alias})` : ''} de ${proveedorNombre}`,
  })
  return data
}

export function useDesvincularDispositivoStaff() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: desvincularDispositivoStaff,
    onSuccess:  (_r, { proveedorId }) => {
      qc.invalidateQueries({ queryKey: ['proveedor-dispositivos', proveedorId] })
    },
  })
}
