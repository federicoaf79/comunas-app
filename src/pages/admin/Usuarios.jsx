import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useDependencias } from '../../hooks/useTurnos'
import { useUpdatePermisosUsuario } from '../../hooks/useUsuariosAdmin'
import Avatar from '../../components/ui/Avatar'
import Spinner from '../../components/ui/Spinner'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Tabs from '../../components/ui/Tabs'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import UsuarioInvitarModal from '../../components/admin/UsuarioInvitarModal'
import { dateOf } from '../../lib/datetime'

// =============================================================
// /admin/usuarios — Panel de Usuarios y Roles
//
// Dos vistas:
//   1) "Lista de usuarios"      → tabla con rol y estado.
//   2) "Permisos por persona"   → wizard inline: elegís un
//      empleado y le asignás dependencias con secciones (Gestión
//      / Administración) desde un grid de cards. Reemplaza al
//      antiguo tablero matricial — más liviano para el director.
//
// Reglas de permisos del operador:
//   - superadmin: puede ver y editar todo.
//   - admin_comuna: puede asignar roles 3 a 8 y editar permisos
//     de usuarios del mismo municipio (no a otros admin_comuna).
//   - Otros roles: AccessDenied.
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

function rolesAsignablesPara(operatorRoles) {
  if (operatorRoles?.includes('superadmin')) return ROLES
  if (operatorRoles?.includes('admin_comuna')) {
    return ROLES.filter(r => !['superadmin', 'admin_comuna'].includes(r.value))
  }
  return []
}

function rolPrincipal(rolesArr) {
  return Array.isArray(rolesArr) && rolesArr.length > 0 ? rolesArr[0] : null
}

// ─────────────────────────────────────────────────────────────────
// Queries / mutations directas a usuarios
// ─────────────────────────────────────────────────────────────────

