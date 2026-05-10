import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useDependencias } from '../../hooks/useTurnos'
import Spinner from '../../components/ui/Spinner'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import UsuarioInvitarModal from '../../components/admin/UsuarioInvitarModal'
import { dateOf, dateTimeOf } from '../../lib/datetime'

// =============================================================
// /admin/usuarios — Panel de Usuarios y Roles
//
// Lista los usuarios del municipio del operador (o de todos los
// municipios si es superadmin), con edición de rol, toggle
// activo/inactivo y modal para invitar nuevos.
//
// Reglas de permisos:
//   - superadmin: ve y edita todos los roles.
//   - admin_comuna: puede asignar roles 3 a 8 (admin_portal a
//     vecino). NO puede crear otros admin_comuna ni superadmin.
//   - El operador no puede modificar su propio rol ni
//     desactivarse a sí mismo.
//
// Nota técnica sobre Invitar: la tabla `usuarios.id` referencia
// auth.users(id) NOT NULL. Insertar una fila standalone requiere
// que el schema de tu instancia haya relajado esa FK o tenga un
// flujo paralelo de invitaciones. Si tu schema mantiene la FK
// estricta, el INSERT desde el cliente va a fallar con un
// "foreign key violation" — la UI lo muestra como error y el
// administrador puede crear el usuario por la vía oficial.
// =============================================================

const ROLES = [
  { value: 'superadmin',    label: 'Superadmin',             desc: 'Acceso total al sistema (Federico Frey).' },
  { value: 'admin_comuna',  label: 'Admin Comuna',           desc: 'Presidente de la Comisión.' },
  { value: 'admin_portal',  label: 'Admin Portal',           desc: 'Gestión de noticias y portal.' },
  { value: 'usuario_admin', label: 'Usuario Admin',          desc: 'Delegación cross-área.' },
  { value: 'subadmin',      label: 'Subadmin de dependencia', desc: 'Encargado de UNA dependencia.' },
  { value: 'usuario_sub',   label: 'Usuario de dependencia',  desc: 'Trabaja en UNA dependencia.' },
  { value: 'reporting',     label: 'Reporting',              desc: 'Solo lectura.' },
  { value: 'vecino',        label: 'Vecino',                 desc: 'Ciudadano registrado.' },
]
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.value, r.label]))

const FILTRO_ROL_OPTS = ROLES.map(r => ({ value: r.value, label: r.label }))
const FILTRO_ESTADO_OPTS = [
  { value: 'activo',   label: 'Activos' },
  { value: 'inactivo', label: 'Inactivos' },
]

// Devuelve los roles que el operador puede asignar a otros
// usuarios. superadmin puede todos; admin_comuna excluye
// superadmin y admin_comuna; cualquier otro rol no puede asignar
// (la UI no expone el panel para ellos).
function rolesAsignablesPara(operatorRoles) {
  if (operatorRoles?.includes('superadmin')) return ROLES
  if (operatorRoles?.includes('admin_comuna')) {
    return ROLES.filter(r => !['superadmin', 'admin_comuna'].includes(r.value))
  }
  return []
}

// El primer rol del array `roles` se trata como "el rol" del
// usuario para mostrar/editar. Los multi-rol legacy quedan
// preservados si nadie los toca (UPDATE solo reemplaza con
// [nuevoRol]).
function rolPrincipal(rolesArr) {
  return Array.isArray(rolesArr) && rolesArr.length > 0 ? rolesArr[0] : null
}

// ─────────────────────────────────────────────────────────────────
// Queries / mutations
// ─────────────────────────────────────────────────────────────────

