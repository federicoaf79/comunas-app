import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useAuditLog, useAccesosHoy, useAccesosMes,
} from '../../hooks/useAuditLog'
import { useAuth } from '../../context/AuthContext'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import StatCard from '../../components/ui/StatCard'
import Button from '../../components/ui/Button'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'

// =============================================================
// /admin/auditoria — log centralizado de operaciones del sistema.
//
// Dos secciones, navegadas vía ?tab= (igual que el resto del
// admin):
//   sin ?tab / 'log'      → Log de operaciones (default)
//   'accesos'              → Accesos al sistema (logins + KPIs)
//
// La página solo está disponible para admin_comuna y superadmin
// (el guard ya filtra a nivel ruta — acá renderizamos un mensaje
// suave si el perfil no califica).
// =============================================================

const SECCION_LABEL = {
  log:     'Log de operaciones',
  accesos: 'Accesos al sistema',
}

const ACCION_OPTS = [
  { value: '',         label: 'Todas las acciones' },
  { value: 'login',    label: 'Acceso' },
  { value: 'logout',   label: 'Cierre de sesión' },
  { value: 'create',   label: 'Alta' },
  { value: 'update',   label: 'Modificación' },
  { value: 'approve',  label: 'Aprobación' },
  { value: 'reject',   label: 'Rechazo' },
  { value: 'delete',   label: 'Eliminación' },
  { value: 'export',   label: 'Exportación' },
  { value: 'access',   label: 'Acceso a recurso' },
]