async function fetchUsuarios(municipioId) {
  let q = supabase
    .from('usuarios')
    .select('id, municipio_id, roles, dependencias_ids, dependencias_acceso, nombre, email, activo, created_at')
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
// Catálogo de secciones por tipo de dependencia
//
// Cada tipo define hasta tres secciones visibles. Las que aparecen
// dentro de "Gestión" comparten el flag puede_gestionar (Expedientes
// del Juzgado o Servicios de Obras son sub-tabs internos de gestión,
// no permisos independientes en la DB).
//
// kind:
//   'gestion'  → asigna puede_gestionar
//   'admin'    → asigna puede_administrar
//   'info'     → tipo solo informativo, sin permisos asignables
// ─────────────────────────────────────────────────────────────────

const SECCIONES_POR_TIPO = {
  caps:           [{ kind: 'gestion', label: 'Gestión',                  desc: 'Agenda, turnos y atención' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos, insumos y rendición' }],
  salud:          [{ kind: 'gestion', label: 'Gestión',                  desc: 'Agenda, turnos y atención' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos, insumos y rendición' }],
  juzgado:        [{ kind: 'gestion', label: 'Gestión',                  desc: 'Turnos, agenda y expedientes' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos y partidas' }],
  sum:            [{ kind: 'gestion', label: 'Gestión',                  desc: 'Reservas y calendario' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos del salón' }],
  ayuda_social:   [{ kind: 'gestion', label: 'Gestión',                  desc: 'Beneficiarios y entregas' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos de Ayuda Social' }],
  social:         [{ kind: 'gestion', label: 'Gestión',                  desc: 'Beneficiarios y entregas' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos de Ayuda Social' }],
  obras:          [{ kind: 'gestion', label: 'Gestión',                  desc: 'Servicios y reclamos' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Presupuesto y compras' }],
  obras_publicas: [{ kind: 'gestion', label: 'Gestión',                  desc: 'Servicios y reclamos' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Presupuesto y compras' }],
  deporte:        [{ kind: 'gestion', label: 'Gestión',                  desc: 'Reservas de canchas' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos del polideportivo' }],
  polideportivo:  [{ kind: 'gestion', label: 'Gestión',                  desc: 'Reservas de canchas' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos del polideportivo' }],
  cementerio:     [{ kind: 'gestion', label: 'Gestión',                  desc: 'Trámites y registros' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos del cementerio' }],
  velatorio:      [{ kind: 'gestion', label: 'Gestión',                  desc: 'Servicios y agenda' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos del velatorio' }],
  alumbrado:      [{ kind: 'gestion', label: 'Gestión',                  desc: 'Reclamos y reparaciones' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos y materiales' }],
  verde:          [{ kind: 'gestion', label: 'Gestión',                  desc: 'Plazas, parques y forestación' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos del área' }],
  espacios_verdes:[{ kind: 'gestion', label: 'Gestión',                  desc: 'Plazas, parques y forestación' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos del área' }],
  bienes:         [{ kind: 'gestion', label: 'Gestión',                  desc: 'Catastro y patrimonio' },
                   { kind: 'admin',   label: 'Administración',           desc: 'Gastos del área' }],
  // Solo-info: educación / jardín / primaria / secundaria / policial.
  educacion:      [{ kind: 'info',    label: 'Información pública',      desc: 'Sin permisos asignables' }],
  jardin:         [{ kind: 'info',    label: 'Información pública',      desc: 'Sin permisos asignables' }],
  primaria:       [{ kind: 'info',    label: 'Información pública',      desc: 'Sin permisos asignables' }],
  secundaria:     [{ kind: 'info',    label: 'Información pública',      desc: 'Sin permisos asignables' }],
  policia:        [{ kind: 'info',    label: 'Información pública',      desc: 'Sin permisos asignables' }],
  policial:       [{ kind: 'info',    label: 'Información pública',      desc: 'Sin permisos asignables' }],
}

const SECCIONES_DEFAULT = [
  { kind: 'gestion', label: 'Gestión',        desc: 'Operaciones del día a día' },
  { kind: 'admin',   label: 'Administración', desc: 'Gastos y presupuesto' },
]

function seccionesParaTipo(tipo) {
  const t = (tipo ?? '').toLowerCase().trim()
  return SECCIONES_POR_TIPO[t] ?? SECCIONES_DEFAULT
}

// Glifo por tipo — versión compacta del que usa AdminLayout.
function DepIcon({ tipo, className = 'h-5 w-5' }) {
  const t = (tipo ?? '').toLowerCase()
  const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', className, 'aria-hidden': 'true' }
  if (/caps|salud|sala/.test(t))
    return <svg {...base}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 8v8M8 12h8" /></svg>
  if (/juzgado|paz|justicia/.test(t))
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" /></svg>
  if (/sum|sal[oó]n|cultural/.test(t))
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" /></svg>
  if (/social|ayuda|familia|comunidad|asisten/.test(t))
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.5-9-9c-1.5-3 0-7 4-7 2.5 0 4 1.5 5 3 1-1.5 2.5-3 5-3 4 0 5.5 4 4 7-2 4.5-9 9-9 9z" /></svg>
  if (/obra|construc|infra|catastro/.test(t))
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M3 18h18M5 18v-3a7 7 0 0 1 14 0v3M9 7v4M15 7v4M9 11h6" /></svg>
  if (/deport|polideport|recreaci/.test(t))
    return <svg {...base}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
  if (/cementerio|necr/.test(t))
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M8 21v-9a4 4 0 0 1 8 0v9M12 8V4M10 6h4M5 21h14" /></svg>
  if (/velatorio|despedida|f[uú]nebre/.test(t))
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2 3 4 5 4 8a4 4 0 0 1-8 0c0-3 2-5 4-8zM8 21h8M10 18h4" /></svg>
  if (/educ|escuel|jardi|primaria|secundaria|biblioteca/.test(t))
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H3V5zM21 5h-7a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h7V5z" /></svg>
  if (/alumbrado|elect/.test(t))
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>
  if (/verde|jardin|parque|plaza/.test(t))
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 6-3 16-9 16zM4 20l6-6" /></svg>
  if (/polic|seguridad|defensa/.test(t))
    return <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" /></svg>
  if (/bienes|inmueble|patrim/.test(t))
    return <svg {...base}><rect x="4" y="4" width="16" height="16" rx="1.5" /><path strokeLinecap="round" d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01" /></svg>
  return <svg {...base}><rect x="4" y="4" width="16" height="16" rx="2" /><path strokeLinecap="round" d="M8 9h8M8 13h8M8 17h5" /></svg>
}

// ─────────────────────────────────────────────────────────────────
// Sub-componentes simples
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

  const municipioId = useEffectiveMunicipioId()

  const rolesAsignables = useMemo(
    () => rolesAsignablesPara(perfil?.roles ?? []),
    [perfil],
  )

  const [view, setView]                 = useState('lista') // 'lista' | 'permisos'
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

  const depsActivas = useMemo(
    () => (dependencias ?? []).filter(d => d.activa !== false),
    [dependencias],
  )

  function puedeEditarUsuario(u) {
    if (!canManageUsers) return false
    if (u.id === perfil?.id) return false
    const rolActual = rolPrincipal(u.roles)
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
          <h1 className="font-sora text-2xl font-bold text-primary">Usuarios</h1>
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
          <h1 className="font-sora text-2xl font-bold text-primary">Usuarios</h1>
          <p className="mt-1 text-sm text-primary-500">
            Gestión de usuarios, roles y permisos por dependencia.
          </p>
        </div>
        <Button onClick={() => { setError(''); setModalOpen(true) }}>
          + Invitar usuario
        </Button>
      </header>

      <Tabs
        tabs={[
          { value: 'lista',    label: 'Lista de usuarios' },
          { value: 'permisos', label: 'Permisos por persona' },
        ]}
        value={view}
        onChange={setView}
      />

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {view === 'permisos' && (
        <PermisosPorPersona
          usuarios={usuariosQ.data ?? []}
          dependencias={depsActivas}
          isLoading={usuariosQ.isLoading}
          puedeEditarUsuario={puedeEditarUsuario}
          onInvitar={() => { setError(''); setModalOpen(true) }}
          onError={setError}
        />
      )}

      {view === 'lista' && (
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
      )}

      {view === 'lista' && (usuariosQ.isLoading ? (
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
                    {u.created_at ? dateOf(u.created_at) : '—'}
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
      ))}

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

// ─────────────────────────────────────────────────────────────────
// PERMISOS POR PERSONA — wizard inline
//
// Flujo:
//   1) Buscador + lista de empleados como cards horizontales.
//      Click selecciona y monta el grid de dependencias debajo.
//   2) Grid de cards de dependencia. Sin acceso → borde gris,
//      "Asignar acceso". Con acceso → borde gold + chips de
//      secciones activas + "Editar".
//   3) Card expandida: checkboxes (Gestión / Administración)
//      + Guardar + Quitar.
//
// Mobile-first: en pantallas chicas la grilla es de 1 columna
// y las cards expandidas ocupan el ancho completo.
// ─────────────────────────────────────────────────────────────────

function PermisosPorPersona({
  usuarios, dependencias, isLoading,
  puedeEditarUsuario, onInvitar, onError,
}) {
  const [query, setQuery]             = useState('')
  const [selectedId, setSelectedId]   = useState(null)
  const [expandedDepId, setExpandedDepId] = useState(null)
  const [okMsg, setOkMsg]             = useState('')

  useEffect(() => {
    if (!okMsg) return
    const t = setTimeout(() => setOkMsg(''), 2000)
    return () => clearTimeout(t)
  }, [okMsg])

  const candidatos = useMemo(() => {
    // Excluimos superadmin (acceso global por rol) y mantenemos
    // ordenado alfabéticamente por nombre.
    return (usuarios ?? [])
      .filter(u => !u.roles?.includes('superadmin'))
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
  }, [usuarios])

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidatos
    return candidatos.filter(u =>
      (u.nombre ?? '').toLowerCase().includes(q)
      || (u.email ?? '').toLowerCase().includes(q),
    )
  }, [candidatos, query])

  const selectedUser = useMemo(
    () => (usuarios ?? []).find(u => u.id === selectedId) ?? null,
    [usuarios, selectedId],
  )
  const esDirector = rolPrincipal(selectedUser?.roles) === 'admin_comuna'
  const editable   = !!selectedUser && puedeEditarUsuario(selectedUser)

  if (isLoading) {
    return <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-6">
      {okMsg && (
        <div className="inline-flex rounded-md border border-ok-100 bg-ok-50 px-3 py-1.5 text-xs font-medium text-ok-700">
          {okMsg}
        </div>
      )}

      {/* PASO 1 · Buscador + lista de empleados */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Buscar empleado"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por nombre o email…"
            className="min-w-[260px] flex-1"
          />
          <Button variant="secondary" onClick={onInvitar}>
            + Invitar nuevo empleado
          </Button>
        </div>

        {filtrados.length === 0 ? (
          <div className="card p-8 text-center text-sm text-primary-400">
            {candidatos.length === 0
              ? 'No hay empleados cargados.'
              : 'Ningún empleado coincide con la búsqueda.'}
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {filtrados.map(u => {
              const rol = rolPrincipal(u.roles)
              const seleccionado = u.id === selectedId
              const isDirector  = rol === 'admin_comuna'
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setSelectedId(u.id); setExpandedDepId(null); onError?.('') }}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    seleccionado
                      ? 'border-accent-300 bg-primary-50/60 ring-1 ring-accent-200'
                      : 'border-border bg-white hover:border-primary-200 hover:bg-primary-50/40'
                  }`}
                >
                  <Avatar name={u.nombre} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-primary">{u.nombre || u.email || 'Sin nombre'}</p>
                    <p className="truncate text-xs text-primary-400">{u.email || '—'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
                        isDirector
                          ? 'bg-accent-50 text-accent-700 ring-accent-100'
                          : 'bg-primary-50 text-primary-700 ring-primary-100'
                      }`}>
                        {ROLE_LABEL[rol] ?? rol ?? 'Sin rol'}
                      </span>
                      <EstadoBadge activo={!!u.activo} />
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* PASO 2 · Grid de dependencias para el empleado seleccionado */}
      {selectedUser && (
        <section className="space-y-3">
          <div className="rounded-lg border border-border bg-primary-50/40 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-700">
              Permisos de
            </p>
            <p className="font-sora text-lg font-bold text-primary">
              {selectedUser.nombre || selectedUser.email || 'Sin nombre'}
            </p>
            {esDirector && (
              <p className="mt-1 text-xs text-primary-500">
                Tiene rol de <strong>Admin Comuna</strong> — acceso total a todas las
                dependencias por rol. No requiere asignación manual.
              </p>
            )}
            {!esDirector && !editable && (
              <p className="mt-1 text-xs text-primary-500">
                No podés editar los permisos de este usuario desde tu rol.
              </p>
            )}
          </div>

          {dependencias.length === 0 ? (
            <div className="card p-8 text-center text-sm text-primary-400">
              Este municipio no tiene dependencias activas. Cargá al menos una para
              configurar permisos por área.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {dependencias
                .slice()
                .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
                .map(dep => (
                  <DependenciaCard
                    key={dep.id}
                    dep={dep}
                    usuario={selectedUser}
                    expanded={expandedDepId === dep.id}
                    onExpand={() => setExpandedDepId(prev => prev === dep.id ? null : dep.id)}
                    onCollapse={() => setExpandedDepId(null)}
                    onSaved={(msg) => { setOkMsg(msg); setExpandedDepId(null) }}
                    onError={onError}
                    disabled={!editable || esDirector}
                  />
                ))}
            </div>
          )}
        </section>
      )}

      {!selectedUser && filtrados.length > 0 && (
        <div className="card border-dashed bg-primary-50/30 p-8 text-center text-sm text-primary-500">
          Elegí un empleado de la lista para asignarle permisos.
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Card de dependencia con su wizard inline de secciones
// ─────────────────────────────────────────────────────────────────

function DependenciaCard({
  dep, usuario, expanded, onExpand, onCollapse, onSaved, onError, disabled,
}) {
  const updateMut = useUpdatePermisosUsuario()
  const secciones = seccionesParaTipo(dep.tipo)
  const soloInfo  = secciones.every(s => s.kind === 'info')

  const accesoActual = useMemo(
    () => (usuario?.dependencias_acceso ?? []).find(d => d?.dependencia_id === dep.id) ?? null,
    [usuario, dep.id],
  )
  const tieneGestion = !!accesoActual?.puede_gestionar
  const tieneAdmin   = !!accesoActual?.puede_administrar
  const tieneAcceso  = tieneGestion || tieneAdmin

  const cardClasses = `flex flex-col rounded-lg border p-4 transition-colors ${
    tieneAcceso
      ? 'border-accent-200 bg-primary-50/40'
      : 'border-border bg-white'
  } ${expanded ? 'ring-2 ring-accent-200' : ''}`

  function resumenAcceso() {
    if (soloInfo)      return 'Información pública'
    if (!tieneAcceso)  return 'Sin acceso'
    const partes = []
    if (tieneGestion) partes.push('Gestión')
    if (tieneAdmin)   partes.push('Administración')
    return partes.join(' + ')
  }

  async function persistir({ nuevoG, nuevoA }) {
    onError?.('')
    if (!usuario?.id) return
    const base = Array.isArray(usuario.dependencias_acceso)
      ? usuario.dependencias_acceso.filter(d => d?.dependencia_id !== dep.id)
      : []
    const proximas = [...base]
    if (nuevoG || nuevoA) {
      proximas.push({
        dependencia_id:    dep.id,
        puede_gestionar:   !!nuevoG,
        puede_administrar: !!nuevoA,
      })
    }
    try {
      await updateMut.mutateAsync({ id: usuario.id, dependencias_acceso: proximas })
      onSaved?.(nuevoG || nuevoA ? '✓ Permisos guardados' : '✓ Acceso removido')
    } catch (e) {
      onError?.(e?.message ?? 'No pudimos guardar los permisos.')
    }
  }

  return (
    <div className={cardClasses}>
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
          tieneAcceso ? 'bg-accent-50 text-accent-700' : 'bg-primary-50 text-primary-500'
        }`}>
          <DepIcon tipo={dep.tipo} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-sora text-sm font-bold text-primary">{dep.nombre}</p>
          <p className="text-xs text-primary-400">{resumenAcceso()}</p>
        </div>
      </div>

      {tieneAcceso && !expanded && !soloInfo && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tieneGestion && (
            <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-700">
              Gestión
            </span>
          )}
          {tieneAdmin && (
            <span className="inline-flex items-center rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold text-accent-700">
              Administración
            </span>
          )}
        </div>
      )}

      <div className="mt-4">
        {soloInfo ? (
          <p className="text-xs italic text-primary-400">
            Esta dependencia es solo informativa — no requiere asignar permisos.
          </p>
        ) : !expanded ? (
          <Button
            variant={tieneAcceso ? 'secondary' : 'primary'}
            size="sm"
            onClick={onExpand}
            disabled={disabled}
            className="w-full"
          >
            {tieneAcceso ? 'Editar acceso' : 'Asignar acceso'}
          </Button>
        ) : (
          // Re-mount cuando se expande: la key cambia y el form
          // local se inicializa con el acceso actual sin necesidad
          // de useEffect+setState (que React Compiler prohíbe).
          <DependenciaCardForm
            key={`${dep.id}-${tieneGestion ? 1 : 0}-${tieneAdmin ? 1 : 0}`}
            secciones={secciones}
            initialG={tieneGestion}
            initialA={tieneAdmin}
            tieneAcceso={tieneAcceso}
            saving={updateMut.isPending}
            onCancel={onCollapse}
            onSave={({ g, a }) => persistir({ nuevoG: g, nuevoA: a })}
            onQuitar={() => persistir({ nuevoG: false, nuevoA: false })}
          />
        )}
      </div>
    </div>
  )
}

// Form local de la card. Se monta al abrir y se desmonta al
// cerrar, así el estado inicial siempre refleja el acceso
// vigente sin disparar setState dentro de un effect.
function DependenciaCardForm({
  secciones, initialG, initialA, tieneAcceso, saving,
  onCancel, onSave, onQuitar,
}) {
  const [pendG, setPendG] = useState(initialG)
  const [pendA, setPendA] = useState(initialA)

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-700">
        Secciones
      </p>
      <div className="space-y-2">
        {secciones.map(s => {
          const checked = s.kind === 'gestion' ? pendG : pendA
          const onChange = s.kind === 'gestion' ? setPendG : setPendA
          return (
            <label
              key={s.kind}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-white p-2.5 text-sm hover:border-primary-200"
            >
              <input
                type="checkbox"
                checked={!!checked}
                onChange={e => onChange(e.target.checked)}
                className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-primary">{s.label}</p>
                {s.desc && <p className="text-xs text-primary-400">{s.desc}</p>}
              </div>
            </label>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="text-xs font-medium text-primary-500 hover:text-primary"
          disabled={saving}
        >
          Cancelar
        </button>
        <div className="flex gap-2">
          {tieneAcceso && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onQuitar}
              loading={saving}
            >
              Quitar acceso
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => onSave({ g: pendG, a: pendA })}
            loading={saving}
            disabled={!pendG && !pendA && !tieneAcceso}
          >
            Guardar
          </Button>
        </div>
      </div>
    </div>
  )
}
