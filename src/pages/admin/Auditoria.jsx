import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import Spinner from '../../components/ui/Spinner'
import StatCard from '../../components/ui/StatCard'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'

// =============================================================
// /admin/auditoria — auditoría del sistema en 3 tabs:
//   Accesos  → eventos LOGIN
//   Cambios  → todo lo demás (alta/edición/aprobación/etc.)
//   Resumen  → métricas de los últimos 30 días (procesado en JS)
//
// El LOGIN se registra desde AuthContext.signIn (ver PASO 1).
// Restringido a admin_comuna / superadmin (guard a nivel ruta +
// mensaje suave acá). Para superadmin (municipio_id null) NO se
// filtra por municipio → ve la auditoría de todo el sistema.
// =============================================================

const ACCION_BADGE = {
  LOGIN:   { label: 'Acceso',       cls: 'bg-ok-50 text-ok-700 ring-ok-100' },
  login:   { label: 'Acceso',       cls: 'bg-ok-50 text-ok-700 ring-ok-100' },
  logout:  { label: 'Salida',       cls: 'bg-gray-100 text-gray-700 ring-gray-200' },
  create:  { label: 'Alta',         cls: 'bg-primary-100 text-primary-700 ring-primary-200' },
  update:  { label: 'Modificación', cls: 'bg-accent-50 text-accent-700 ring-accent-100' },
  approve: { label: 'Aprobación',   cls: 'bg-ok-50 text-ok-700 ring-ok-100' },
  reject:  { label: 'Rechazo',      cls: 'bg-red-50 text-danger ring-red-100' },
  delete:  { label: 'Eliminación',  cls: 'bg-red-50 text-danger ring-red-100' },
  export:  { label: 'Exportación',  cls: 'bg-gray-100 text-gray-700 ring-gray-200' },
  access:  { label: 'Acceso',       cls: 'bg-primary-50 text-primary-700 ring-primary-100' },
}

const TABS = [
  { value: 'accesos', label: 'Accesos' },
  { value: 'cambios', label: 'Cambios' },
  { value: 'resumen', label: 'Resumen' },
]

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return '—'
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function actorLabel(row) {
  const u = row?.usuarios
  if (u?.nombre) return u.nombre
  return u?.email || row?.usuario_id?.slice(0, 8) || 'Sistema'
}

