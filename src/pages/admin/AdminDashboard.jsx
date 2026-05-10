import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useTurnos } from '../../hooks/useTurnos'
import {
  useGastos, useIngresos, usePresupuesto,
  currentMonthYYYYMM, currentYear, monthRange,
} from '../../hooks/useAdministracion'
import { todayArgYMD, dateOf, timeOf } from '../../lib/datetime'
import Spinner from '../../components/ui/Spinner'

// =============================================================
// Dashboard real — sin mockData. Junta datos de turnos, vecinos,
// mensajes, denuncias, noticias, gastos e ingresos vía hooks
// existentes + queries inline para los conteos head:true.
//
// Esta versión rediseñada agrega:
//   - Resumen del día (banner navy con saludo + alerta de turnos)
//   - KPIs con ícono, tendencia vs mes anterior y barra de progreso
//   - Gráfico SVG de turnos por dependencia del mes
//   - Gráfico financiero mejorado (vertical bars con eje Y)
//   - Timeline vertical de actividad reciente
// =============================================================

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})
const fmtCompacto = new Intl.NumberFormat('es-AR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})
const fmtFechaLarga = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})

// "YYYY-MM" del mes anterior al pasado.
function prevMonthYYYYMM(yyyymm) {
  const [y, m] = yyyymm.split('-').map(Number)
  const py = m === 1 ? y - 1 : y
  const pm = m === 1 ? 12 : m - 1
  return `${py}-${String(pm).padStart(2, '0')}`
}

