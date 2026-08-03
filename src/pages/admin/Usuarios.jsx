import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useDependencias } from '../../hooks/useTurnos'
import { useTieneModulo } from '../../hooks/useModulos'
import { useUpdatePermisosUsuario, useUpdatePermisosModulosUsuario } from '../../hooks/useUsuariosAdmin'
import { createAuditLog } from '../../hooks/useAuditLog'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[Usuarios] audit log:', e.message))
}
import Avatar from '../../components/ui/Avatar'
import Spinner from '../../components/ui/Spinner'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Tabs from '../../components/ui/Tabs'
import FormError from '../../components/ui/FormError'
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

const ROLES_INFO = {
  superadmin: 'Acceso total a todos los municipios. Solo Frey Consulting.',
  admin_comuna: 'Administrador del municipio. Acceso completo a todos los módulos.',
  admin_portal_web: 'Gestiona el portal ciudadano: noticias, trámites, historia.',
  admin_portal: 'Gestiona el portal ciudadano: noticias, trámites, historia.',
  usuario_admin: 'Acceso a operaciones administrativas cross-dependencias.',
  subadmin: 'Administrador de una dependencia específica.',
  usuario_sub: 'Operador de una dependencia. Carga turnos y datos.',
  reporting: 'Solo lectura. Puede ver reportes y exportar datos.',
  vecino: 'Ciudadano registrado. Acceso al portal y sus turnos.',
}

// 'reporting' está temporalmente fuera del catálogo asignable.
// Su descripción dice "Solo lectura", pero hoy is_staff() lo incluye
// y hereda ESCRITURA completa vía las ~15 policies ALL — un usuario
// con este rol podría insertar y borrar historia clínica. Volver a
// habilitarlo recién cuando RLS distinga lectura de escritura
// (is_staff() vs. una función de escritura que lo excluya).
// Verificado 2026-07-28: ningún usuario lo tiene asignado.
//
// 'operador' tiene el mismo problema de fondo (está en is_staff()),
// pero nunca estuvo en este catálogo de la UI -- no hay nada que sacar,
// solo dejar constancia acá para no repetir la investigación.
const ROLES = [
  { value: 'superadmin',    label: 'Superadmin',             desc: ROLES_INFO.superadmin },
  { value: 'admin_comuna',  label: 'Admin Comuna',           desc: ROLES_INFO.admin_comuna },
  { value: 'admin_portal',  label: 'Admin Portal',           desc: ROLES_INFO.admin_portal },
  { value: 'usuario_admin', label: 'Usuario Admin',          desc: ROLES_INFO.usuario_admin },
  { value: 'subadmin',      label: 'Subadmin de dependencia', desc: ROLES_INFO.subadmin },
  { value: 'usuario_sub',   label: 'Usuario de dependencia',  desc: ROLES_INFO.usuario_sub },
  { value: 'vecino',        label: 'Vecino',                 desc: ROLES_INFO.vecino },
]
const ROLE_LABEL = Object.fromEntries(ROLES.map(r => [r.value, r.label]))

const FILTRO_ROL_OPTS = ROLES.map(r => ({ value: r.value, label: r.label }))
// El count de "Inactivos" se arma en runtime (mismo patrón que
// "Pendientes (N)" en CrmVecinos.jsx) — no puede ser un const estático
// porque depende de la data cargada.
function filtroEstadoOpts(inactivosCount) {
  return [
    { value: 'activo',   label: 'Activos' },
    { value: 'inactivo', label: `Inactivos (${inactivosCount})` },
  ]
}

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
    .select('id, municipio_id, roles, dependencias_ids, dependencias_acceso, modulos_acceso, nombre, email, activo, puede_emitir_vales, created_at, aprobado_en')
    .order('nombre', { ascending: true })
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

async function updateUsuarioRol(id, nuevoRol) {
  const { data: row, error } = await supabase
    .from('usuarios')
    .update({ roles: [nuevoRol] })
    .eq('id', id)
    .select('nombre, email')
    .single()
  if (error) throw error
  logAudit({
    accion: 'update', entidad: 'usuarios', entidadId: id,
    descripcion: `Rol actualizado — ${row?.nombre ?? row?.email ?? id} → ${nuevoRol}`,
  })
}