async function fetchUsuarios(municipioId) {
  let q = supabase
    .from('usuarios')
    .select('id, municipio_id, roles, dependencias_ids, nombre, email, telefono, activo, created_at, updated_at')
    .order('nombre', { ascending: true })
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

async function updateUsuarioRol(id, nuevoRol) {
  const { error } = await supabase
    .from('usuarios')
    .update({ roles: [nuevoRol] })
    .eq('id', id)
  if (error) throw error
}

async function toggleUsuarioActivo(id, activo) {
  const { error } = await supabase
    .from('usuarios')
    .update({ activo })
    .eq('id', id)
  if (error) throw error
}

// Insert "stub" para el flujo de invitar. Genera un UUID local —
// si la tabla `usuarios.id` mantiene la FK a auth.users, esto
// fallará y el caller mostrará el error.
async function invitarUsuario({ email, nombre, rol, dependencia_id, municipio_id }) {
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const { error } = await supabase
    .from('usuarios')
    .insert({
      id,
      municipio_id,
      email,
      nombre,
      roles:            [rol],
      dependencias_ids: dependencia_id ? [dependencia_id] : [],
      activo:           false,
    })
  if (error) throw error
}

// ─────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────

function EstadoBadge({ activo }) {
  if (activo) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ok-50 px-2.5 py-0.5 text-xs font-semibold text-ok-700 ring-1 ring-inset ring-ok-100">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Activo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> Inactivo
    </span>
  )
}