function saludoSegunHora(date = new Date()) {
  const h = date.getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function primerNombre(nombre) {
  if (!nombre) return ''
  return nombre.trim().split(/\s+/)[0]
}

function vecinoNombre(v) {
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

// ─────────────────────────────────────────────────────────────────
// Conteos rápidos vía head:true (no traen filas, solo el count)
// ─────────────────────────────────────────────────────────────────

async function fetchVecinosCount(municipioId, sinceDate = null) {
  let q = supabase.from('vecinos').select('id', { count: 'exact', head: true })
  if (municipioId) q = q.eq('municipio_id', municipioId)
  if (sinceDate)   q = q.gte('created_at', `${sinceDate}T00:00:00`)
  const { count, error } = await q
  if (error) {
    console.warn('[Dashboard] fetchVecinosCount:', error.message)
    return 0
  }
  return count ?? 0
}

async function fetchMensajesCount(municipioId, mes) {
  const { first, next } = monthRange(mes)
  let q = supabase
    .from('sms_log')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${first}T00:00:00`)
    .lt('created_at',  `${next}T00:00:00`)
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { count, error } = await q
  if (error) {
    console.warn('[Dashboard] fetchMensajesCount:', error.message)
    return 0
  }
  return count ?? 0
}

async function fetchDenunciasAbiertasCount(municipioId) {
  let q = supabase
    .from('denuncias')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'abierta')
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { count, error } = await q
  if (error) {
    console.warn('[Dashboard] fetchDenunciasAbiertasCount:', error.message)
    return 0
  }
  return count ?? 0
}

async function fetchUltimasNoticias(municipioId) {
  let q = supabase
    .from('noticias')
    .select('id, titulo, categoria, publicado_at')
    .eq('estado', 'publicada')
    .order('publicado_at', { ascending: false })
    .limit(5)
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { data, error } = await q
  if (error) {
    console.warn('[Dashboard] fetchUltimasNoticias:', error.message)
    return []
  }
  return data ?? []
}

async function fetchUltimasDenuncias(municipioId) {
  let q = supabase
    .from('denuncias')
    .select('id, asunto, tipo, estado, created_at')
    .order('created_at', { ascending: false })
    .limit(3)
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { data, error } = await q
  if (error) {
    console.warn('[Dashboard] fetchUltimasDenuncias:', error.message)
    return []
  }
  return data ?? []
}

// Médico de guardia rotativo — busca la fila de medicos_agenda
// activa cuyo rango semana_inicio..semana_fin contiene a hoy.
async function fetchMedicoGuardia(municipioId, today) {
  let q = supabase
    .from('medicos_agenda')
    .select('id, semana_inicio, semana_fin, especialidad, usuario:usuario_id ( id, nombre, especialidad )')
    .lte('semana_inicio', today)
    .gte('semana_fin', today)
    .eq('activo', true)
    .order('semana_inicio', { ascending: false })
    .limit(1)
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { data, error } = await q.maybeSingle()
  if (error) {
    // Las columnas (semana_inicio/fin/activo) pueden no existir
    // todavía en algunos schemas — degradamos a "sin guardia".
    if (!/permission|not allowed|policy/i.test(error.message ?? '')) {
      console.warn('[Dashboard] fetchMedicoGuardia:', error.message)
    }
    return null
  }
  return data
}

// Últimos mensajes salientes/entrantes desde la tabla sms_log.
async function fetchUltimosMensajes(municipioId) {
  let q = supabase
    .from('sms_log')
    .select('id, canal, mensaje, direccion, telefono, created_at')
    .order('created_at', { ascending: false })
    .limit(5)
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { data, error } = await q
  if (error) {
    console.warn('[Dashboard] fetchUltimosMensajes:', error.message)
    return []
  }
  return data ?? []
}

// Color del badge de dependencia por `tipo` — mismo criterio que
// TablazoCross (cero verde, todo cae a navy/azul/gold/gris/slate).
function depBadgeClass(tipo) {
  const t = (tipo ?? '').toLowerCase()
  if (/caps|salud|sala/.test(t))                   return 'bg-ok-50 text-ok-700 ring-ok-100'
  if (/juzgado|paz|justicia/.test(t))              return 'bg-primary-100 text-primary-700 ring-primary-200'
  if (/sum|sal[oó]n|cultural/.test(t))             return 'bg-accent-50 text-accent-700 ring-accent-100'
  if (/intendencia|admin|gobierno|comuna/.test(t)) return 'bg-gray-100 text-gray-700 ring-gray-300'
  if (/obra|construc|infra|catastro/.test(t))      return 'bg-slate-100 text-slate-700 ring-slate-200'
  if (/deport|recreaci|polideport/.test(t))        return 'bg-accent-100 text-accent-800 ring-accent-200'
  if (/educ|escuel|biblioteca/.test(t))            return 'bg-accent-50 text-accent-700 ring-accent-100'
  if (/social|familia|asisten/.test(t))            return 'bg-primary-50 text-primary-700 ring-primary-200'
  if (/polic|seguridad/.test(t))                   return 'bg-primary-100 text-primary-700 ring-primary-200'
  return 'bg-primary-50 text-primary-700 ring-primary-200'
}

// ─────────────────────────────────────────────────────────────────
// Resumen del día — franja navy con saludo y alerta
// ─────────────────────────────────────────────────────────────────

function ResumenDelDia({ perfil, turnosHoy }) {
  const pendientes = (turnosHoy ?? []).filter(t =>
    t.estado === 'pendiente' || t.estado === 'confirmado' || t.estado === 'en_curso',
  ).length
  const fechaLarga = fmtFechaLarga.format(new Date())
  const nombre = primerNombre(perfil?.nombre)

  return (
    <section className="overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-700 to-primary-900 px-5 py-4 text-white shadow-card sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Saludo + fecha en una sola línea con separador · — formato
            es-AR de Intl ya devuelve "sábado, 9 de mayo de 2026" en
            minúsculas, no usamos `capitalize`. */}
        <p className="min-w-0 flex-1 truncate font-sora text-base font-bold sm:text-lg">
          {saludoSegunHora()}{nombre ? `, ${nombre}` : ''}.
          <span className="ml-1 font-normal text-white/70">
            · Hoy es {fechaLarga}.
          </span>
        </p>
        {pendientes > 0 && (
          <div className="inline-flex items-center gap-2 rounded-lg bg-accent/15 px-3 py-1.5 text-sm ring-1 ring-inset ring-accent/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-accent" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 2" />
            </svg>
            <p className="font-medium text-white">
              <span className="font-bold text-accent">{pendientes}</span>{' '}
              turno{pendientes === 1 ? '' : 's'} pendiente{pendientes === 1 ? '' : 's'}
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// KPI mejorada — ícono + valor + tendencia + barra mini
// ─────────────────────────────────────────────────────────────────

function TrendBadge({ delta }) {
  if (delta == null || !Number.isFinite(delta)) return null
  if (delta === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-400">
        — sin cambios
      </span>
    )
  }
  const positive = delta > 0
  return (
    <span className={
      'inline-flex items-center gap-0.5 text-[11px] font-semibold ' +
      (positive ? 'text-ok-700' : 'text-danger')
    }>
      <span aria-hidden="true">{positive ? '↑' : '↓'}</span>
      {positive ? '+' : ''}{delta} vs mes anterior
    </span>
  )
}

function KpiCard({
  label, value, icon, accent = 'primary',
  hint, delta, isLoading,
}) {
  // Colores según el accent — el ícono lleva fondo navy con
  // glyph en gold para los KPIs neutros, y rojo / rojo para
  // alertas (denuncias).
  const iconWrap = accent === 'danger'
    ? 'bg-red-50 text-danger'
    : 'bg-primary text-accent'

  const valueColor = accent === 'danger' ? 'text-danger'
                  : accent === 'ok'     ? 'text-ok-700'
                  : 'text-primary'

  if (isLoading) {
    return (
      <div className="card flex items-center gap-3 p-4">
        <Spinner size="sm" />
        <p className="text-sm font-medium text-primary-500">{label}</p>
      </div>
    )
  }

  const hasMeta = !!hint || (delta != null && Number.isFinite(delta))

  return (
    <div className="card flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconWrap}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-4xl font-bold leading-none ${valueColor}`}>
          {value}
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-primary-500">
          {label}
        </p>
        {hasMeta && (
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-primary-400">
            {hint && <span className="truncate">{hint}</span>}
            <TrendBadge delta={delta} />
          </div>
        )}
      </div>
    </div>
  )
}