// aprobadoEnActual viene del row ya cargado en pantalla — al activar,
// si nunca se aprobó antes (null), queda marcada la primera aprobación
// real. En una reactivación posterior (aprobado_en ya tiene fecha) no
// se pisa: la columna responde "¿alguna vez lo aprobaron?", no "¿cuándo
// fue el último toggle?" — esa distinción es la que separa a alguien
// recién invitado (nunca aprobado, ver Login.jsx) de alguien que ya
// trabajó acá y fue desactivado después.
async function toggleUsuarioActivo(id, activo, aprobadoEnActual) {
  const patch = { activo }
  if (activo && !aprobadoEnActual) {
    patch.aprobado_en = new Date().toISOString()
  }
  const { data: row, error } = await supabase
    .from('usuarios')
    .update(patch)
    .eq('id', id)
    .select('nombre, email')
    .single()
  if (error) throw error
  logAudit({
    accion: 'update', entidad: 'usuarios', entidadId: id,
    descripcion: `${activo ? 'Activación' : 'Desactivación'} de usuario — ${row?.nombre ?? row?.email ?? id}`,
  })
}

// Permiso puntual de emisión de vales — NO es una capacidad de todo
// staff del municipio, admin_comuna se lo otorga a un usuario en
// particular. Columna booleana simple en `usuarios`, mismo patrón
// que toggleUsuarioActivo() de arriba (no el mecanismo de
// dependencias_acceso, que es específico de permisos por dependencia
// y Vales no es una dependencia).
async function toggleUsuarioPuedeEmitirVales(id, puedeEmitir) {
  const { data: row, error } = await supabase
    .from('usuarios')
    .update({ puede_emitir_vales: puedeEmitir })
    .eq('id', id)
    .select('nombre, email')
    .single()
  if (error) throw error
  logAudit({
    accion: 'update', entidad: 'usuarios', entidadId: id,
    descripcion: `${puedeEmitir ? 'Habilitado' : 'Revocado'} permiso de emisión de vales — ${row?.nombre ?? row?.email ?? id}`,
  })
}

// Escribe el email en `vecinos` cuando el vecino elegido en el alta de
// staff todavía no tenía uno cargado — ANTES de invitar, para que el
// email de la invitación y el de `vecinos` nunca puedan divergir (el
// vínculo usuarios↔vecinos es únicamente por email). Si esto falla no
// seguimos a invitarUsuario(): invitar con un email que no quedó
// guardado en `vecinos` reproduciría exactamente el bug que este
// cambio vino a cerrar.
async function actualizarEmailVecino(vecinoId, email) {
  const { error } = await supabase.from('vecinos').update({ email }).eq('id', vecinoId)
  if (error) throw error
}

async function invitarUsuario({ email, nombre, rol, dependencia_id, municipio_id, vecino_id }) {
  const response = await fetch('/api/invite-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      nombre,
      roles: [rol],
      municipio_id,
      dependencia_id,
      vecino_id,
    })
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  logAudit({
    accion: 'create', entidad: 'usuarios', entidadId: data.userId,
    descripcion: `Alta de usuario — ${nombre} (${email}), rol ${rol}`,
  })
}