// Exportación genérica a CSV con BOM UTF-8 para Excel
function exportarCSV(datos, nombreArchivo, columnas) {
  const headers = columnas.map(c => c.label).join(',')
  const filas = datos.map(row =>
    columnas.map(c => {
      const val = c.key.split('.').reduce((o, k) => o?.[k], row) ?? ''
      return `"${String(val).replace(/"/g, '""')}"`
    }).join(',')
  )
  const csv = [headers, ...filas].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombreArchivo}-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function AccionBadge({ accion }) {
  const def = ACCION_BADGE[accion] ?? { label: accion ?? '—', cls: 'bg-gray-100 text-gray-700 ring-gray-200' }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ${def.cls}`}>
      {def.label}
    </span>
  )
}

// Badge navy por rol (text[] de usuarios.roles).
function RolesBadges({ roles }) {
  const list = Array.isArray(roles) ? roles : []
  if (list.length === 0) return <span className="text-xs text-primary-300">—</span>
  return (
    <div className="flex flex-wrap gap-1">
      {list.map(r => (
        <span
          key={r}
          className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-700 ring-1 ring-inset ring-primary-200"
        >
          {r}
        </span>
      ))}
    </div>
  )
}

// Aplica el scope por municipio. Superadmin (municipioId null) ve
// todo: no se agrega el filtro.
function scoped(q, municipioId) {
  return municipioId ? q.eq('municipio_id', municipioId) : q
}

// ─────────────────────────────────────────────────────────────────
// TAB 1 · Accesos (LOGIN)
// ─────────────────────────────────────────────────────────────────

function AccesosTab({ municipioId }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['audit-accesos', municipioId ?? '__ALL__'],
    queryFn:  async () => {
      let q = supabase
        .from('audit_log')
        .select('id, descripcion, created_at, usuarios:usuario_id ( nombre, email, roles )')
        .eq('accion', 'LOGIN')
        .order('created_at', { ascending: false })
        .limit(100)
      q = scoped(q, municipioId)
      const { data, error } = await q
      if (error) { console.warn('[Auditoria] accesos:', error.message); return [] }
      return data ?? []
    },
  })

  if (isLoading) {
    return <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
  }
  if (rows.length === 0) {
    return <div className="card p-10 text-center text-sm text-primary-400">Sin accesos registrados.</div>
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => exportarCSV(rows, 'auditoria-accesos', [
            { label: 'Fecha', key: 'created_at' },
            { label: 'Usuario', key: 'usuarios.nombre' },
            { label: 'Email', key: 'usuarios.email' },
            { label: 'Acción', key: 'accion' },
            { label: 'Descripción', key: 'descripcion' },
          ])}
          className="inline-flex items-center gap-2 rounded-lg border-2 border-primary bg-white px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={rows.length === 0}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Exportar CSV
        </button>
      </div>
      <Table>
      <THead>
        <Tr>
          <Th>Fecha / hora</Th>
          <Th>Usuario</Th>
          <Th>Email</Th>
          <Th>Roles</Th>
        </Tr>
      </THead>
      <tbody>
        {rows.map(r => (
          <Tr key={r.id}>
            <Td className="whitespace-nowrap font-mono text-xs text-primary-700">{fmtDateTime(r.created_at)}</Td>
            <Td className="font-medium text-primary">{actorLabel(r)}</Td>
            <Td className="text-xs text-primary-500">{r.usuarios?.email || '—'}</Td>
            <Td><RolesBadges roles={r.usuarios?.roles} /></Td>
          </Tr>
        ))}
      </tbody>
    </Table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 2 · Cambios (todo menos LOGIN)
// ─────────────────────────────────────────────────────────────────

function CambiosTab({ municipioId }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['audit-cambios', municipioId ?? '__ALL__'],
    queryFn:  async () => {
      let q = supabase
        .from('audit_log')
        .select('id, accion, entidad, descripcion, created_at, usuarios:usuario_id ( nombre, email )')
        .neq('accion', 'LOGIN')
        .order('created_at', { ascending: false })
        .limit(100)
      q = scoped(q, municipioId)
      const { data, error } = await q
      if (error) { console.warn('[Auditoria] cambios:', error.message); return [] }
      return data ?? []
    },
  })

  if (isLoading) {
    return <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
  }
  if (rows.length === 0) {
    return <div className="card p-10 text-center text-sm text-primary-400">Sin cambios registrados.</div>
  }
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => exportarCSV(rows, 'auditoria-cambios', [
            { label: 'Fecha', key: 'created_at' },
            { label: 'Usuario', key: 'usuarios.nombre' },
            { label: 'Email', key: 'usuarios.email' },
            { label: 'Acción', key: 'accion' },
            { label: 'Entidad', key: 'entidad' },
            { label: 'Descripción', key: 'descripcion' },
          ])}
          className="inline-flex items-center gap-2 rounded-lg border-2 border-primary bg-white px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={rows.length === 0}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Exportar CSV
        </button>
      </div>
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
        {rows.map(r => (
          <Tr key={r.id}>
            <Td className="whitespace-nowrap font-mono text-xs text-primary-700">{fmtDateTime(r.created_at)}</Td>
            <Td className="font-medium text-primary">{actorLabel(r)}</Td>
            <Td><AccionBadge accion={r.accion} /></Td>
            <Td className="text-sm text-primary-700">{r.entidad ?? '—'}</Td>
            <Td className="text-sm text-primary-500">{r.descripcion ?? '—'}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 3 · Resumen (últimos 30 días, procesado en cliente)
// ─────────────────────────────────────────────────────────────────

function topN(map, n) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
}

function ResumenTab({ municipioId }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['audit-resumen', municipioId ?? '__ALL__'],
    queryFn:  async () => {
      const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      let q = supabase
        .from('audit_log')
        .select('accion, created_at, usuarios:usuario_id ( nombre, email )')
        .gte('created_at', desde)
        .order('created_at', { ascending: false })
        .limit(1000)
      q = scoped(q, municipioId)
      const { data, error } = await q
      if (error) { console.warn('[Auditoria] resumen:', error.message); return [] }
      return data ?? []
    },
  })

  const stats = useMemo(() => {
    let accesos = 0
    let cambios = 0
    const porUsuario = new Map()
    const porAccion  = new Map()
    for (const r of rows) {
      const esLogin = r.accion === 'LOGIN'
      if (esLogin) accesos++
      else cambios++
      const userKey = r.usuarios?.nombre || r.usuarios?.email || 'Desconocido'
      porUsuario.set(userKey, (porUsuario.get(userKey) ?? 0) + 1)
      const accKey = r.accion ?? '—'
      porAccion.set(accKey, (porAccion.get(accKey) ?? 0) + 1)
    }
    return {
      accesos,
      cambios,
      topUsuarios: topN(porUsuario, 5),
      topAcciones: topN(porAccion, 5),
    }
  }, [rows])

  if (isLoading) {
    return <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
  }

  return (
    <div className="space-y-5">
      <p className="text-xs text-primary-400">Métricas de los últimos 30 días.</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Accesos (LOGIN)" value={stats.accesos} accent="ok" />
        <StatCard label="Cambios registrados" value={stats.cambios} accent="primary" />
        <StatCard label="Usuarios activos" value={stats.topUsuarios.length} accent="accent" />
        <StatCard label="Total eventos" value={stats.accesos + stats.cambios} accent="primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h3 className="font-sora text-sm font-bold text-primary">Top 5 usuarios más activos</h3>
          {stats.topUsuarios.length === 0 ? (
            <p className="mt-3 text-sm text-primary-400">Sin actividad en el período.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {stats.topUsuarios.map(([nombre, n]) => (
                <li key={nombre} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium text-primary-700">{nombre}</span>
                  <span className="font-mono text-xs font-bold text-primary">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-sora text-sm font-bold text-primary">Top 5 acciones más frecuentes</h3>
          {stats.topAcciones.length === 0 ? (
            <p className="mt-3 text-sm text-primary-400">Sin actividad en el período.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {stats.topAcciones.map(([accion, n]) => (
                <li key={accion} className="flex items-center justify-between py-2 text-sm">
                  <AccionBadge accion={accion} />
                  <span className="font-mono text-xs font-bold text-primary">{n}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

export default function Auditoria() {
  const { hasRole } = useAuth()
  const autorizado = hasRole(['admin_comuna', 'superadmin'])
  const municipioId = useEffectiveMunicipioId()
  const [tab, setTab] = useState('accesos')

  if (!autorizado) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="font-sora text-2xl font-bold text-primary">Auditoría</h1>
        </header>
        <div className="card p-10 text-center">
          <p className="font-sora text-lg font-semibold text-primary">Acceso restringido</p>
          <p className="mt-2 text-sm text-primary-500">
            Solo los administradores de la comuna y el superadmin pueden ver la auditoría.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Auditoría</h1>
        <p className="mt-1 text-sm text-primary-500">
          Accesos al sistema y registro de cambios.
        </p>
      </header>

      {/* Tabs — mismo patrón que ObrasPublicas (border-b-2) */}
      <nav role="tablist" className="flex overflow-x-auto border-b border-border">
        {TABS.map(t => {
          const active = tab === t.value
          return (
            <button
              key={t.value}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.value)}
              className={
                'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors ' +
                (active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-primary-400 hover:border-primary-200 hover:text-primary-700')
              }
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      <div key={tab} className="animate-fade-in">
        {tab === 'accesos' && <AccesosTab municipioId={municipioId} />}
        {tab === 'cambios' && <CambiosTab municipioId={municipioId} />}
        {tab === 'resumen' && <ResumenTab municipioId={municipioId} />}
      </div>
    </div>
  )
}