const ICONS = {
  calendar: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  ),
  people: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 20a6.5 6.5 0 0 1 13 0M17 11a3 3 0 1 0 0-6M21.5 20a4.5 4.5 0 0 0-4-4.45" />
    </svg>
  ),
  chat: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9z" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" />
    </svg>
  ),
}

// ─────────────────────────────────────────────────────────────────
// Turnos del día (lista compacta)
// ─────────────────────────────────────────────────────────────────

const ESTADO_LABEL = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  en_curso:   'En curso',
  completado: 'Completado',
  cancelado:  'Cancelado',
  reservado:  'Pendiente',
  atendido:   'Atendido',
}
const ESTADO_CLASS = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
  reservado:  'estado-pendiente',
  atendido:   'estado-atendido',
}

function TurnosHoyCard({ turnos, isLoading }) {
  const proximos = (turnos ?? [])
    .filter(t => t.estado === 'pendiente' || t.estado === 'confirmado' || t.estado === 'en_curso')
    .sort((a, b) => (a.fecha_hora ?? '').localeCompare(b.fecha_hora ?? ''))
    .slice(0, 6)

  return (
    <div className="card overflow-hidden p-0">
      <header className="flex items-center justify-between border-b border-border bg-primary-50 px-5 py-3">
        <h3 className="text-sm font-semibold text-primary">Turnos de hoy</h3>
        <Link to="/admin/tablero" className="text-xs font-medium text-primary hover:underline">
          Ver todos →
        </Link>
      </header>
      {isLoading ? (
        <div className="flex items-center justify-center p-6"><Spinner /></div>
      ) : proximos.length === 0 ? (
        <p className="px-5 py-4 text-center text-sm text-primary-400">
          No hay turnos pendientes para hoy.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-primary-50/40 text-xs uppercase tracking-wide text-primary-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Hora</th>
                <th className="px-4 py-2 font-semibold">Dependencia</th>
                <th className="px-4 py-2 font-semibold">Vecino</th>
                <th className="px-4 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {proximos.map(t => {
                const isFamiliar = !!t.metadata?.para_familiar
                const nombre = isFamiliar
                  ? (t.metadata.familiar_nombre || vecinoNombre(t.vecino))
                  : vecinoNombre(t.vecino)
                const depNombre = t.dependencia?.nombre ?? t.dependencia_nombre ?? '—'
                return (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-bold text-primary">
                      {timeOf(t.fecha_hora) || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ' +
                          depBadgeClass(t.dependencia?.tipo)
                        }
                      >
                        {depNombre}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-primary-700">{nombre}</span>
                      {isFamiliar && <span className="ml-1 text-[11px]" aria-hidden="true">👨‍👩‍👧</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={ESTADO_CLASS[t.estado] ?? 'estado-pendiente'}>
                        {ESTADO_LABEL[t.estado] ?? t.estado}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Médico de guardia — card navy con foto del rotativo de la semana
// ─────────────────────────────────────────────────────────────────

function MedicoGuardiaCard({ data, isLoading }) {
  const usuario = data?.usuario ?? null
  const nombre = usuario?.nombre || data?.medico_nombre || ''
  const especialidad = usuario?.especialidad || data?.especialidad || ''

  return (
    <div className="card overflow-hidden bg-gradient-to-br from-primary via-primary-700 to-primary-900 p-0 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <h3 className="text-sm font-semibold text-white">Médico de guardia</h3>
        <Link to="/admin/sala" className="text-xs font-medium text-accent hover:underline">
          Ver agenda →
        </Link>
      </header>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center p-2">
            <Spinner />
          </div>
        ) : !data ? (
          <p className="text-sm text-white/70">
            Sin guardia asignada esta semana.
          </p>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-accent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v8a4 4 0 0 0 8 0V3M5 3H3M13 3h-2M9 15v3a4 4 0 0 0 8 0v-2" />
                <circle cx="17" cy="13" r="2" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              {/* Línea 1: nombre + especialidad inline */}
              <p className="font-sora text-base font-bold leading-tight sm:text-lg">
                {nombre || 'Sin nombre'}
                {especialidad && (
                  <span className="ml-2 text-sm font-normal text-white/70">
                    · {especialidad}
                  </span>
                )}
              </p>
              {/* Línea 2: rango semanal */}
              {(data.semana_inicio || data.semana_fin) && (
                <p className="mt-1 text-xs text-white/60">
                  Semana: {data.semana_inicio ? dateOf(data.semana_inicio) : '—'} al {data.semana_fin ? dateOf(data.semana_fin) : '—'}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Últimos mensajes — sms_log con badge SMS/WA por canal
// ─────────────────────────────────────────────────────────────────

const CANAL_BADGE = {
  sms:      'bg-primary-100 text-primary-700 ring-primary-200',
  whatsapp: 'bg-accent-50 text-accent-700 ring-accent-100',
}
function canalLabel(canal) {
  if (canal === 'whatsapp') return 'WA'
  if (canal === 'sms')      return 'SMS'
  return canal ? canal.slice(0, 3).toUpperCase() : '—'
}

function UltimosMensajesCard({ mensajes, isLoading }) {
  const items = mensajes ?? []
  return (
    <div className="card overflow-hidden p-0">
      <header className="flex items-center justify-between border-b border-border bg-primary-50 px-5 py-3">
        <h3 className="text-sm font-semibold text-primary">Últimos mensajes</h3>
        <Link to="/admin/mensajeria" className="text-xs font-medium text-primary hover:underline">
          Ver todos →
        </Link>
      </header>
      {isLoading ? (
        <div className="flex items-center justify-center p-8"><Spinner /></div>
      ) : items.length === 0 ? (
        <p className="p-6 text-center text-sm text-primary-400">
          Sin mensajes recientes.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map(m => {
            const cls = CANAL_BADGE[m.canal] ?? 'bg-gray-100 text-gray-700 ring-gray-200'
            const isInbound = m.direccion === 'inbound'
            return (
              <li key={m.id} className="flex items-start gap-3 px-5 py-3">
                <span
                  className={
                    'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ' +
                    cls
                  }
                >
                  {canalLabel(m.canal)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm text-primary-700">
                    {isInbound && (
                      <span className="mr-1 inline-flex items-center text-xs font-semibold text-accent-700" aria-label="Recibido">
                        ←
                      </span>
                    )}
                    {m.mensaje || '—'}
                  </p>
                  {m.telefono && (
                    <p className="mt-0.5 text-[11px] text-primary-400">
                      {m.telefono}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-[11px] font-medium text-primary-400">
                  {timeOf(m.created_at)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Gráfico turnos por dependencia (SVG horizontal bars)
// ─────────────────────────────────────────────────────────────────

function TurnosPorDependenciaCard({ turnosMes, isLoading }) {
  const items = useMemo(() => {
    const map = new Map()
    for (const t of (turnosMes ?? [])) {
      const dep = t.dependencia?.nombre ?? t.dependencia_nombre ?? '—'
      map.set(dep, (map.get(dep) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([nombre, count]) => ({ nombre, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [turnosMes])

  const max = items.reduce((m, it) => Math.max(m, it.count), 0)

  return (
    <div className="card overflow-hidden p-0">
      <header className="flex items-center justify-between border-b border-border bg-primary-50 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-primary">Turnos por dependencia</h3>
          <p className="text-[11px] text-primary-400">Este mes</p>
        </div>
        <Link to="/admin/tablero" className="text-xs font-medium text-primary hover:underline">
          Ver tablero →
        </Link>
      </header>
      {isLoading ? (
        <div className="flex items-center justify-center p-12"><Spinner /></div>
      ) : items.length === 0 ? (
        <p className="p-8 text-center text-sm text-primary-400">
          Sin turnos cargados este mes.
        </p>
      ) : (
        <ul className="space-y-2 p-5">
          {items.map(it => {
            const pct = max > 0 ? (it.count / max) * 100 : 0
            return (
              <li key={it.nombre} className="grid grid-cols-[minmax(0,9rem)_1fr_3rem] items-center gap-3 text-xs sm:grid-cols-[minmax(0,11rem)_1fr_3rem]">
                <span className="truncate font-medium text-primary-700" title={it.nombre}>
                  {it.nombre}
                </span>
                <div className="h-3 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full bg-ok"
                    style={{ width: `${pct}%`, minWidth: it.count > 0 ? 4 : 0 }}
                  />
                </div>
                <span className="text-right font-bold text-primary tabular-nums">
                  {it.count}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Gráfico financiero — vertical bars con eje Y y valores
// ─────────────────────────────────────────────────────────────────

function ResumenFinancieroCard({ ingresos, gastos, isLoading }) {
  const sum = (rows, key = 'monto') =>
    (rows ?? []).reduce((a, r) => a + Number(r[key] ?? 0), 0)

  const totalIng = sum(ingresos)
  const totalGas = sum(gastos)
  const saldo    = totalIng - totalGas
  const max      = Math.max(totalIng, totalGas, 1)

  // SVG bar chart — barras anchas pareadas, sin eje Y de %.
  // Mantenemos solo gridlines sutiles para orientación visual; los
  // valores en pesos ya van encima de cada barra.
  const W       = 600
  const H       = 220
  const PAD_L   = 16
  const PAD_R   = 16
  const PAD_TOP = 28
  const PAD_BOT = 36
  const innerH  = H - PAD_TOP - PAD_BOT
  const innerW  = W - PAD_L - PAD_R
  const barW    = Math.min(160, innerW * 0.32)
  const xCenterIng = PAD_L + innerW * 0.28
  const xCenterGas = PAD_L + innerW * 0.72
  const hIng    = (totalIng / max) * innerH
  const hGas    = (totalGas / max) * innerH

  return (
    <div className="card overflow-hidden p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-primary-50 px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-primary">Resumen financiero del mes</h3>
          <p className="text-[11px] text-primary-400">
            Ingresos vs gastos · {currentMonthYYYYMM()}
          </p>
        </div>
        <Link to="/admin/administracion" className="text-xs font-medium text-primary hover:underline">
          Ver detalle →
        </Link>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center p-12"><Spinner /></div>
      ) : (
        <div className="p-5">
          {/* KPIs arriba */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Ingresos</p>
              <p className="mt-1 text-xl font-bold text-ok-700 sm:text-2xl">
                {fmtMoney.format(totalIng)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Gastos</p>
              <p className="mt-1 text-xl font-bold text-accent-700 sm:text-2xl">
                {fmtMoney.format(totalGas)}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Saldo</p>
              <p className={`mt-1 text-xl font-bold sm:text-2xl ${saldo >= 0 ? 'text-primary' : 'text-danger'}`}>
                {fmtMoney.format(saldo)}
              </p>
            </div>
          </div>

          {/* Leyenda */}
          <div className="mt-4 flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-3 rounded-sm bg-primary" /> Ingresos
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-3 rounded-sm bg-accent" /> Gastos
            </span>
          </div>

          {/* Chart */}
          <div className="mt-3 overflow-x-auto">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="block h-auto w-full"
              style={{ minHeight: 200 }}
              role="img"
              aria-label="Gráfico de ingresos vs gastos del mes"
            >
              {/* Gridlines sutiles para orientación — sin labels.
                  Quitamos el eje Y de % porque al dashboard no le
                  llega historia suficiente para que tenga sentido. */}
              {[25, 50, 75].map(pct => {
                const y = PAD_TOP + innerH - (pct / 100) * innerH
                return (
                  <line
                    key={pct}
                    x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                    stroke="#DDE0EC"
                    strokeDasharray="2 4"
                    strokeWidth="1"
                  />
                )
              })}
              <line
                x1={PAD_L} y1={PAD_TOP + innerH}
                x2={W - PAD_R} y2={PAD_TOP + innerH}
                stroke="#DDE0EC" strokeWidth="1"
              />

              {/* Bar Ingresos (navy) */}
              <rect
                x={xCenterIng - barW / 2}
                y={PAD_TOP + innerH - hIng}
                width={barW}
                height={hIng}
                fill="#0F1C35"
                rx="3"
              >
                <title>{`Ingresos: ${fmtMoney.format(totalIng)}`}</title>
              </rect>
              <text
                x={xCenterIng}
                y={PAD_TOP + innerH - hIng - 8}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill="#0F1C35"
              >
                {fmtCompacto.format(totalIng)}
              </text>
              <text
                x={xCenterIng}
                y={H - 12}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill="#475A7C"
              >
                Ingresos
              </text>

              {/* Bar Gastos (gold) */}
              <rect
                x={xCenterGas - barW / 2}
                y={PAD_TOP + innerH - hGas}
                width={barW}
                height={hGas}
                fill="#C9A84C"
                rx="3"
              >
                <title>{`Gastos: ${fmtMoney.format(totalGas)}`}</title>
              </rect>
              <text
                x={xCenterGas}
                y={PAD_TOP + innerH - hGas - 8}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill="#7E682B"
              >
                {fmtCompacto.format(totalGas)}
              </text>
              <text
                x={xCenterGas}
                y={H - 12}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill="#475A7C"
              >
                Gastos
              </text>
            </svg>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Actividad reciente — timeline vertical
// ─────────────────────────────────────────────────────────────────

const TIMELINE_COLOR = {
  turno:    'bg-ok',
  noticia:  'bg-accent',
  gasto:    'bg-primary',
  denuncia: 'bg-danger',
}
const TIMELINE_LABEL = {
  turno:    'Turno',
  noticia:  'Noticia',
  gasto:    'Gasto',
  denuncia: 'Denuncia',
}

function ActividadTimelineCard({ noticias, gastos, denuncias, turnosHoy, isLoading }) {
  // Mezclamos eventos de varias fuentes en un único stream ordenado
  // por timestamp DESC. Cada evento lleva tipo + texto principal +
  // contexto + tiempo, y se cap-ea a 8 items.
  const eventos = useMemo(() => {
    const out = []
    for (const n of (noticias ?? [])) {
      if (!n.publicado_at) continue
      out.push({
        id:    `n-${n.id}`,
        tipo:  'noticia',
        texto: n.titulo,
        sub:   n.categoria || '—',
        ts:    n.publicado_at,
      })
    }
    for (const g of (gastos ?? []).slice(0, 5)) {
      if (!g.created_at && !g.fecha) continue
      out.push({
        id:    `g-${g.id}`,
        tipo:  'gasto',
        texto: g.descripcion ?? 'Gasto',
        sub:   `${g.categoria ?? '—'} · ${fmtMoney.format(g.monto ?? 0)}`,
        ts:    g.created_at ?? `${g.fecha}T00:00:00`,
      })
    }
    for (const d of (denuncias ?? [])) {
      out.push({
        id:    `d-${d.id}`,
        tipo:  'denuncia',
        texto: d.asunto ?? 'Denuncia',
        sub:   d.tipo ?? 'Reclamo ciudadano',
        ts:    d.created_at,
      })
    }
    for (const t of (turnosHoy ?? []).slice(0, 5)) {
      out.push({
        id:    `t-${t.id}`,
        tipo:  'turno',
        texto: vecinoNombre(t.vecino),
        sub:   `${t.dependencia?.nombre ?? '—'} · ${timeOf(t.fecha_hora) || '—'}`,
        ts:    t.created_at ?? t.fecha_hora,
      })
    }
    return out
      .filter(e => !!e.ts)
      .sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''))
      .slice(0, 8)
  }, [noticias, gastos, denuncias, turnosHoy])

  return (
    <div className="card overflow-hidden p-0">
      <header className="flex items-center justify-between border-b border-border bg-primary-50 px-5 py-3">
        <h3 className="text-sm font-semibold text-primary">Actividad reciente</h3>
      </header>
      {isLoading ? (
        <div className="flex items-center justify-center p-8"><Spinner /></div>
      ) : eventos.length === 0 ? (
        <p className="p-6 text-center text-sm text-primary-400">
          Sin actividad registrada todavía.
        </p>
      ) : (
        <div className="relative px-5 py-4">
          {/* Línea vertical navy */}
          <div className="absolute bottom-4 left-[26px] top-4 w-0.5 bg-primary-100" aria-hidden="true" />
          <ul className="space-y-2">
            {eventos.map(e => {
              const dotCls = TIMELINE_COLOR[e.tipo] ?? 'bg-primary-300'
              return (
                <li key={e.id} className="relative flex gap-2 pl-7">
                  {/* Punto */}
                  <span
                    className={`absolute left-[14px] top-1.5 inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white ${dotCls}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="line-clamp-1 text-xs font-medium text-primary-700">
                        <span className="mr-1.5 text-[10px] font-bold uppercase tracking-wide text-primary-400">
                          {TIMELINE_LABEL[e.tipo]}
                        </span>
                        {e.texto}
                      </p>
                      <span className="shrink-0 text-[10px] text-primary-400">
                        {timeOf(e.ts) || dateOf(e.ts)}
                      </span>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { perfil, municipio } = useAuth()
  const municipioId = perfil?.municipio_id ?? null
  const today = todayArgYMD()
  const mes   = currentMonthYYYYMM()
  const mesAnterior = prevMonthYYYYMM(mes)
  const anio  = currentYear()
  const monthStart = monthRange(mes).first

  // Turnos del día
  const turnosQ = useTurnos({ fecha: today })

  // Turnos del mes para el gráfico por dependencia
  const { first: monthFrom, next: monthEnd } = monthRange(mes)
  const turnosMesQ = useTurnos({ fechaFrom: monthFrom, fechaTo: monthEnd })

  // KPIs
  const vecinosTotalQ = useQuery({
    queryKey: ['dashboard', 'vecinos-count', municipioId ?? '__ALL__'],
    queryFn:  () => fetchVecinosCount(municipioId),
    enabled:  !!perfil,
  })
  const vecinosNuevosQ = useQuery({
    queryKey: ['dashboard', 'vecinos-nuevos-mes', municipioId ?? '__ALL__', mes],
    queryFn:  () => fetchVecinosCount(municipioId, monthStart),
    enabled:  !!perfil,
  })
  const mensajesMesQ = useQuery({
    queryKey: ['dashboard', 'mensajes-mes', municipioId ?? '__ALL__', mes],
    queryFn:  () => fetchMensajesCount(municipioId, mes),
    enabled:  !!perfil,
  })
  const mensajesPrevQ = useQuery({
    queryKey: ['dashboard', 'mensajes-mes', municipioId ?? '__ALL__', mesAnterior],
    queryFn:  () => fetchMensajesCount(municipioId, mesAnterior),
    enabled:  !!perfil,
  })
  const denunciasAbQ = useQuery({
    queryKey: ['dashboard', 'denuncias-abiertas', municipioId ?? '__ALL__'],
    queryFn:  () => fetchDenunciasAbiertasCount(municipioId),
    enabled:  !!perfil,
  })

  // Actividad reciente
  const noticiasQ = useQuery({
    queryKey: ['dashboard', 'ultimas-noticias', municipioId ?? '__ALL__'],
    queryFn:  () => fetchUltimasNoticias(municipioId),
    enabled:  !!perfil,
  })
  const gastosRecientesQ = useGastos({})
  const ultimasDenunciasQ = useQuery({
    queryKey: ['dashboard', 'ultimas-denuncias', municipioId ?? '__ALL__'],
    queryFn:  () => fetchUltimasDenuncias(municipioId),
    enabled:  !!perfil,
  })

  // Médico de guardia + últimos mensajes
  const medicoGuardiaQ = useQuery({
    queryKey: ['dashboard', 'medico-guardia', municipioId ?? '__ALL__', today],
    queryFn:  () => fetchMedicoGuardia(municipioId, today),
    enabled:  !!perfil,
  })
  const ultimosMensajesQ = useQuery({
    queryKey: ['dashboard', 'ultimos-mensajes', municipioId ?? '__ALL__'],
    queryFn:  () => fetchUltimosMensajes(municipioId),
    enabled:  !!perfil,
  })

  // Resumen financiero del mes
  const ingresosMesQ = useIngresos({ mes })
  const gastosMesQ   = useGastos({ mes })
  // presupuesto se mantiene cargado por si lo retomamos en una
  // próxima iteración (ej: % ejecución como KPI quinto).
  usePresupuesto(anio)

  // Métricas derivadas para los KPIs.
  const turnosHoy        = turnosQ.data ?? []
  const turnosCount      = turnosHoy.length
  const turnosAtendidos  = turnosHoy.filter(t => t.estado === 'completado' || t.estado === 'atendido').length

  const vecinosTotal     = vecinosTotalQ.data ?? 0
  const vecinosNuevos    = vecinosNuevosQ.data ?? 0

  const mensajesMes  = mensajesMesQ.data  ?? 0
  const mensajesPrev = mensajesPrevQ.data ?? 0
  const mensajesDelta = mensajesMes - mensajesPrev

  const denunciasAb = denunciasAbQ.data ?? 0

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <p className="text-sm text-primary-400">
          Resumen del día — {municipio?.nombre ?? 'tu municipio'}
        </p>
      </header>

      {/* Resumen del día — banner navy */}
      <ResumenDelDia perfil={perfil} turnosHoy={turnosHoy} />

      {/* KPIs */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          isLoading={turnosQ.isLoading}
          label="Turnos hoy"
          value={turnosCount}
          icon={ICONS.calendar}
          hint={`${turnosAtendidos} atendido${turnosAtendidos === 1 ? '' : 's'}`}
        />
        <KpiCard
          isLoading={vecinosTotalQ.isLoading || vecinosNuevosQ.isLoading}
          label="Vecinos registrados"
          value={vecinosTotal}
          icon={ICONS.people}
          hint="Padrón actual"
          delta={vecinosNuevos > 0 ? vecinosNuevos : null}
        />
        <KpiCard
          isLoading={mensajesMesQ.isLoading || mensajesPrevQ.isLoading}
          label="Mensajes del mes"
          value={mensajesMes}
          icon={ICONS.chat}
          hint="SMS + WhatsApp"
          delta={mensajesDelta}
        />
        <KpiCard
          isLoading={denunciasAbQ.isLoading}
          label="Denuncias abiertas"
          value={denunciasAb}
          icon={ICONS.alert}
          accent={denunciasAb > 0 ? 'danger' : 'primary'}
          hint="Sin resolver"
        />
      </div>

      {/* Grid compacto a 3 columnas — las cards "anchas" (TurnosHoy,
          Financiero, ActividadReciente) usan col-span-2 para tener
          aire; las laterales (MedicoGuardia, UltimosMensajes,
          TurnosPorDep) ocupan 1 col. items-start evita que cards
          cortas se estiren a la altura de las largas en su fila. */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TurnosHoyCard turnos={turnosQ.data} isLoading={turnosQ.isLoading} />
        </div>
        <MedicoGuardiaCard
          data={medicoGuardiaQ.data}
          isLoading={medicoGuardiaQ.isLoading}
        />

        <div className="lg:col-span-2">
          <ResumenFinancieroCard
            ingresos={ingresosMesQ.data}
            gastos={gastosMesQ.data}
            isLoading={ingresosMesQ.isLoading || gastosMesQ.isLoading}
          />
        </div>
        <UltimosMensajesCard
          mensajes={ultimosMensajesQ.data}
          isLoading={ultimosMensajesQ.isLoading}
        />

        <TurnosPorDependenciaCard
          turnosMes={turnosMesQ.turnos}
          isLoading={turnosMesQ.isLoading}
        />
        <div className="lg:col-span-2">
          <ActividadTimelineCard
            noticias={noticiasQ.data}
            gastos={gastosRecientesQ.data}
            denuncias={ultimasDenunciasQ.data}
            turnosHoy={turnosQ.data}
            isLoading={
              noticiasQ.isLoading || gastosRecientesQ.isLoading ||
              ultimasDenunciasQ.isLoading || turnosQ.isLoading
            }
          />
        </div>
      </div>
    </div>
  )
}
