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
//      Click selecciona y monta el panel de permisos debajo.
//   2) Panel "Permisos de: <Nombre>" con botón X para deseleccionar.
//   3) Tabla compacta de 3 columnas: dependencia + checkbox Gestión
//      + checkbox Administración. Auto-guarda al cambiar cualquier
//      checkbox. Separadores visuales por grupo (CIC / Dependencias
//      operativas / Solo información).
//
// Mobile-first: la tabla tiene overflow-x-auto para scrollearse en
// pantallas chicas sin romper el layout.
// ─────────────────────────────────────────────────────────────────

// Agrupamiento de tipos para los separadores de la tabla. CIC son
// las 4 dependencias del CIC con módulo dedicado; SOLO_INFO son las
// que no tienen permisos (educación / jardín / policial); el resto
// cae en DEPENDENCIAS.
const TIPOS_GRUPO_CIC = new Set(['caps', 'salud', 'sala', 'juzgado', 'juez', 'sum', 'salon', 'social', 'ayuda_social'])
const TIPOS_GRUPO_INFO = new Set([
  'educacion', 'educacion_sec', 'escuela',
  'jardin', 'jardin_infantes', 'primaria', 'secundaria',
  'policia', 'policial', 'delegacion_policial',
])

function grupoDeTipo(tipo) {
  const t = (tipo ?? '').toLowerCase()
  if (TIPOS_GRUPO_CIC.has(t))  return 'cic'
  if (TIPOS_GRUPO_INFO.has(t)) return 'info'
  return 'deps'
}

const GRUPO_LABEL = {
  cic:  'CIC',
  deps: 'Dependencias',
  info: 'Solo información',
}

// Saved row de dependencias_acceso para (usuarioId, depId), o
// `{ puede_gestionar: false, puede_administrar: false }` por defecto.
function savedRowFor(usuario, depId) {
  const lista = Array.isArray(usuario?.dependencias_acceso) ? usuario.dependencias_acceso : []
  return lista.find(d => d?.dependencia_id === depId) ?? null
}

// Compara un toggle "next" contra el saved state. Si igual, el
// cambio se cancela (key se elimina de cambiosPendientes).
function savedFlag(usuario, depId, kind) {
  const r = savedRowFor(usuario, depId)
  return kind === 'gestion' ? !!r?.puede_gestionar : !!r?.puede_administrar
}

// Truncado para mostrar nombres en chips estrechos.
function nombreCorto(nombre, max = 12) {
  const n = (nombre ?? '').trim()
  if (n.length <= max) return n
  return n.slice(0, max - 1).trimEnd() + '…'
}

function nivelDeAcceso(row) {
  if (!row) return null
  const g = !!row.puede_gestionar
  const a = !!row.puede_administrar
  if (g && a) return 'G+A'
  if (g)      return 'G'
  if (a)      return 'A'
  return null
}

// Resuelve dep por id. La buscamos en el array completo de
// dependencias del municipio para poder mostrar nombre + tipo.
function getDependenciaPorId(depId, dependencias) {
  if (!depId || !Array.isArray(dependencias)) return null
  return dependencias.find(d => d?.id === depId) ?? null
}

