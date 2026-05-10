import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useTurnos, useProximosTurnos } from '../../hooks/useTurnos'
import {
  useGastos, useIngresos, usePresupuesto,
  currentMonthYYYYMM, currentYear, monthRange,
} from '../../hooks/useAdministracion'
import { dateTimeOf, timeOf } from '../../lib/datetime'
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
    .select('id, descripcion, estado, created_at')
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

// Schema real de medicos_agenda:
//   id, dependencia_id, usuario_id, semana_inicio, semana_fin,
//   activo, created_at
// No tiene municipio_id propio. El nombre del médico vive en
// `usuarios` y se trae vía join.
//
// Para filtrar por municipio el flujo es de dos pasos: primero
// fetchDepSalud resuelve la dependencia de salud del municipio
// (caps/salud/sala), después medicos_agenda se filtra por ese
// dependencia_id.
const MEDICO_COLS = `
  id, semana_inicio, semana_fin, activo,
  usuario:usuario_id ( id, nombre, email )
`

const TIPOS_DEP_SALUD = ['caps', 'salud', 'sala']

async function fetchDepSalud(municipioId) {
  // Trace de input para debuggear casos donde el card aparece sin
  // médico aunque hay datos cargados: si municipioId es null acá,
  // el problema está aguas arriba (useEffectiveMunicipioId).
  console.log('[Dashboard] fetchDepSalud input municipioId:', municipioId)
  if (!municipioId) {
    console.warn('[Dashboard] fetchDepSalud: sin municipioId, retornando null')
    return null
  }
  // El campo es `activa` (femenino) en dependencias, vs `activo`
  // (masculino) en usuarios y en medicos_agenda. Confirmado por
  // schema. Filtro por municipio_id ya aplicado.
  const { data, error } = await supabase
    .from('dependencias')
    .select('id, tipo, nombre, activa, municipio_id')
    .eq('municipio_id', municipioId)
    .in('tipo', TIPOS_DEP_SALUD)
    .eq('activa', true)
    .order('tipo', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn('[Dashboard] fetchDepSalud error:', error.message)
    return null
  }
  if (!data) {
    console.warn(`[Dashboard] fetchDepSalud: sin dep de salud para municipio ${municipioId} (tipos ${TIPOS_DEP_SALUD.join('/')} con activa=true)`)
  } else {
    console.log('[Dashboard] fetchDepSalud result:', data)
  }
  return data
}

// Médico activo esta semana — la fila de medicos_agenda cuyo
// rango semana_inicio..semana_fin contiene a hoy.
//
// OJO: el campo se llama `activo` (masculino) en medicos_agenda,
// distinto del `activa` (femenino) en dependencias.
async function fetchMedicoGuardia(dependenciaId, today) {
  console.log('[Dashboard] fetchMedicoGuardia input:', { dependenciaId, today })
  if (!dependenciaId) {
    console.warn('[Dashboard] fetchMedicoGuardia: sin dependenciaId, retornando null')
    return null
  }
  const { data, error } = await supabase
    .from('medicos_agenda')
    .select(MEDICO_COLS)
    .eq('dependencia_id', dependenciaId)
    .eq('activo', true)
    .gte('semana_fin', today)
    .lte('semana_inicio', today)
    .order('semana_inicio', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    console.warn('[Dashboard] fetchMedicoGuardia error:', error.message)
    return null
  }
  if (!data) {
    console.warn(`[Dashboard] fetchMedicoGuardia: sin médico activo para dep ${dependenciaId} cubriendo ${today}`)
  } else {
    console.log('[Dashboard] fetchMedicoGuardia result:', data)
  }
  return data
}