const ACCION_BADGE = {
  login:   { label: 'Acceso',         cls: 'bg-ok-50 text-ok-700 ring-ok-100' },
  logout:  { label: 'Salida',         cls: 'bg-gray-100 text-gray-700 ring-gray-200' },
  create:  { label: 'Alta',           cls: 'bg-primary-100 text-primary-700 ring-primary-200' },
  update:  { label: 'Modificación',   cls: 'bg-accent-50 text-accent-700 ring-accent-100' },
  approve: { label: 'Aprobación',     cls: 'bg-ok-50 text-ok-700 ring-ok-100' },
  reject:  { label: 'Rechazo',        cls: 'bg-red-50 text-danger ring-red-100' },
  delete:  { label: 'Eliminación',    cls: 'bg-red-50 text-danger ring-red-100' },
  export:  { label: 'Exportación',    cls: 'bg-gray-100 text-gray-700 ring-gray-200' },
  access:  { label: 'Acceso',         cls: 'bg-primary-50 text-primary-700 ring-primary-100' },
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function actorLabel(row) {
  const a = row?.usuario
  if (a?.nombre) return a.nombre
  return row?.actor_email || a?.email || row?.usuario_id?.slice(0, 8) || 'Sistema'
}

// CSV escape: encierra entre comillas y duplica las comillas
// internas. Maneja null como string vacío.
function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function descargarCsv(filename, filas, columnas) {
  const header = columnas.map(c => csvEscape(c.label)).join(',')
  const body = filas.map(r => columnas.map(c => csvEscape(c.get(r))).join(',')).join('\n')
  const blob = new Blob(['﻿', header, '\n', body], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function AccionBadge({ accion }) {
  const def = ACCION_BADGE[accion] ?? { label: accion ?? '—', cls: 'bg-gray-100 text-gray-700 ring-gray-200' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${def.cls}`}>
      {def.label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 1 · Log de operaciones
// ─────────────────────────────────────────────────────────────────

function LogTab() {
  const [accion, setAccion]       = useState('')
  const [entidad, setEntidad]     = useState('')
  const [actorEmail, setActorEmail] = useState('')
  const [fechaDesde, setFechaDesde] = useState('')
  const [fechaHasta, setFechaHasta] = useState('')

  const filtros = useMemo(() => ({
    accion: accion || undefined,
    entidad: entidad.trim() || undefined,
    fechaDesde: fechaDesde || undefined,
    fechaHasta: fechaHasta || undefined,
  }), [accion, entidad, fechaDesde, fechaHasta])

  const { data: rows = [], isLoading, error } = useAuditLog(filtros)

  // Filtro client-side por actor_email (no lo tenemos como índice
  // y la mayoría de los logs son chicos — más simple que pegar al
  // server con un texto libre).
  const filasFiltradas = useMemo(() => {
    const t = actorEmail.trim().toLowerCase()
    if (!t) return rows
    return rows.filter(r =>
      (r.actor_email ?? '').toLowerCase().includes(t)
      || (r.usuario?.email ?? '').toLowerCase().includes(t)
      || (r.usuario?.nombre ?? '').toLowerCase().includes(t),
    )
  }, [rows, actorEmail])

  function exportar() {
    descargarCsv(
      `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
      filasFiltradas,
      [
        { label: 'Fecha',       get: r => fmtDateTime(r.created_at) },
        { label: 'Usuario',     get: r => actorLabel(r) },
        { label: 'Email',       get: r => r.actor_email ?? r.usuario?.email ?? '' },
        { label: 'Acción',      get: r => r.accion },
        { label: 'Entidad',     get: r => r.entidad ?? '' },
        { label: 'Entidad ID',  get: r => r.entidad_id ?? '' },
        { label: 'Descripción', get: r => r.descripcion ?? '' },
      ],
    )
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          label="Usuario / Email"
          value={actorEmail}
          onChange={e => setActorEmail(e.target.value)}
          placeholder="Filtrar por persona…"
        />
        <Select
          label="Acción"
          value={accion}
          onChange={v => setAccion(v || '')}
          options={ACCION_OPTS}
        />
        <Input
          label="Entidad"
          value={entidad}
          onChange={e => setEntidad(e.target.value)}
          placeholder="turnos, gastos, …"
        />
        <Input
          label="Desde"
          type="date"
          value={fechaDesde}
          onChange={e => setFechaDesde(e.target.value)}
        />
        <Input
          label="Hasta"
          type="date"
          value={fechaHasta}
          onChange={e => setFechaHasta(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-primary-500">
        <span>
          {filasFiltradas.length} operación{filasFiltradas.length === 1 ? '' : 'es'}
          {rows.length !== filasFiltradas.length && (
            <span className="text-primary-300"> · {rows.length} totales (sin filtros de texto)</span>
          )}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={exportar}
          disabled={filasFiltradas.length === 0}
        >
          Exportar a CSV
        </Button>
      </div>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar el log: {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : filasFiltradas.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          {rows.length === 0
            ? 'Todavía no hay operaciones registradas. La tabla audit_log se llena a medida que el sistema usa createAuditLog().'
            : 'Ningún registro coincide con los filtros.'}
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <Table>
            <THead>
              <Tr>
                <Th>Fecha / hora</Th>
                <Th>Usuario</Th>
                <Th>Acción</Th>
                <Th>Entidad</Th>
                <Th>Descripción</Th>
              </Tr>
            </THead>
            <tbody>
              {filasFiltradas.map(r => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap font-mono text-xs text-primary-700">
                    {fmtDateTime(r.created_at)}
                  </Td>
                  <Td>
                    <p className="font-medium text-primary">{actorLabel(r)}</p>
                    {(r.actor_email || r.usuario?.email) && (
                      <p className="text-[11px] text-primary-400">
                        {r.actor_email || r.usuario?.email}
                      </p>
                    )}
                  </Td>
                  <Td><AccionBadge accion={r.accion} /></Td>
                  <Td className="text-sm text-primary-700">
                    {r.entidad ? (
                      <span>
                        {r.entidad}
                        {r.entidad_id && (
                          <span className="ml-1 font-mono text-[10px] text-primary-400">
                            #{String(r.entidad_id).slice(0, 8)}
                          </span>
                        )}
                      </span>
                    ) : <span className="text-primary-300">—</span>}
                  </Td>
                  <Td className="max-w-md">
                    <span className="line-clamp-2 text-xs text-primary-600">
                      {r.descripcion || <span className="text-primary-300">—</span>}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 2 · Accesos al sistema
// ─────────────────────────────────────────────────────────────────

function deviceLabel(ua) {
  const s = (ua ?? '').toLowerCase()
  if (!s) return 'Desconocido'
  if (s.includes('android'))  return 'Android'
  if (s.includes('iphone') || s.includes('ipad') || s.includes('ios')) return 'iOS'
  if (s.includes('windows'))  return 'Windows'
  if (s.includes('mac os'))   return 'macOS'
  if (s.includes('linux'))    return 'Linux'
  return 'Otro'
}

function AccesosTab() {
  const { data: rows = [], isLoading, error } = useAuditLog({ accion: 'login', limit: 100 })
  const hoyQ = useAccesosHoy()
  const mesQ = useAccesosMes()

  const ultimoAcceso = rows[0]?.created_at ?? null

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Usuarios activos hoy"
          value={hoyQ.isLoading ? '…' : (hoyQ.data?.usuariosActivos ?? 0)}
          hint={hoyQ.data?.totalAccesos != null ? `${hoyQ.data.totalAccesos} acceso${hoyQ.data.totalAccesos === 1 ? '' : 's'} en el día` : ''}
          accent="ok"
        />
        <StatCard
          label="Accesos del mes"
          value={mesQ.isLoading ? '…' : (mesQ.data ?? 0)}
          hint="Total de logins en el período"
          accent="primary"
        />
        <StatCard
          label="Último acceso"
          value={ultimoAcceso ? fmtDateTime(ultimoAcceso) : '—'}
          hint={ultimoAcceso ? actorLabel(rows[0]) : 'Sin actividad reciente'}
          accent="accent"
        />
      </div>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los accesos: {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay accesos registrados todavía.
        </div>
      ) : (
        <div className="card overflow-hidden p-0">
          <Table>
            <THead>
              <Tr>
                <Th>Fecha / hora</Th>
                <Th>Usuario</Th>
                <Th>Email</Th>
                <Th>Dispositivo</Th>
              </Tr>
            </THead>
            <tbody>
              {rows.map(r => (
                <Tr key={r.id}>
                  <Td className="whitespace-nowrap font-mono text-xs text-primary-700">
                    {fmtDateTime(r.created_at)}
                  </Td>
                  <Td className="font-medium text-primary">{actorLabel(r)}</Td>
                  <Td className="text-xs text-primary-500">
                    {r.actor_email || r.usuario?.email || '—'}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-primary-700 ring-1 ring-inset ring-primary-100">
                      {deviceLabel(r.user_agent)}
                    </span>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function Auditoria() {
  const { hasRole } = useAuth()
  const autorizado = hasRole(['admin_comuna', 'superadmin'])

  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') || ''
  const seccion = ['log', 'accesos'].includes(tabParam) ? tabParam : 'log'

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Auditoría</h1>
        <p className="mt-1 text-sm text-primary-500">
          <span className="text-primary-400">Gestión municipal</span>
          <span className="mx-1.5 text-primary-300">›</span>
          <span className="font-medium text-primary-700">{SECCION_LABEL[seccion]}</span>
        </p>
      </header>

      {!autorizado ? (
        <div className="card p-10 text-center">
          <p className="font-sora text-lg font-semibold text-primary">Acceso restringido</p>
          <p className="mt-2 text-sm text-primary-500">
            Solo los administradores de la comuna y el superadmin pueden ver la auditoría.
          </p>
        </div>
      ) : seccion === 'log' ? (
        <LogTab />
      ) : (
        <AccesosTab />
      )}
    </div>
  )
}