// Chips inline con resumen de las dependencias asignadas a un
// usuario. Muestra hasta 2 chips + botón "+N más" que abre un
// popover con el listado completo. El director ve un mensaje fijo
// porque su rol le da acceso total (sin necesidad de filas en
// dependencias_acceso).
function ResumenDependenciasUsuario({
  usuario, dependencias, isDirector, popoverOpen, onTogglePopover,
}) {
  const filas = useMemo(() => {
    if (isDirector) return []
    const raw = Array.isArray(usuario?.dependencias_acceso) ? usuario.dependencias_acceso : []
    return raw
      .map(r => {
        const dep = getDependenciaPorId(r?.dependencia_id, dependencias)
        if (!dep) return null
        return { dep, nivel: nivelDeAcceso(r) }
      })
      .filter(f => f && f.nivel)
      .sort((a, b) => (a.dep.nombre ?? '').localeCompare(b.dep.nombre ?? ''))
  }, [usuario, dependencias, isDirector])

  if (isDirector) {
    return (
      <p className="mt-1 text-[11px] italic text-accent-700">
        Acceso total a todas las dependencias
      </p>
    )
  }
  if (filas.length === 0) {
    return (
      <p className="mt-1 text-[11px] text-primary-400">
        Sin dependencias asignadas
      </p>
    )
  }

  const visibles = filas.slice(0, 2)
  const extras   = filas.length - visibles.length

  return (
    <div className="relative mt-1 flex flex-wrap items-center gap-1.5">
      {visibles.map(({ dep, nivel }) => (
        <span
          key={dep.id}
          title={`${dep.nombre} · ${nivel}`}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700 ring-1 ring-inset ring-primary-100"
        >
          <span className="text-primary-500" aria-hidden="true">
            <DepIcon tipo={dep.tipo} className="h-3 w-3" />
          </span>
          <span className="truncate">{nombreCorto(dep.nombre)}</span>
          <span className="rounded bg-white px-1 text-[9px] font-bold text-primary-700 ring-1 ring-inset ring-primary-100">
            {nivel}
          </span>
        </span>
      ))}
      {extras > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onTogglePopover() }}
          className="popover-trigger inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold text-accent-700 ring-1 ring-inset ring-accent-100 hover:bg-accent-100"
        >
          +{extras} más
        </button>
      )}
      {popoverOpen && (
        <div
          className="popover-resumen absolute left-0 top-full z-50 mt-1.5 w-64 rounded-lg border border-border bg-white p-3 text-left shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-accent-700">
            Dependencias asignadas
          </p>
          <ul className="space-y-1.5">
            {filas.map(({ dep, nivel }) => (
              <li key={dep.id} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-500">
                  <DepIcon tipo={dep.tipo} className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">
                  {dep.nombre}
                </span>
                <span className="rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold text-accent-700 ring-1 ring-inset ring-accent-100">
                  {nivel}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function PermisosPorPersona({
  usuarios, dependencias, isLoading,
  puedeEditarUsuario, onInvitar, onError,
}) {
  const updateMut = useUpdatePermisosUsuario()
  const [query, setQuery]                       = useState('')
  const [selectedId, setSelectedId]             = useState(null)
  const [okMsg, setOkMsg]                       = useState('')
  // Cambios sin guardar acumulados a través del wizard. Shape:
  //   { [usuarioId]: { [dependenciaId]: { puede_gestionar?, puede_administrar? } } }
  // Solo se guarda la flag que efectivamente cambió respecto del
  // snapshot persistido; si una flag vuelve a igualar el saved value,
  // la key se elimina (y si la fila queda vacía, también).
  const [cambiosPendientes, setCambiosPendientes] = useState({})
  const [saving, setSaving]                       = useState(false)
  // Popover "+N más" — sólo uno abierto a la vez. Se cierra al
  // clickear afuera (listener registrado más abajo) o al cambiar
  // de empleado seleccionado.
  const [popoverUserId, setPopoverUserId]         = useState(null)

  useEffect(() => {
    if (!okMsg) return
    const t = setTimeout(() => setOkMsg(''), 2000)
    return () => clearTimeout(t)
  }, [okMsg])

  // Listener global para cerrar el popover al clickear afuera. Se
  // registra solo mientras hay un popover abierto para evitar
  // costo innecesario y se limpia en la cleanup del efecto.
  useEffect(() => {
    if (!popoverUserId) return
    const handler = (e) => {
      const inside = e.target.closest('.popover-resumen, .popover-trigger')
      if (!inside) setPopoverUserId(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [popoverUserId])

  const candidatos = useMemo(() => {
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

  // Total global de toggles pendientes (puede_gestionar + puede_administrar
  // cuentan por separado). Lo mostramos junto al botón Guardar.
  const totalCambios = useMemo(() => {
    let n = 0
    for (const userMap of Object.values(cambiosPendientes)) {
      for (const depMap of Object.values(userMap ?? {})) {
        if ('puede_gestionar'   in (depMap ?? {})) n++
        if ('puede_administrar' in (depMap ?? {})) n++
      }
    }
    return n
  }, [cambiosPendientes])

  // True si un usuario tiene al menos un toggle pendiente. Se usa
  // para el indicador "punto gold" en su card del buscador.
  function userHasPending(userId) {
    const m = cambiosPendientes[userId]
    if (!m) return false
    for (const depMap of Object.values(m)) {
      if ('puede_gestionar'   in (depMap ?? {})) return true
      if ('puede_administrar' in (depMap ?? {})) return true
    }
    return false
  }

  // Toggle de un checkbox: actualiza solo el estado local. Si el
  // próximo valor coincide con el saved, eliminamos la key (no es
  // un cambio real); si la fila queda vacía, eliminamos la fila.
  function setPendiente(userId, depId, kind, nextValue) {
    const usuario = (usuarios ?? []).find(u => u.id === userId)
    if (!usuario) return
    const flagKey = kind === 'gestion' ? 'puede_gestionar' : 'puede_administrar'
    const savedValue = savedFlag(usuario, depId, kind)

    setCambiosPendientes(prev => {
      const userMap = { ...(prev[userId] ?? {}) }
      const depMap  = { ...(userMap[depId] ?? {}) }
      if (nextValue === savedValue) {
        delete depMap[flagKey]
      } else {
        depMap[flagKey] = nextValue
      }
      const tieneFlags = 'puede_gestionar' in depMap || 'puede_administrar' in depMap
      if (tieneFlags) {
        userMap[depId] = depMap
      } else {
        delete userMap[depId]
      }
      const next = { ...prev }
      if (Object.keys(userMap).length > 0) {
        next[userId] = userMap
      } else {
        delete next[userId]
      }
      return next
    })
  }

  // Valor "efectivo" de un checkbox: pending si existe, si no el
  // saved value de la DB. Sirve tanto para el render como para el
  // chequeo de pending al hacer click.
  function effectiveFlag(userId, depId, kind) {
    const usuario = (usuarios ?? []).find(u => u.id === userId)
    if (!usuario) return false
    const flagKey = kind === 'gestion' ? 'puede_gestionar' : 'puede_administrar'
    const pending = cambiosPendientes[userId]?.[depId]
    if (pending && flagKey in pending) return !!pending[flagKey]
    return savedFlag(usuario, depId, kind)
  }

  function isCellPending(userId, depId, kind) {
    const flagKey = kind === 'gestion' ? 'puede_gestionar' : 'puede_administrar'
    return flagKey in (cambiosPendientes[userId]?.[depId] ?? {})
  }

  // Combina saved + pending de un usuario en el array final que se
  // persiste en dependencias_acceso.
  function combinedAccesoFor(userId) {
    const usuario = (usuarios ?? []).find(u => u.id === userId)
    if (!usuario) return []
    const saved = Array.isArray(usuario.dependencias_acceso) ? usuario.dependencias_acceso : []
    const pending = cambiosPendientes[userId] ?? {}
    const byDep = new Map()
    for (const row of saved) {
      if (!row?.dependencia_id) continue
      byDep.set(row.dependencia_id, {
        dependencia_id:    row.dependencia_id,
        puede_gestionar:   !!row.puede_gestionar,
        puede_administrar: !!row.puede_administrar,
      })
    }
    for (const [depId, patch] of Object.entries(pending)) {
      const current = byDep.get(depId) ?? {
        dependencia_id: depId, puede_gestionar: false, puede_administrar: false,
      }
      byDep.set(depId, {
        ...current,
        ...('puede_gestionar'   in patch ? { puede_gestionar:   !!patch.puede_gestionar   } : {}),
        ...('puede_administrar' in patch ? { puede_administrar: !!patch.puede_administrar } : {}),
      })
    }
    return Array.from(byDep.values()).filter(r => r.puede_gestionar || r.puede_administrar)
  }

  async function handleGuardar() {
    onError?.('')
    setSaving(true)
    const fallos = []
    try {
      for (const userId of Object.keys(cambiosPendientes)) {
        try {
          await updateMut.mutateAsync({
            id: userId,
            dependencias_acceso: combinedAccesoFor(userId),
          })
        } catch (e) {
          const u = (usuarios ?? []).find(x => x.id === userId)
          fallos.push(`${u?.nombre ?? userId}: ${e?.message ?? 'error'}`)
        }
      }
      if (fallos.length > 0) {
        onError?.('No pudimos guardar algunos cambios — ' + fallos.join(' · '))
      } else {
        setCambiosPendientes({})
        setOkMsg('✓ Permisos guardados correctamente')
      }
    } finally {
      setSaving(false)
    }
  }

  function handleCancelar() {
    if (totalCambios === 0) return
    setCambiosPendientes({})
    setOkMsg('Cambios descartados')
    onError?.('')
  }

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
              const isDirector   = rol === 'admin_comuna'
              const pending      = userHasPending(u.id)
              const popoverOpen  = popoverUserId === u.id
              // La card se vuelve <div role="button"> para poder
              // anidar el botón "+N más" del resumen (HTML no
              // permite buttons dentro de buttons).
              const onActivate = () => { setSelectedId(u.id); onError?.('') }
              return (
                <div
                  key={u.id}
                  role="button"
                  tabIndex={0}
                  onClick={onActivate}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate() }
                  }}
                  className={`relative flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    seleccionado
                      ? 'border-accent-300 bg-primary-50/60 ring-1 ring-accent-200'
                      : pending
                        ? 'border-accent-200 bg-accent-50/30 hover:border-accent-300'
                        : 'border-border bg-white hover:border-primary-200 hover:bg-primary-50/40'
                  }`}
                >
                  {pending && (
                    <span
                      aria-label="Tiene cambios sin guardar"
                      title="Tiene cambios sin guardar"
                      className="absolute right-2 top-2 inline-block h-2 w-2 rounded-full bg-accent shadow ring-2 ring-white"
                    />
                  )}
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
                    {/* Línea separadora antes del resumen de deps. */}
                    <div className="mt-2 h-px w-full bg-border/70" aria-hidden="true" />
                    <ResumenDependenciasUsuario
                      usuario={u}
                      dependencias={dependencias}
                      isDirector={isDirector}
                      popoverOpen={popoverOpen}
                      onTogglePopover={() => setPopoverUserId(popoverOpen ? null : u.id)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* PASO 2 · Tabla compacta de permisos. NO se remonta al
          cambiar de usuario — el estado pendiente es global y
          sobrevive al switch. */}
      {selectedUser && (
        <TablaPermisos
          usuario={selectedUser}
          dependencias={dependencias}
          esDirector={esDirector}
          editable={editable}
          totalCambios={totalCambios}
          saving={saving}
          onDeseleccionar={() => setSelectedId(null)}
          onGuardar={handleGuardar}
          onCancelar={handleCancelar}
          effectiveFlag={effectiveFlag}
          isCellPending={isCellPending}
          setPendiente={setPendiente}
        />
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
// TablaPermisos — vista compacta del acceso del usuario seleccionado
//
// Stateless por diseño: la verdad sobre flags efectivos y cambios
// pendientes la mantiene PermisosPorPersona (un mapa por usuario).
// Esto evita el "vibe" del auto-save al cambiar checkboxes — cada
// toggle solo actualiza estado local en el padre hasta que el
// usuario confirma con "Guardar cambios".
// ─────────────────────────────────────────────────────────────────

function TablaPermisos({
  usuario, dependencias, esDirector, editable,
  totalCambios, saving,
  onDeseleccionar, onGuardar, onCancelar,
  effectiveFlag, isCellPending, setPendiente,
}) {
  // Ordeno y agrupo dependencias: CIC → Dependencias → Solo info.
  const filasPorGrupo = useMemo(() => {
    const out = { cic: [], deps: [], info: [] }
    for (const d of (dependencias ?? [])) {
      out[grupoDeTipo(d.tipo)].push(d)
    }
    for (const g of Object.keys(out)) {
      out[g].sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
    }
    return out
  }, [dependencias])

  const disabled    = !editable || esDirector || saving
  const hasPending  = totalCambios > 0

  return (
    <section className="space-y-3">
      {/* Header del panel — título + nombre + acciones Guardar/Cancelar */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-primary-50/40 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-700">
            Permisos de
          </p>
          <p className="truncate font-sora text-base font-bold text-primary">
            {usuario.nombre || usuario.email || 'Sin nombre'}
          </p>
          {esDirector && (
            <p className="mt-1 text-xs text-primary-500">
              Tiene rol de <strong>Admin Comuna</strong> — acceso total por rol. No
              requiere asignación manual.
            </p>
          )}
          {!esDirector && !editable && (
            <p className="mt-1 text-xs text-primary-500">
              No podés editar los permisos de este usuario desde tu rol.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasPending && (
            <span className="text-xs font-semibold text-accent-700">
              {totalCambios} {totalCambios === 1 ? 'cambio sin guardar' : 'cambios sin guardar'}
            </span>
          )}
          {hasPending && (
            <button
              type="button"
              onClick={onCancelar}
              disabled={saving}
              className="inline-flex items-center justify-center rounded-md border-2 border-primary/30 bg-white px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
          )}
          <Button onClick={onGuardar} loading={saving} disabled={!hasPending || saving}>
            Guardar cambios
          </Button>
          <button
            type="button"
            onClick={onDeseleccionar}
            className="rounded-md p-1.5 text-primary-400 transition-colors hover:bg-primary-100 hover:text-primary"
            aria-label="Deseleccionar"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </div>
      </div>

      {dependencias.length === 0 ? (
        <div className="card p-8 text-center text-sm text-primary-400">
          Este municipio no tiene dependencias activas. Cargá al menos una para
          configurar permisos por área.
        </div>
      ) : (
        // Scroll horizontal en mobile para que la tabla no se rompa.
        <div className="card overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-primary-50/60">
              <tr>
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-primary-500">
                  Dependencia
                </th>
                <th className="px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-primary-500" style={{ width: 140 }}>
                  Gestión
                </th>
                <th className="px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-primary-500" style={{ width: 160 }}>
                  Administración
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(['cic', 'deps', 'info']).flatMap(g => {
                const filas = filasPorGrupo[g]
                if (!filas?.length) return []
                const rows = [
                  <tr key={`sep-${g}`} className="bg-[#0F1C35]/5">
                    <td colSpan={3} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#C9A84C]">
                      {GRUPO_LABEL[g]}
                    </td>
                  </tr>,
                ]
                for (const dep of filas) {
                  const grupo = g
                  const isInfo = grupo === 'info'
                  const gestion       = effectiveFlag(usuario.id, dep.id, 'gestion')
                  const admin         = effectiveFlag(usuario.id, dep.id, 'admin')
                  const pendingGestion = isCellPending(usuario.id, dep.id, 'gestion')
                  const pendingAdmin   = isCellPending(usuario.id, dep.id, 'admin')
                  rows.push(
                    <tr key={dep.id} className="hover:bg-primary-50/40">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2.5">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                            (gestion || admin)
                              ? 'bg-accent-50 text-accent-700'
                              : 'bg-primary-50 text-primary-500'
                          }`}>
                            <DepIcon tipo={dep.tipo} className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-medium text-primary">{dep.nombre}</span>
                        </div>
                      </td>
                      {isInfo ? (
                        <>
                          <td className="px-4 py-2 text-center">
                            <span className="text-xs italic text-primary-400">Solo informativa</span>
                          </td>
                          <td className="px-4 py-2 text-center text-primary-300">—</td>
                        </>
                      ) : (
                        <>
                          <PermisoCell
                            pending={pendingGestion}
                            checked={gestion}
                            disabled={disabled}
                            ariaLabel={`Gestión en ${dep.nombre}`}
                            onChange={v => setPendiente(usuario.id, dep.id, 'gestion', v)}
                          />
                          <PermisoCell
                            pending={pendingAdmin}
                            checked={admin}
                            disabled={disabled}
                            ariaLabel={`Administración en ${dep.nombre}`}
                            onChange={v => setPendiente(usuario.id, dep.id, 'admin', v)}
                          />
                        </>
                      )}
                    </tr>,
                  )
                }
                return rows
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// Celda con checkbox + borde gold sutil cuando el toggle está
// pendiente de guardar. Inline styles para el ring porque Tailwind
// no expone un ring-around-table-cell sin afectar el row entero.
function PermisoCell({ pending, checked, disabled, onChange, ariaLabel }) {
  return (
    <td
      className={`px-4 py-2 text-center transition-colors ${
        pending ? 'bg-accent-50/60 ring-1 ring-inset ring-accent-300' : ''
      }`}
    >
      <label className="inline-flex cursor-pointer items-center justify-center" aria-label={ariaLabel}>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={e => onChange(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[#C9A84C] disabled:cursor-not-allowed disabled:opacity-50"
        />
      </label>
    </td>
  )
}
