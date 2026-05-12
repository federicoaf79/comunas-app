import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useDependencias } from '../../hooks/useTurnos'
import Spinner from '../../components/ui/Spinner'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import UsuarioInvitarModal from '../../components/admin/UsuarioInvitarModal'
import { dateOf } from '../../lib/datetime'

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
    .select('id, municipio_id, roles, dependencias_ids, dependencias_acceso, nombre, email, activo, created_at')
    .order('nombre', { ascending: true })
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// Reemplaza el array completo de `dependencias_acceso` para un
// usuario. Es la única operación de escritura del Tablero de
// permisos — cada cambio de celda dispara una mutación con el
// array recomputado client-side.
async function updateDependenciasAcceso(id, dependencias_acceso) {
  const { error } = await supabase
    .from('usuarios')
    .update({ dependencias_acceso })
    .eq('id', id)
  if (error) throw error
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

  // Catálogo de dependencias activas — la matriz de permisos usa
  // estas como columnas. Filtramos por activa para no contaminar
  // con dependencias soft-eliminadas.
  // OJO: este useMemo debe vivir ANTES del early-return de
  // canManageUsers para no romper rules-of-hooks.
  const depsActivas = useMemo(
    () => (dependencias ?? []).filter(d => d.activa !== false),
    [dependencias],
  )

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
            Gestión de usuarios, roles y permisos por dependencia.
          </p>
        </div>
        {view === 'lista' && (
          <Button onClick={() => { setError(''); setModalOpen(true) }}>
            + Invitar usuario
          </Button>
        )}
      </header>

      <Tabs
        tabs={[
          { value: 'lista',    label: 'Lista de usuarios' },
          { value: 'permisos', label: 'Tablero de permisos' },
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
        <TableroPermisos
          usuarios={usuariosQ.data ?? []}
          dependencias={depsActivas}
          isLoading={usuariosQ.isLoading}
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
// Tablero matricial de permisos por dependencia
//
// Una fila por usuario (sin superadmin), una columna por
// dependencia activa. Cada celda es un <select> con 4 opciones:
//
//   ''   → Sin acceso (remove del array)
//   'g'  → Solo gestión          (puede_gestionar=true,  admin=false)
//   'a'  → Solo administración   (puede_gestionar=false, admin=true)
//   'ga' → Gestión + administr.  (ambos true)
//
// Los `admin_comuna` muestran "Director — acceso total" en todas
// las celdas, no editable: ya tienen todo por rol.
// ─────────────────────────────────────────────────────────────────

const PERMISO_OPCIONES = [
  { value: '',   label: '— Sin acceso' },
  { value: 'g',  label: '👁 Solo gestión' },
  { value: 'a',  label: '💰 Solo administración' },
  { value: 'ga', label: '✅ Gestión + administración' },
]

// Deriva el code 'g'|'a'|'ga'|null a partir del row del array.
function accesoCode(row) {
  if (!row) return ''
  const g = !!row.puede_gestionar
  const a = !!row.puede_administrar
  if (g && a) return 'ga'
  if (g)      return 'g'
  if (a)      return 'a'
  return ''
}

// Construye un nuevo array `dependencias_acceso` para el usuario
// reemplazando la entrada con `dependencia_id`. Si `code` es ''
// (sin acceso), remueve la entrada por completo.
function rebuildAcceso(actual, dependenciaId, code) {
  const base = Array.isArray(actual) ? actual.filter(d => d?.dependencia_id !== dependenciaId) : []
  if (!code) return base
  return [...base, {
    dependencia_id:    dependenciaId,
    puede_gestionar:   code === 'g'  || code === 'ga',
    puede_administrar: code === 'a'  || code === 'ga',
  }]
}

function TableroPermisos({ usuarios, dependencias, isLoading, onError }) {
  const qc = useQueryClient()
  const [ok, setOk] = useState('')
  const [savingKey, setSavingKey] = useState(null) // `${userId}-${depId}` mientras escribe

  // Toast de éxito autoclear 2s.
  useEffect(() => {
    if (!ok) return
    const t = setTimeout(() => setOk(''), 2000)
    return () => clearTimeout(t)
  }, [ok])

  const updateMut = useMutation({
    mutationFn: ({ id, dependencias_acceso }) =>
      updateDependenciasAcceso(id, dependencias_acceso),
    onMutate:  (vars) => setSavingKey(`${vars.id}-${vars._depId}`),
    onSettled: () => setSavingKey(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-usuarios'] })
      setOk('✓ Permisos actualizados')
    },
    onError: (e) => onError?.(e?.message ?? 'No pudimos guardar los permisos.'),
  })

  // Filas: excluyo a los superadmin del tablero (acceso global por
  // rol, no por celda). admin_comuna se muestra como "Director".
  const filas = useMemo(() => {
    return (usuarios ?? [])
      .filter(u => !u.roles?.includes('superadmin'))
      .filter(u => u.activo !== false)
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
  }, [usuarios])

  function handleCambio(u, dep, codeNuevo) {
    onError?.('')
    const nextArr = rebuildAcceso(u.dependencias_acceso, dep.id, codeNuevo)
    updateMut.mutate({
      id: u.id,
      dependencias_acceso: nextArr,
      _depId: dep.id,
    })
  }

  if (isLoading) {
    return <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
  }
  if (filas.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-primary-400">
        No hay usuarios activos para mostrar en el tablero.
      </div>
    )
  }
  if (dependencias.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-primary-400">
        Este municipio no tiene dependencias activas. Cargá al menos una para
        configurar permisos por área.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {ok && (
        <div className="inline-flex rounded-md border border-ok-100 bg-ok-50 px-3 py-1.5 text-xs font-medium text-ok-700">
          {ok}
        </div>
      )}
      <p className="text-xs text-primary-400">
        Cada celda guarda al cambiar — no hay botón global. Los
        <b className="ml-1 mr-1">admin de comuna</b> tienen acceso total a todas
        las dependencias por rol; el superadmin no aparece en el tablero.
      </p>

      <Table>
        <THead>
          <Tr>
            <Th className="sticky left-0 z-10 bg-primary-50 min-w-[200px]">
              Usuario / Rol global
            </Th>
            {dependencias.map(d => (
              <Th key={d.id} className="min-w-[180px]">
                <span className="block truncate" title={d.nombre}>
                  {d.nombre}
                </span>
                {d.tipo && (
                  <span className="block text-[10px] font-normal uppercase tracking-wider text-primary-400">
                    {d.tipo}
                  </span>
                )}
              </Th>
            ))}
          </Tr>
        </THead>
        <tbody>
          {filas.map(u => {
            const rol = rolPrincipal(u.roles)
            const esDirector = rol === 'admin_comuna'
            return (
              <Tr key={u.id}>
                <Td className="sticky left-0 z-10 bg-white min-w-[200px]">
                  <p className="font-medium text-primary">{u.nombre || '—'}</p>
                  <p className="text-xs text-primary-400">
                    {ROLE_LABEL[rol] ?? rol ?? 'Sin rol'}
                  </p>
                </Td>
                {dependencias.map(d => {
                  const key = `${u.id}-${d.id}`
                  const saving = savingKey === key && updateMut.isPending
                  if (esDirector) {
                    return (
                      <Td key={d.id} className="text-center">
                        <span className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-700 ring-1 ring-inset ring-accent-100">
                          Director · acceso total
                        </span>
                      </Td>
                    )
                  }
                  const row = (u.dependencias_acceso ?? []).find(x => x?.dependencia_id === d.id)
                  const value = accesoCode(row)
                  return (
                    <Td key={d.id}>
                      <select
                        value={value}
                        disabled={saving}
                        onChange={e => handleCambio(u, d, e.target.value)}
                        className="input-field py-1 text-xs disabled:opacity-50"
                      >
                        {PERMISO_OPCIONES.map(o => (
                          <option key={o.value || 'none'} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Td>
                  )
                })}
              </Tr>
            )
          })}
        </tbody>
      </Table>
    </div>
  )
}