function AccessDenied() {
  return (
    <div className="card p-10 text-center">
      <p className="font-sora text-lg font-semibold text-primary">Acceso restringido</p>
      <p className="mt-2 text-sm text-primary-500">
        Solo los administradores de la comuna y el superadmin pueden gestionar usuarios.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function Usuarios() {
  const { perfil, hasRole } = useAuth()
  const qc = useQueryClient()
  const isSuperadmin  = hasRole('superadmin')
  const isAdminComuna = hasRole('admin_comuna')
  const canManageUsers = isSuperadmin || isAdminComuna

  // Para superadmin sin municipio caemos al primer municipio
  // activo (mismo patrón que Administracion / ConfigGeneral).
  const municipioId = useEffectiveMunicipioId()

  const rolesAsignables = useMemo(
    () => rolesAsignablesPara(perfil?.roles ?? []),
    [perfil],
  )

  const [filtroRol, setFiltroRol]       = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [modalOpen, setModalOpen]       = useState(false)
  const [busyId, setBusyId]             = useState(null)
  const [error, setError]               = useState('')

  const usuariosQ = useQuery({
    queryKey: ['admin-usuarios', municipioId ?? '__ALL__'],
    queryFn:  () => fetchUsuarios(municipioId),
    enabled:  !!perfil && canManageUsers,
  })
  const { data: dependencias = [] } = useDependencias()

  const updateRolMut = useMutation({
    mutationFn: ({ id, rol }) => updateUsuarioRol(id, rol),
    onMutate:   ({ id }) => setBusyId(id),
    onSettled:  () => setBusyId(null),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-usuarios'] }),
    onError:    (e) => setError(e?.message ?? 'No pudimos actualizar el rol.'),
  })

  const toggleActivoMut = useMutation({
    mutationFn: ({ id, activo }) => toggleUsuarioActivo(id, activo),
    onMutate:   ({ id }) => setBusyId(id),
    onSettled:  () => setBusyId(null),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-usuarios'] }),
    onError:    (e) => setError(e?.message ?? 'No pudimos cambiar el estado.'),
  })

  const invitarMut = useMutation({
    mutationFn: invitarUsuario,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['admin-usuarios'] })
      setModalOpen(false)
    },
    onError:    (e) => setError(e?.message ?? 'No pudimos crear la invitación.'),
  })

  const filtrados = useMemo(() => {
    return (usuariosQ.data ?? []).filter(u => {
      if (filtroEstado === 'activo'   && !u.activo) return false
      if (filtroEstado === 'inactivo' &&  u.activo) return false
      if (filtroRol && rolPrincipal(u.roles) !== filtroRol) return false
      return true
    })
  }, [usuariosQ.data, filtroRol, filtroEstado])

  function puedeEditarUsuario(u) {
    if (!canManageUsers) return false
    if (u.id === perfil?.id) return false           // no podés editarte a vos mismo
    const rolActual = rolPrincipal(u.roles)
    // admin_comuna no puede tocar a superadmin ni a otros admin_comuna
    if (!isSuperadmin && ['superadmin', 'admin_comuna'].includes(rolActual)) return false
    return true
  }

  function handleCambiarRol(u, nuevoRol) {
    setError('')
    updateRolMut.mutate({ id: u.id, rol: nuevoRol })
  }
  function handleToggleActivo(u) {
    setError('')
    if (!confirm(u.activo
      ? `¿Desactivar a ${u.nombre}? No podrá ingresar hasta que lo reactivés.`
      : `¿Reactivar a ${u.nombre}?`)) return
    toggleActivoMut.mutate({ id: u.id, activo: !u.activo })
  }
  async function handleInvitar(payload) {
    setError('')
    if (!municipioId) {
      throw new Error('Sin municipio destino. Pedile al administrador que asigne uno.')
    }
    await invitarMut.mutateAsync({ ...payload, municipio_id: municipioId })
  }

  if (!canManageUsers) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="text-2xl font-bold text-primary">Usuarios</h1>
        </header>
        <AccessDenied />
      </div>
    )
  }

  const total = filtrados.length

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Usuarios</h1>
          <p className="text-sm text-primary-400">
            Gestión de usuarios y roles del municipio.
          </p>
        </div>
        <Button onClick={() => { setError(''); setModalOpen(true) }}>
          + Invitar usuario
        </Button>
      </header>

      <div className="flex flex-wrap gap-3">
        <Select
          value={filtroRol}
          onChange={setFiltroRol}
          placeholder="Todos los roles"
          options={FILTRO_ROL_OPTS}
          className="min-w-[200px]"
        />
        <Select
          value={filtroEstado}
          onChange={setFiltroEstado}
          placeholder="Todos los estados"
          options={FILTRO_ESTADO_OPTS}
          className="min-w-[180px]"
        />
        <p className="self-end text-xs text-primary-400">
          {total} usuario{total === 1 ? '' : 's'}
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {usuariosQ.isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : usuariosQ.error ? (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los usuarios: {usuariosQ.error.message}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          {(usuariosQ.data ?? []).length === 0
            ? 'No hay usuarios cargados todavía.'
            : 'Ningún usuario coincide con los filtros.'}
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Nombre</Th>
              <Th>Email</Th>
              <Th>Rol</Th>
              <Th>Estado</Th>
              <Th>Último acceso</Th>
              <Th className="text-right">Acciones</Th>
            </Tr>
          </THead>
          <tbody>
            {filtrados.map(u => {
              const editable = puedeEditarUsuario(u)
              const rolActual = rolPrincipal(u.roles)
              const opcionesRol = rolesAsignables.map(r => ({ value: r.value, label: r.label }))
              const esYo = u.id === perfil?.id
              return (
                <Tr key={u.id}>
                  <Td>
                    <p className="font-medium text-primary">{u.nombre || '—'}</p>
                    {esYo && (
                      <p className="text-[10px] uppercase tracking-wide text-accent-700">Vos</p>
                    )}
                  </Td>
                  <Td className="text-primary-500">{u.email || '—'}</Td>
                  <Td>
                    {editable ? (
                      <Select
                        value={rolActual ?? ''}
                        onChange={v => handleCambiarRol(u, v)}
                        placeholder="Asignar rol..."
                        options={opcionesRol}
                        className="min-w-[160px]"
                      />
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700 ring-1 ring-inset ring-primary-100">
                        {ROLE_LABEL[rolActual] ?? rolActual ?? 'Sin rol'}
                      </span>
                    )}
                  </Td>
                  <Td><EstadoBadge activo={!!u.activo} /></Td>
                  <Td className="whitespace-nowrap text-xs text-primary-400">
                    {u.updated_at ? dateTimeOf(u.updated_at) : (u.created_at ? dateOf(u.created_at) : '—')}
                  </Td>
                  <Td className="whitespace-nowrap text-right text-xs font-medium">
                    {editable ? (
                      <button
                        type="button"
                        onClick={() => handleToggleActivo(u)}
                        disabled={busyId === u.id}
                        className={u.activo ? 'text-danger hover:underline' : 'text-ok-700 hover:underline'}
                      >
                        {u.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    ) : (
                      <span className="text-primary-300">—</span>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      )}

      <UsuarioInvitarModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleInvitar}
        saving={invitarMut.isPending}
        rolesAsignables={rolesAsignables}
        dependencias={dependencias}
      />
    </div>
  )
}