// "Reenviar invitación" — para inactivos que nunca aceptaron (mail
// perdido, cayó en spam, el link venció). api/resend-invite.js reusa
// generateLink para el mismo usuario en vez de crear uno nuevo.
async function reenviarInvitacion({ id, nombre, email }) {
  const response = await fetch('/api/resend-invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usuario_id: id }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  logAudit({
    accion: 'update', entidad: 'usuarios', entidadId: id,
    descripcion: `Invitación reenviada — ${nombre} (${email})`,
  })
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

  const { municipioId } = useEffectiveMunicipioId()
  const tieneVales = useTieneModulo(municipioId, 'vales')
  // Disponibilidad de los 3 módulos de gestión que ahora entran a la
  // matriz "Permisos por persona" (Parte D) — controla qué filas de
  // MODULOS_GESTION_DEFS se muestran, no reemplaza el gate real de
  // sidebar/ruta (eso vive en AdminLayout.jsx/las páginas mismas).
  const tieneAdministracion = useTieneModulo(municipioId, 'administracion')
  const tieneReclamos = useTieneModulo(municipioId, 'reclamos')
  const modulosGestionDisponibles = useMemo(() => {
    const defs = [
      { modulo: 'vales', label: 'Vales Electrónicos', activo: tieneVales },
      { modulo: 'administracion', label: 'Administración', activo: tieneAdministracion },
      { modulo: 'reclamos', label: 'Reclamos', activo: tieneReclamos },
    ]
    return defs.filter(d => d.activo).map(({ modulo, label }) => ({ modulo, label }))
  }, [tieneVales, tieneAdministracion, tieneReclamos])

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
  const [okMsg, setOkMsg]               = useState('')

  useEffect(() => {
    if (!okMsg) return
    const t = setTimeout(() => setOkMsg(''), 2500)
    return () => clearTimeout(t)
  }, [okMsg])

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
    mutationFn: ({ id, activo, aprobadoEnActual }) => toggleUsuarioActivo(id, activo, aprobadoEnActual),
    onMutate:   ({ id }) => setBusyId(id),
    onSettled:  () => setBusyId(null),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-usuarios'] }),
    onError:    (e) => setError(e?.message ?? 'No pudimos cambiar el estado.'),
  })

  const toggleEmitirValesMut = useMutation({
    mutationFn: ({ id, puedeEmitir }) => toggleUsuarioPuedeEmitirVales(id, puedeEmitir),
    onMutate:   ({ id }) => setBusyId(id),
    onSettled:  () => setBusyId(null),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-usuarios'] }),
    onError:    (e) => setError(e?.message ?? 'No pudimos cambiar el permiso de emisión de vales.'),
  })

  const invitarMut = useMutation({
    mutationFn: invitarUsuario,
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['admin-usuarios'] })
      setModalOpen(false)
    },
    onError:    (e) => setError(e?.message ?? 'No pudimos crear la invitación.'),
  })

  const reenviarMut = useMutation({
    mutationFn: reenviarInvitacion,
    onMutate:   ({ id }) => { setError(''); setBusyId(id) },
    onSettled:  () => setBusyId(null),
    onSuccess:  () => setOkMsg('✓ Invitación reenviada'),
    onError:    (e) => setError(e?.message ?? 'No pudimos reenviar la invitación.'),
  })

  const filtrados = useMemo(() => {
    return (usuariosQ.data ?? []).filter(u => {
      if (filtroEstado === 'activo'   && !u.activo) return false
      if (filtroEstado === 'inactivo' &&  u.activo) return false
      if (filtroRol && rolPrincipal(u.roles) !== filtroRol) return false
      return true
    })
  }, [usuariosQ.data, filtroRol, filtroEstado])

  // Contador de "pendientes de activación" — mismo patrón que
  // "Pendientes (N)" en CrmVecinos.jsx. usuarios.activo no distingue
  // "invitación sin aceptar todavía" de "desactivado a mano" (mismo
  // booleano para las dos cosas, no hay un campo separado) — el
  // wording lo deja explícito en vez de prometer más precisión de la
  // que el dato tiene. Se calcula sobre usuariosQ.data SIN filtrar
  // (no sobre `filtrados`) para que siga siendo visible aunque el
  // admin ya tenga aplicado el filtro "Activos".
  const inactivosCount = useMemo(
    () => (usuariosQ.data ?? []).filter(u => !u.activo).length,
    [usuariosQ.data],
  )

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
    toggleActivoMut.mutate({ id: u.id, activo: !u.activo, aprobadoEnActual: u.aprobado_en })
  }
  function handleToggleEmitirVales(u) {
    setError('')
    toggleEmitirValesMut.mutate({ id: u.id, puedeEmitir: !u.puede_emitir_vales })
  }
  function handleReenviarInvitacion(u) {
    reenviarMut.mutate({ id: u.id, nombre: u.nombre, email: u.email })
  }
  function handleVerInactivos() {
    setView('lista')
    setFiltroEstado('inactivo')
  }
  async function handleInvitar(payload) {
    setError('')
    if (!municipioId) {
      throw new Error('Sin municipio destino. Pedile al administrador que asigne uno.')
    }
    const { vecino, ...rest } = payload
    if (vecino && !vecino.email && rest.email) {
      await actualizarEmailVecino(vecino.id, rest.email)
    }
    // vecino_id viaja a la API para que vincule vecinos.user_id al
    // auth user recién creado — modo manual (vecino === null) no manda
    // nada, a propósito: no hay fila de padrón que vincular.
    await invitarMut.mutateAsync({ ...rest, municipio_id: municipioId, vecino_id: vecino?.id ?? null })
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

      {inactivosCount > 0 && (
        <div className="inline-flex items-center gap-2 rounded-full bg-accent-50 px-3 py-1.5 text-xs font-medium text-accent-700 ring-1 ring-inset ring-accent-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span>
            {inactivosCount} usuario{inactivosCount === 1 ? '' : 's'} inactivo{inactivosCount === 1 ? '' : 's'} — incluye invitaciones sin aceptar todavía
          </span>
          <button
            type="button"
            onClick={handleVerInactivos}
            className="font-semibold text-accent-900 underline decoration-accent-400 underline-offset-2 hover:text-primary"
          >
            Ver inactivos
          </button>
        </div>
      )}

      <Tabs
        tabs={[
          { value: 'lista',    label: 'Lista de usuarios' },
          { value: 'permisos', label: 'Permisos por persona' },
        ]}
        value={view}
        onChange={setView}
      />

      <FormError>{error}</FormError>

      {okMsg && (
        <div className="inline-flex rounded-md border border-ok-100 bg-ok-50 px-3 py-1.5 text-xs font-medium text-ok-700">
          {okMsg}
        </div>
      )}

      {view === 'permisos' && (
        <PermisosPorPersona
          usuarios={usuariosQ.data ?? []}
          dependencias={depsActivas}
          modulosGestion={modulosGestionDisponibles}
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
            options={filtroEstadoOpts(inactivosCount)}
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
              {tieneVales && <Th>Emite vales</Th>}
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
                      <span
                        title={ROLES_INFO[rolActual] ?? rolActual}
                        className="inline-flex cursor-help items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700 ring-1 ring-inset ring-primary-100"
                      >
                        {ROLE_LABEL[rolActual] ?? rolActual ?? 'Sin rol'}
                      </span>
                    )}
                  </Td>
                  <Td><EstadoBadge activo={!!u.activo} /></Td>
                  {tieneVales && (
                    <Td>
                      {editable ? (
                        <button
                          type="button"
                          onClick={() => handleToggleEmitirVales(u)}
                          disabled={busyId === u.id}
                          className={u.puede_emitir_vales
                            ? 'inline-flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-100 hover:opacity-80'
                            : 'inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500 ring-1 ring-inset ring-gray-200 hover:opacity-80'}
                          title="Permiso puntual para emitir vales electrónicos, otorgado por admin_comuna"
                        >
                          {u.puede_emitir_vales ? '🎫 Sí' : 'No'}
                        </button>
                      ) : (
                        <span className="text-xs text-primary-300">{u.puede_emitir_vales ? '🎫 Sí' : 'No'}</span>
                      )}
                    </Td>
                  )}
                  <Td className="whitespace-nowrap text-xs text-primary-400">
                    {u.created_at ? dateOf(u.created_at) : '—'}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {editable ? (
                      <div className="flex items-center justify-end gap-3">
                        {!u.activo && (
                          <button
                            type="button"
                            onClick={() => handleReenviarInvitacion(u)}
                            disabled={busyId === u.id}
                            className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-white px-3 text-xs font-semibold text-primary-700 transition-colors hover:border-primary-200 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Genera un link nuevo y reenvía el mail — para invitaciones perdidas, en spam o vencidas"
                          >
                            Reenviar invitación
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleToggleActivo(u)}
                          disabled={busyId === u.id}
                          className={u.activo
                            ? 'inline-flex h-9 items-center justify-center rounded-md px-3 text-xs font-medium text-danger transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50'
                            : 'inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-xs font-semibold text-primary-900 shadow-sm transition-colors hover:bg-accent-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50'}
                        >
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
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
        municipioId={municipioId}
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

// Módulos de gestión (Parte D) — no son filas de `dependencias`, así
// que no pasan por DepIcon/grupoDeTipo. Mismos glifos que usa el
// sidebar (AdminLayout.jsx NAV_GESTION) para consistencia visual.
function ModuloGestionIcon({ modulo, className = 'h-5 w-5' }) {
  const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', className, 'aria-hidden': 'true' }
  if (modulo === 'vales') return (
    <svg {...base}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path strokeLinecap="round" strokeDasharray="2 2" d="M9 6v12" />
      <circle cx="5.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  )
  if (modulo === 'administracion') return (
    <svg {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h13M8 12h13M8 17h13M3 7h.01M3 12h.01M3 17h.01" />
      <circle cx="3" cy="7"  r="0.6" fill="currentColor" />
      <circle cx="3" cy="12" r="0.6" fill="currentColor" />
      <circle cx="3" cy="17" r="0.6" fill="currentColor" />
    </svg>
  )
  // reclamos (y cualquier módulo futuro sin glifo propio)
  return (
    <svg {...base}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
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

// Equivalentes de savedRowFor/savedFlag para modulos_acceso (Parte D)
// — mismo mecanismo, clave por `modulo` en vez de dependencia_id.
function savedRowForModulo(usuario, modulo) {
  const lista = Array.isArray(usuario?.modulos_acceso) ? usuario.modulos_acceso : []
  return lista.find(m => m?.modulo === modulo) ?? null
}
function savedFlagModulo(usuario, modulo, kind) {
  const r = savedRowForModulo(usuario, modulo)
  return kind === 'gestion' ? !!r?.puede_gestionar : !!r?.puede_administrar
}

// Truncado para mostrar nombres en chips estrechos.
function nombreCorto(nombre, max = 12) {
  const n = (nombre ?? '').trim()
  if (n.length <= max) return n
  return n.slice(0, max - 1).trimEnd() + '…'
}

// Los dos flags (puede_gestionar/puede_administrar) no se distinguen
// en ningún punto del código hoy — ver nota en CLAUDE.md, "Riesgos
// abiertos". La UI los trata como un único "tiene acceso o no".
function tieneAcceso(row) {
  return !!(row?.puede_gestionar || row?.puede_administrar)
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
      .filter(tieneAcceso)
      .map(r => getDependenciaPorId(r?.dependencia_id, dependencias))
      .filter(Boolean)
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
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
      {visibles.map(dep => (
        <span
          key={dep.id}
          title={dep.nombre}
          className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700 ring-1 ring-inset ring-primary-100"
        >
          <span className="text-primary-500" aria-hidden="true">
            <DepIcon tipo={dep.tipo} className="h-3 w-3" />
          </span>
          <span className="truncate">{nombreCorto(dep.nombre)}</span>
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
            {filas.map(dep => (
              <li key={dep.id} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-500">
                  <DepIcon tipo={dep.tipo} className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">
                  {dep.nombre}
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
  usuarios, dependencias, modulosGestion, isLoading,
  puedeEditarUsuario, onInvitar, onError,
}) {
  const updateMut = useUpdatePermisosUsuario()
  const updateModulosMut = useUpdatePermisosModulosUsuario()
  const [query, setQuery]                       = useState('')
  const [selectedId, setSelectedId]             = useState(null)
  const [okMsg, setOkMsg]                       = useState('')
  // Cambios sin guardar acumulados a través del wizard. Shape:
  //   { [usuarioId]: { [dependenciaId]: { puede_gestionar?, puede_administrar? } } }
  // Solo se guarda la flag que efectivamente cambió respecto del
  // snapshot persistido; si una flag vuelve a igualar el saved value,
  // la key se elimina (y si la fila queda vacía, también).
  const [cambiosPendientes, setCambiosPendientes] = useState({})
  // Mismo shape que cambiosPendientes pero para modulos_acceso —
  // { [usuarioId]: { [modulo]: { puede_gestionar?, puede_administrar? } } }.
  // Mapa separado a propósito, no se mezcla con el de dependencias.
  const [cambiosPendientesModulos, setCambiosPendientesModulos] = useState({})
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

  // Total global de checkboxes de "Acceso" pendientes (sumando
  // dependencias Y módulos). Un toggle escribe los dos flags internos
  // a la vez, pero para el conteo cuenta como UN cambio — es una sola
  // casilla en la UI. Lo mostramos junto al botón Guardar.
  function contarPendientes(mapa) {
    let n = 0
    for (const userMap of Object.values(mapa)) {
      for (const rowMap of Object.values(userMap ?? {})) {
        if (rowMap && ('puede_gestionar' in rowMap || 'puede_administrar' in rowMap)) n++
      }
    }
    return n
  }
  const totalCambios = useMemo(
    () => contarPendientes(cambiosPendientes) + contarPendientes(cambiosPendientesModulos),
    [cambiosPendientes, cambiosPendientesModulos],
  )

  // True si un usuario tiene al menos un toggle pendiente (dependencia
  // o módulo). Se usa para el indicador "punto gold" en su card del
  // buscador.
  function userHasPending(userId) {
    for (const mapa of [cambiosPendientes[userId], cambiosPendientesModulos[userId]]) {
      if (!mapa) continue
      for (const rowMap of Object.values(mapa)) {
        if ('puede_gestionar'   in (rowMap ?? {})) return true
        if ('puede_administrar' in (rowMap ?? {})) return true
      }
    }
    return false
  }

  // Toggle del checkbox único "Acceso": escribe los DOS flags internos
  // (puede_gestionar Y puede_administrar) al mismo valor — ver nota en
  // CLAUDE.md sobre por qué se colapsó a una sola casilla. Cada flag
  // se compara contra su propio saved value por separado (pueden venir
  // desparejados de datos viejos) y solo entra al patch el que
  // realmente cambia; si los dos terminan iguales al saved, la fila
  // pendiente se elimina entera.
  function setPendiente(userId, depId, nextValue) {
    const usuario = (usuarios ?? []).find(u => u.id === userId)
    if (!usuario) return
    const savedGestion = savedFlag(usuario, depId, 'gestion')
    const savedAdmin   = savedFlag(usuario, depId, 'admin')

    setCambiosPendientes(prev => {
      const userMap = { ...(prev[userId] ?? {}) }
      const depMap  = {}
      if (nextValue !== savedGestion) depMap.puede_gestionar   = nextValue
      if (nextValue !== savedAdmin)   depMap.puede_administrar = nextValue
      if (Object.keys(depMap).length > 0) {
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

  // Valor "efectivo" de un flag interno: pending si existe, si no el
  // saved value de la DB.
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

  // Checkbox único "Acceso": efectivo/pendiente si CUALQUIERA de los
  // dos flags internos lo está — así una fila vieja con solo uno de
  // los dos en true (el estado "Administración sin Gestión" que esta
  // simplificación vino a eliminar) se sigue mostrando marcada.
  function effectiveAcceso(userId, depId) {
    return effectiveFlag(userId, depId, 'gestion') || effectiveFlag(userId, depId, 'admin')
  }
  function isAccesoPending(userId, depId) {
    return isCellPending(userId, depId, 'gestion') || isCellPending(userId, depId, 'admin')
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

  // ── Equivalentes para modulos_acceso (Parte D) — mismo mecanismo
  //    de arriba (setPendiente/effectiveFlag/isCellPending/
  //    combinedAccesoFor), clave por `modulo` en vez de dependencia_id.
  function setPendienteModulo(userId, modulo, nextValue) {
    const usuario = (usuarios ?? []).find(u => u.id === userId)
    if (!usuario) return
    const savedGestion = savedFlagModulo(usuario, modulo, 'gestion')
    const savedAdmin   = savedFlagModulo(usuario, modulo, 'admin')

    setCambiosPendientesModulos(prev => {
      const userMap = { ...(prev[userId] ?? {}) }
      const modMap  = {}
      if (nextValue !== savedGestion) modMap.puede_gestionar   = nextValue
      if (nextValue !== savedAdmin)   modMap.puede_administrar = nextValue
      if (Object.keys(modMap).length > 0) {
        userMap[modulo] = modMap
      } else {
        delete userMap[modulo]
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

  function effectiveFlagModulo(userId, modulo, kind) {
    const usuario = (usuarios ?? []).find(u => u.id === userId)
    if (!usuario) return false
    const flagKey = kind === 'gestion' ? 'puede_gestionar' : 'puede_administrar'
    const pending = cambiosPendientesModulos[userId]?.[modulo]
    if (pending && flagKey in pending) return !!pending[flagKey]
    return savedFlagModulo(usuario, modulo, kind)
  }

  function isCellPendingModulo(userId, modulo, kind) {
    const flagKey = kind === 'gestion' ? 'puede_gestionar' : 'puede_administrar'
    return flagKey in (cambiosPendientesModulos[userId]?.[modulo] ?? {})
  }

  function effectiveAccesoModulo(userId, modulo) {
    return effectiveFlagModulo(userId, modulo, 'gestion') || effectiveFlagModulo(userId, modulo, 'admin')
  }
  function isAccesoPendingModulo(userId, modulo) {
    return isCellPendingModulo(userId, modulo, 'gestion') || isCellPendingModulo(userId, modulo, 'admin')
  }

  function combinedModulosAccesoFor(userId) {
    const usuario = (usuarios ?? []).find(u => u.id === userId)
    if (!usuario) return []
    const saved = Array.isArray(usuario.modulos_acceso) ? usuario.modulos_acceso : []
    const pending = cambiosPendientesModulos[userId] ?? {}
    const byModulo = new Map()
    for (const row of saved) {
      if (!row?.modulo) continue
      byModulo.set(row.modulo, {
        modulo:            row.modulo,
        puede_gestionar:   !!row.puede_gestionar,
        puede_administrar: !!row.puede_administrar,
      })
    }
    for (const [modulo, patch] of Object.entries(pending)) {
      const current = byModulo.get(modulo) ?? {
        modulo, puede_gestionar: false, puede_administrar: false,
      }
      byModulo.set(modulo, {
        ...current,
        ...('puede_gestionar'   in patch ? { puede_gestionar:   !!patch.puede_gestionar   } : {}),
        ...('puede_administrar' in patch ? { puede_administrar: !!patch.puede_administrar } : {}),
      })
    }
    return Array.from(byModulo.values()).filter(r => r.puede_gestionar || r.puede_administrar)
  }

  async function handleGuardar() {
    onError?.('')
    setSaving(true)
    const fallos = []
    try {
      const userIds = new Set([
        ...Object.keys(cambiosPendientes),
        ...Object.keys(cambiosPendientesModulos),
      ])
      for (const userId of userIds) {
        const u = (usuarios ?? []).find(x => x.id === userId)
        try {
          if (cambiosPendientes[userId]) {
            await updateMut.mutateAsync({
              id: userId,
              dependencias_acceso: combinedAccesoFor(userId),
            })
          }
          if (cambiosPendientesModulos[userId]) {
            await updateModulosMut.mutateAsync({
              id: userId,
              modulos_acceso: combinedModulosAccesoFor(userId),
            })
          }
        } catch (e) {
          fallos.push(`${u?.nombre ?? userId}: ${e?.message ?? 'error'}`)
        }
      }
      if (fallos.length > 0) {
        onError?.('No pudimos guardar algunos cambios — ' + fallos.join(' · '))
      } else {
        setCambiosPendientes({})
        setCambiosPendientesModulos({})
        setOkMsg('✓ Permisos guardados correctamente')
      }
    } finally {
      setSaving(false)
    }
  }

  function handleCancelar() {
    if (totalCambios === 0) return
    setCambiosPendientes({})
    setCambiosPendientesModulos({})
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
                      <span
                        title={ROLES_INFO[rol] ?? rol}
                        className={`inline-flex cursor-help items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${
                          isDirector
                            ? 'bg-accent-50 text-accent-700 ring-accent-100'
                            : 'bg-primary-50 text-primary-700 ring-primary-100'
                        }`}
                      >
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
          modulosGestion={modulosGestion}
          esDirector={esDirector}
          editable={editable}
          totalCambios={totalCambios}
          saving={saving}
          onDeseleccionar={() => setSelectedId(null)}
          onGuardar={handleGuardar}
          onCancelar={handleCancelar}
          effectiveAcceso={effectiveAcceso}
          isAccesoPending={isAccesoPending}
          setPendiente={setPendiente}
          effectiveAccesoModulo={effectiveAccesoModulo}
          isAccesoPendingModulo={isAccesoPendingModulo}
          setPendienteModulo={setPendienteModulo}
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
  usuario, dependencias, modulosGestion, esDirector, editable,
  totalCambios, saving,
  onDeseleccionar, onGuardar, onCancelar,
  effectiveAcceso, isAccesoPending, setPendiente,
  effectiveAccesoModulo, isAccesoPendingModulo, setPendienteModulo,
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

      {dependencias.length === 0 && (modulosGestion ?? []).length === 0 ? (
        <div className="card p-8 text-center text-sm text-primary-400">
          Este municipio no tiene dependencias ni módulos de gestión activos.
          Cargá al menos uno para configurar permisos.
        </div>
      ) : (
        <>
          <p className="text-xs text-primary-500">
            Habilita a esta persona a ver y operar en esta dependencia.
          </p>
          {/* Scroll horizontal en mobile para que la tabla no se rompa. */}
          <div className="card overflow-x-auto p-0">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-primary-50/60">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-primary-500">
                    Dependencia
                  </th>
                  <th
                    className="px-4 py-2 text-center text-[10px] font-semibold uppercase tracking-widest text-primary-500"
                    style={{ width: 160 }}
                  >
                    Acceso
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
              {(['cic', 'deps', 'info']).flatMap(g => {
                const filas = filasPorGrupo[g]
                if (!filas?.length) return []
                const rows = [
                  <tr key={`sep-${g}`} className="bg-[#0F1C35]/5">
                    <td colSpan={2} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#C9A84C]">
                      {GRUPO_LABEL[g]}
                    </td>
                  </tr>,
                ]
                for (const dep of filas) {
                  const grupo = g
                  const isInfo = grupo === 'info'
                  const acceso        = effectiveAcceso(usuario.id, dep.id)
                  const pendingAcceso  = isAccesoPending(usuario.id, dep.id)
                  rows.push(
                    <tr key={dep.id} className="hover:bg-primary-50/40">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2.5">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                            acceso
                              ? 'bg-accent-50 text-accent-700'
                              : 'bg-primary-50 text-primary-500'
                          }`}>
                            <DepIcon tipo={dep.tipo} className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-medium text-primary">{dep.nombre}</span>
                        </div>
                      </td>
                      {isInfo ? (
                        <td className="px-4 py-2 text-center">
                          <span className="text-xs italic text-primary-400">Solo informativa</span>
                        </td>
                      ) : (
                        <PermisoCell
                          pending={pendingAcceso}
                          checked={acceso}
                          disabled={disabled}
                          ariaLabel={`Acceso a ${dep.nombre}`}
                          onChange={v => setPendiente(usuario.id, dep.id, v)}
                        />
                      )}
                    </tr>,
                  )
                }
                return rows
              })}
              {/* Módulos de gestión (Parte D) — Vales/Administración/
                  Reclamos, no son dependencias físicas. Mismo patrón
                  de fila + PermisoCell, clave por `modulo`. Solo se
                  muestran los módulos activos para el municipio
                  (filtrado ya hecho en Usuarios.jsx antes de pasarlos). */}
              {(modulosGestion ?? []).length > 0 && [
                <tr key="sep-modulos" className="bg-[#0F1C35]/5">
                  <td colSpan={2} className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#C9A84C]">
                    Módulos de gestión
                  </td>
                </tr>,
                ...modulosGestion.map(({ modulo, label }) => {
                  const acceso       = effectiveAccesoModulo(usuario.id, modulo)
                  const pendingAcceso = isAccesoPendingModulo(usuario.id, modulo)
                  return (
                    <tr key={modulo} className="hover:bg-primary-50/40">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2.5">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                            acceso
                              ? 'bg-accent-50 text-accent-700'
                              : 'bg-primary-50 text-primary-500'
                          }`}>
                            <ModuloGestionIcon modulo={modulo} className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-medium text-primary">{label}</span>
                        </div>
                      </td>
                      <PermisoCell
                        pending={pendingAcceso}
                        checked={acceso}
                        disabled={disabled}
                        ariaLabel={`Acceso a ${label}`}
                        onChange={v => setPendienteModulo(usuario.id, modulo, v)}
                      />
                    </tr>
                  )
                }),
              ]}
            </tbody>
          </table>
          </div>
        </>
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