// Próximas guardias — las siguientes filas activas con
// semana_inicio > hoy, ordenadas ascendente.
async function fetchProximasGuardias(dependenciaId, today, limit = 3) {
  console.log('[Dashboard] fetchProximasGuardias input:', { dependenciaId, today, limit })
  if (!dependenciaId) return []
  const { data, error } = await supabase
    .from('medicos_agenda')
    .select(MEDICO_COLS)
    .eq('dependencia_id', dependenciaId)
    .eq('activo', true)
    .gt('semana_inicio', today)
    .order('semana_inicio', { ascending: true })
    .limit(limit)
  if (error) {
    console.warn('[Dashboard] fetchProximasGuardias error:', error.message)
    return []
  }
  console.log('[Dashboard] fetchProximasGuardias result:', data?.length ?? 0, 'fila(s)')
  return data ?? []
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
    <section className="overflow-hidden rounded-xl bg-gradient-to-br from-primary via-primary-700 to-primary-900 p-5 text-white shadow-card sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-sora text-xl font-bold sm:text-2xl">
            {saludoSegunHora()}{nombre ? `, ${nombre}` : ''}.
          </p>
          {/* Sin `capitalize` — el formato es-AR de Intl ya devuelve
              "sábado, 9 de mayo de 2026" en minúsculas, y la
              tipografía de la oración corre desde "Hoy es" capitalizado. */}
          <p className="mt-1 text-sm text-white/70 sm:text-base">
            Hoy es {fechaLarga}.
          </p>
        </div>
        {pendientes > 0 && (
          <div className="inline-flex items-center gap-2.5 rounded-lg bg-accent/15 px-4 py-2.5 ring-1 ring-inset ring-accent/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-accent" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 2" />
            </svg>
            <p className="text-sm font-medium text-white">
              <span className="font-bold text-accent">{pendientes}</span>{' '}
              turno{pendientes === 1 ? '' : 's'} pendiente{pendientes === 1 ? '' : 's'} para hoy
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

function MiniProgress({ pct, color = 'primary' }) {
  const clamped = Math.max(0, Math.min(100, pct ?? 0))
  const fill = color === 'danger' ? 'bg-danger'
            : color === 'accent' ? 'bg-accent'
            : color === 'ok'     ? 'bg-ok'
            : 'bg-primary'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary-50">
      <div className={`h-full ${fill}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

function KpiCard({
  label, value, icon, accent = 'primary',
  hint, delta, progressPct, progressColor,
  isLoading,
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
      <div className="card flex flex-col gap-2 p-5">
        <p className="text-sm font-medium text-primary-500">{label}</p>
        <Spinner size="sm" />
      </div>
    )
  }

  return (
    <div className="card flex flex-col gap-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-primary-500">{label}</p>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconWrap}`}>
          {icon}
        </div>
      </div>
      <p className={`-mt-1 text-3xl font-bold ${valueColor}`}>
        {value}
      </p>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-primary-400">
          {hint ? <span>{hint}</span> : <span />}
          <TrendBadge delta={delta} />
        </div>
        {Number.isFinite(progressPct) && (
          <MiniProgress pct={progressPct} color={progressColor ?? accent} />
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

// Formato "Lunes, 13 de mayo" para el header de "Próximos turnos".
const fmtFechaProximo = new Intl.DateTimeFormat('es-AR', {
  weekday: 'long', day: 'numeric', month: 'long',
})
function fechaTituloDe(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  // Capitalizamos el primer caracter — Intl devuelve "lunes" en
  // minúsculas y queda mejor en el header como "Lunes".
  const s = fmtFechaProximo.format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Formato "Lun 12/05" para la primera celda de cada fila en modo
// "próximos turnos" — distintos turnos pueden caer en distintos
// días, así que cada fila lleva su propia fecha.
const _fmtWd = new Intl.DateTimeFormat('es-AR', { weekday: 'short' })
const _fmtDM = new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: '2-digit' })
function fechaCortaFilaDe(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d)) return ''
  // "lun." → "Lun" (capitaliza + remueve punto que mete es-AR).
  const wd = _fmtWd.format(d).replace('.', '')
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${_fmtDM.format(d)}`
}

function TurnoRow({ t, mostrarHora = true }) {
  const isFamiliar = !!t.metadata?.para_familiar
  const nombre = isFamiliar
    ? (t.metadata.familiar_nombre || vecinoNombre(t.vecino))
    : vecinoNombre(t.vecino)
  const depNombre = t.dependencia?.nombre ?? t.dependencia_nombre ?? '—'
  return (
    <tr>
      <td className="whitespace-nowrap px-4 py-3">
        {mostrarHora ? (
          <span className="font-bold text-primary">
            {timeOf(t.fecha_hora) || '—'}
          </span>
        ) : (
          // Modo "próximo": badge gold, fecha corta + hora apilados.
          <div className="flex flex-col items-start gap-0.5">
            <span className="inline-flex items-center rounded-full bg-accent/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-700 ring-1 ring-inset ring-accent/30">
              Próximo
            </span>
            <span className="text-xs font-semibold text-primary-700">
              {fechaCortaFilaDe(t.fecha_hora)}
            </span>
            <span className="text-sm font-bold text-primary">
              {timeOf(t.fecha_hora) || '—'}
            </span>
          </div>
        )}
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
}

function TurnosHoyCard({ turnos, isLoading, proximos = [], proximosLoading = false }) {
  const filaHoy = (turnos ?? [])
    .filter(t => t.estado === 'pendiente' || t.estado === 'confirmado' || t.estado === 'en_curso')
    .sort((a, b) => (a.fecha_hora ?? '').localeCompare(b.fecha_hora ?? ''))
    .slice(0, 6)

  // Si no hay turnos hoy, caemos a la lista de próximos turnos.
  // El header se relabel para dejar claro que son a futuro y la
  // primera celda muestra una badge "PRÓXIMO" en vez de la hora —
  // así la info de la fecha (en el subtítulo) queda como ancla.
  const usandoProximos = filaHoy.length === 0 && proximos.length > 0
  const filas          = usandoProximos ? proximos : filaHoy
  const fechaProximos  = usandoProximos ? fechaTituloDe(proximos[0]?.fecha_hora) : null

  const titulo = usandoProximos ? 'Próximos turnos' : 'Turnos de hoy'
  const subtitulo = usandoProximos
    ? `No hay turnos para hoy · ${fechaProximos}`
    : null

  // Loading: si todavía esperamos turnos hoy, mostramos spinner.
  // Si terminó turnos hoy y caímos al fallback, esperamos también
  // el query de próximos antes de decidir el empty final.
  const showSpinner = isLoading || (filaHoy.length === 0 && proximosLoading)

  return (
    <div className="card overflow-hidden p-0">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-primary-50 px-5 py-3">
        <div className="min-w-0">
          <h3 className="font-sora text-sm font-semibold text-primary">{titulo}</h3>
          {subtitulo && (
            <p className="mt-0.5 text-xs text-primary-500">{subtitulo}</p>
          )}
        </div>
        <Link to="/admin/tablero" className="shrink-0 text-xs font-medium text-primary hover:underline">
          Ver todos →
        </Link>
      </header>
      {showSpinner ? (
        <div className="flex items-center justify-center p-8"><Spinner /></div>
      ) : filas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <p className="text-sm text-primary-400">Sin turnos programados próximamente.</p>
          <Link
            to="/admin/tablero"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            Ir al tablero →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-primary-50/40 text-xs uppercase tracking-wide text-primary-500">
              <tr>
                <th className="px-4 py-2 font-semibold">{usandoProximos ? '' : 'Hora'}</th>
                <th className="px-4 py-2 font-semibold">Dependencia</th>
                <th className="px-4 py-2 font-semibold">Vecino</th>
                <th className="px-4 py-2 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filas.map(t => (
                <TurnoRow key={t.id} t={t} mostrarHora={!usandoProximos} />
              ))}
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

// Formateo es-AR de rangos semanales para mostrar al usuario:
//   "del 10 al 17 de mayo"          (mismo mes)
//   "del 29 de mayo al 5 de junio"  (cruza mes)
//   "desde el 18 de mayo"           (open-ended, una sola fecha)
const _fmtDiaMesLong = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' })
const _fmtMesLong    = new Intl.DateTimeFormat('es-AR', { month: 'long' })

function rangoSemanaTexto(desde, hasta) {
  if (!desde) return ''
  const d1 = new Date(desde)
  if (isNaN(d1)) return ''
  if (!hasta) return `desde el ${_fmtDiaMesLong.format(d1)}`
  const d2 = new Date(hasta)
  if (isNaN(d2)) return `desde el ${_fmtDiaMesLong.format(d1)}`
  const sameMes = d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear()
  if (sameMes) {
    return `del ${d1.getDate()} al ${d2.getDate()} de ${_fmtMesLong.format(d2)}`
  }
  return `del ${_fmtDiaMesLong.format(d1)} al ${_fmtDiaMesLong.format(d2)}`
}

// Ficha del médico activo de la semana. Solo se usa para el render
// del médico vigente — las próximas guardias se listan con un
// bullet más compacto debajo.
function MedicoFicha({ medico }) {
  const nombre = medico?.usuario?.nombre || 'Médico de guardia'
  const rango  = rangoSemanaTexto(medico?.semana_inicio, medico?.semana_fin)

  return (
    <div className="flex items-start gap-4">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/10 text-accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v8a4 4 0 0 0 8 0V3M5 3H3M13 3h-2M9 15v3a4 4 0 0 0 8 0v-2" />
          <circle cx="17" cy="13" r="2" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-sora text-xl font-bold leading-tight sm:text-2xl">{nombre}</p>
        {rango && <p className="mt-2 text-xs text-white/60">{rango}</p>}
      </div>
    </div>
  )
}

// Línea de "Próximas guardias" — bullet gold + "Dr. X — del 18 al
// 24 de mayo". Usa el mismo rangoSemanaTexto.
function ProximaGuardiaItem({ medico }) {
  const nombre = medico?.usuario?.nombre || 'Por asignar'
  const rango  = rangoSemanaTexto(medico?.semana_inicio, medico?.semana_fin)
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <span className="text-white/85">
        <span className="font-semibold text-white">{nombre}</span>
        {rango && <span className="text-white/55"> — {rango}</span>}
      </span>
    </li>
  )
}

function MedicoGuardiaCard({ data, isLoading, proximas = [], proximasLoading = false }) {
  // 3 estados:
  //   1) data → médico activo + (opcional) lista de próximas guardias
  //   2) !data + proximas[0] → "sin guardia esta semana" + ficha de la próxima
  //   3) sin nada → empty state con CTA a /admin/sala
  const showSpinner = isLoading || (!data && proximasLoading)
  const hayActual   = !!data
  const proximasRestantes = hayActual ? proximas : proximas.slice(1)
  const proximaSiguiente  = hayActual ? null : (proximas[0] ?? null)

  return (
    <div className="card overflow-hidden bg-gradient-to-br from-primary via-primary-700 to-primary-900 p-0 text-white">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-3">
        <h3 className="text-sm font-semibold text-white">Médico de guardia</h3>
        <Link to="/admin/sala" className="text-xs font-medium text-accent hover:underline">
          Ver agenda →
        </Link>
      </header>
      <div className="space-y-4 p-5 sm:p-6">
        {showSpinner ? (
          <div className="flex items-center justify-center p-4">
            <Spinner />
          </div>
        ) : hayActual ? (
          <>
            <MedicoFicha medico={data} />
            {proximasRestantes.length > 0 && (
              <div className="border-t border-white/10 pt-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Próximas guardias
                </p>
                <ul className="mt-2 space-y-1.5">
                  {proximasRestantes.map(m => (
                    <ProximaGuardiaItem key={m.id} medico={m} />
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : proximaSiguiente ? (
          <>
            <p className="text-sm text-white/70">Sin guardia asignada esta semana.</p>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-accent">
                Próxima guardia
              </p>
              <p className="mt-1 font-sora text-base font-bold leading-tight">
                {proximaSiguiente.usuario?.nombre || 'Médico de guardia'}
              </p>
              <p className="text-xs text-white/60">
                {rangoSemanaTexto(proximaSiguiente.semana_inicio, proximaSiguiente.semana_fin)}
              </p>
            </div>
            {proximasRestantes.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  Después
                </p>
                <ul className="mt-2 space-y-1.5">
                  {proximasRestantes.map(m => (
                    <ProximaGuardiaItem key={m.id} medico={m} />
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-white/70">Sin guardias programadas.</p>
            <Link
              to="/admin/sala"
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-primary shadow-sm transition-colors hover:bg-accent-400"
            >
              Ir a agenda →
            </Link>
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
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50 text-primary-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9z" />
            </svg>
          </span>
          <div>
            <p className="font-sora text-sm font-semibold text-primary">
              Sin mensajes enviados este mes
            </p>
            <p className="mt-1 text-xs text-primary-400">
              Los mensajes SMS y WhatsApp enviados a vecinos aparecerán acá.
            </p>
          </div>
          <Link
            to="/admin/mensajeria"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            Ir a Mensajería →
          </Link>
        </div>
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

  // SVG bar chart — 2 barras pareadas en la mitad derecha, eje Y
  // a la izquierda con ticks 0/25/50/75/100% del max.
  const W       = 600
  const H       = 240
  const PAD_L   = 60
  const PAD_R   = 20
  const PAD_TOP = 30
  const PAD_BOT = 36
  const innerH  = H - PAD_TOP - PAD_BOT
  const innerW  = W - PAD_L - PAD_R
  const barW    = innerW * 0.18
  const xCenterIng = PAD_L + innerW * 0.30
  const xCenterGas = PAD_L + innerW * 0.70
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
              {/* Eje Y con ticks 0/25/50/75/100% */}
              {[0, 25, 50, 75, 100].map(pct => {
                const y = PAD_TOP + innerH - (pct / 100) * innerH
                const valueAtTick = (max * pct) / 100
                return (
                  <g key={pct}>
                    <line
                      x1={PAD_L} y1={y} x2={W - PAD_R} y2={y}
                      stroke="#DDE0EC"
                      strokeDasharray={pct === 0 ? '0' : '2 4'}
                      strokeWidth="1"
                    />
                    <text
                      x={PAD_L - 8} y={y + 4}
                      textAnchor="end"
                      fontSize="11"
                      fill="#475A7C"
                    >
                      {fmtCompacto.format(valueAtTick)}
                    </text>
                  </g>
                )
              })}

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
        texto: d.descripcion ?? 'Denuncia',
        sub:   'Reclamo ciudadano',
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
        <div className="relative px-5 py-5">
          {/* Línea vertical navy */}
          <div className="absolute bottom-5 left-[26px] top-5 w-0.5 bg-primary-100" aria-hidden="true" />
          <ul className="space-y-4">
            {eventos.map(e => {
              const dotCls = TIMELINE_COLOR[e.tipo] ?? 'bg-primary-300'
              return (
                <li key={e.id} className="relative flex gap-3 pl-8">
                  {/* Punto */}
                  <span
                    className={`absolute left-[14px] top-1.5 inline-block h-3 w-3 rounded-full ring-2 ring-white ${dotCls}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="line-clamp-1 text-sm font-medium text-primary-700">
                        {e.texto}
                      </p>
                      <span className="text-[11px] uppercase tracking-wide text-primary-400">
                        {TIMELINE_LABEL[e.tipo]}
                      </span>
                    </div>
                    <p className="line-clamp-1 text-xs text-primary-400">
                      {e.sub}
                    </p>
                    <p className="mt-0.5 text-[11px] text-primary-300">
                      {dateTimeOf(e.ts)}
                    </p>
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
  // useEffectiveMunicipioId — para superadmin sin municipio_id cae al
  // primer municipio activo. Sin esto el médico de guardia y otras
  // queries con .eq('municipio_id', null) no encuentran filas.
  const municipioId = useEffectiveMunicipioId()
  // today como 'YYYY-MM-DD' sin hora — Supabase serializa el string
  // a timestamptz interpretándolo como medianoche UTC y eso rompe
  // los .lte/.gte contra semana_inicio/semana_fin si el formato no
  // es estricto. Usamos toISOString().split para garantizar formato
  // canónico (en lugar de Intl con timezone).
  const today = new Date().toISOString().split('T')[0]
  const mes   = currentMonthYYYYMM()
  const mesAnterior = prevMonthYYYYMM(mes)
  const anio  = currentYear()
  const monthStart = monthRange(mes).first

  // Turnos del día — usamos fechaFrom + fechaTo del mismo día en
  // zona Argentina (fetchTurnos arma el rango con offset -03:00) en
  // lugar del shorthand `fecha`. Es funcionalmente equivalente pero
  // explicita el rango de timestamptz que se está consultando.
  // Pasamos el municipioId efectivo para que el superadmin no quede
  // con filtro null.
  const turnosQ = useTurnos(
    { fechaFrom: today, fechaTo: today },
    { municipioIdOverride: municipioId },
  )

  // Turnos del mes para el gráfico por dependencia
  const { first: monthFrom, next: monthEnd } = monthRange(mes)
  const turnosMesQ = useTurnos(
    { fechaFrom: monthFrom, fechaTo: monthEnd },
    { municipioIdOverride: municipioId },
  )

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

  // Médico de guardia — flujo de 3 queries:
  //   1) depSaludQ: resuelve la dependencia de salud del municipio.
  //      medicos_agenda se filtra por dependencia_id, no por
  //      municipio_id (no existe esa columna).
  //   2) medicoGuardiaQ: médico activo esta semana.
  //   3) proximasGuardiasQ: las próximas 3 guardias futuras. Se
  //      muestran SIEMPRE que existan, no solo como fallback.
  const depSaludQ = useQuery({
    queryKey: ['dashboard', 'dep-salud', municipioId ?? '__NONE__'],
    queryFn:  () => fetchDepSalud(municipioId),
    enabled:  !!perfil && !!municipioId,
    staleTime: 60 * 60 * 1000,
  })
  const depSaludId = depSaludQ.data?.id ?? null

  const medicoGuardiaQ = useQuery({
    queryKey: ['dashboard', 'medico-guardia', depSaludId ?? '__NONE__', today],
    queryFn:  () => fetchMedicoGuardia(depSaludId, today),
    enabled:  !!perfil && !!depSaludId,
  })
  const proximasGuardiasQ = useQuery({
    queryKey: ['dashboard', 'proximas-guardias', depSaludId ?? '__NONE__', today],
    queryFn:  () => fetchProximasGuardias(depSaludId, today, 3),
    enabled:  !!perfil && !!depSaludId,
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
  // useTurnos devuelve { turnos, isLoading, ... } — NO un useQuery
  // crudo. Acceder a `.data` daba siempre undefined → turnos hoy
  // aparecía vacío aunque hubiera filas.
  const turnosHoy        = turnosQ.turnos ?? []
  const turnosCount      = turnosHoy.length

  // Fallback: si no hay turnos hoy, traemos los próximos 5 turnos
  // futuros para mostrarlos en TurnosHoyCard. El query se enciende
  // solo cuando hace falta (turnosHoy vacío + ya tenemos municipio).
  const proximosTurnosQ = useProximosTurnos({
    municipioId,
    enabled: !turnosQ.isLoading && turnosHoy.length === 0 && !!municipioId,
    limit:   5,
  })
  const turnosAtendidos  = turnosHoy.filter(t => t.estado === 'completado' || t.estado === 'atendido').length
  const turnosPctAtendidos = turnosCount > 0 ? Math.round((turnosAtendidos / turnosCount) * 100) : 0

  const vecinosTotal     = vecinosTotalQ.data ?? 0
  const vecinosNuevos    = vecinosNuevosQ.data ?? 0
  // Barra mini: % de nuevos del mes sobre el total — chico pero
  // suficiente para indicar crecimiento visual.
  const vecinosPct = vecinosTotal > 0
    ? Math.min(100, Math.round((vecinosNuevos / vecinosTotal) * 100))
    : 0

  const mensajesMes = mensajesMesQ.data ?? 0
  const mensajesPrev = mensajesPrevQ.data ?? 0
  const mensajesDelta = mensajesMes - mensajesPrev
  const mensajesPct = mensajesMes + mensajesPrev > 0
    ? Math.round((mensajesMes / (mensajesMes + mensajesPrev)) * 100)
    : 0

  const denunciasAb = denunciasAbQ.data ?? 0
  // "Severity meter": cap a 10. Si hay 5 denuncias = 50% de barra.
  const denunciasPct = Math.min(100, denunciasAb * 10)

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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          isLoading={turnosQ.isLoading}
          label="Turnos hoy"
          value={turnosCount}
          icon={ICONS.calendar}
          hint={`${turnosAtendidos} atendido${turnosAtendidos === 1 ? '' : 's'}`}
          progressPct={turnosPctAtendidos}
          progressColor="ok"
        />
        <KpiCard
          isLoading={vecinosTotalQ.isLoading || vecinosNuevosQ.isLoading}
          label="Vecinos registrados"
          value={vecinosTotal}
          icon={ICONS.people}
          hint="Padrón actual"
          delta={vecinosNuevos > 0 ? vecinosNuevos : null}
          progressPct={vecinosPct}
          progressColor="primary"
        />
        <KpiCard
          isLoading={mensajesMesQ.isLoading || mensajesPrevQ.isLoading}
          label="Mensajes del mes"
          value={mensajesMes}
          icon={ICONS.chat}
          hint="SMS + WhatsApp"
          delta={mensajesDelta}
          progressPct={mensajesPct}
          progressColor="accent"
        />
        <KpiCard
          isLoading={denunciasAbQ.isLoading}
          label="Denuncias abiertas"
          value={denunciasAb}
          icon={ICONS.alert}
          accent={denunciasAb > 0 ? 'danger' : 'primary'}
          hint="Sin resolver"
          progressPct={denunciasAb > 0 ? denunciasPct : 0}
          progressColor={denunciasAb > 0 ? 'danger' : 'primary'}
        />
      </div>

      {/* Fila 2: Turnos del día (tabla) + Médico de guardia */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TurnosHoyCard
          turnos={turnosHoy}
          isLoading={turnosQ.isLoading}
          proximos={proximosTurnosQ.data ?? []}
          proximosLoading={proximosTurnosQ.isFetching}
        />
        <MedicoGuardiaCard
          data={medicoGuardiaQ.data}
          isLoading={depSaludQ.isLoading || medicoGuardiaQ.isLoading}
          proximas={proximasGuardiasQ.data ?? []}
          proximasLoading={proximasGuardiasQ.isFetching}
        />
      </div>

      {/* Fila 3: Turnos por dependencia + Últimos mensajes */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TurnosPorDependenciaCard
          turnosMes={turnosMesQ.turnos}
          isLoading={turnosMesQ.isLoading}
        />
        <UltimosMensajesCard
          mensajes={ultimosMensajesQ.data}
          isLoading={ultimosMensajesQ.isLoading}
        />
      </div>

      {/* Fila 4: Resumen financiero + Actividad reciente */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ResumenFinancieroCard
          ingresos={ingresosMesQ.data}
          gastos={gastosMesQ.data}
          isLoading={ingresosMesQ.isLoading || gastosMesQ.isLoading}
        />
        <ActividadTimelineCard
          noticias={noticiasQ.data}
          gastos={gastosRecientesQ.data}
          denuncias={ultimasDenunciasQ.data}
          turnosHoy={turnosHoy}
          isLoading={
            noticiasQ.isLoading || gastosRecientesQ.isLoading ||
            ultimasDenunciasQ.isLoading || turnosQ.isLoading
          }
        />
      </div>
    </div>
  )
}
