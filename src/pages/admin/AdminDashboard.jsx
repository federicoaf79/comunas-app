import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useTurnos } from '../../hooks/useTurnos'
import {
  useGastos, useIngresos, usePresupuesto,
  currentMonthYYYYMM, currentYear, monthRange,
} from '../../hooks/useAdministracion'
import { todayArgYMD, dateOf, timeOf } from '../../lib/datetime'
import StatCard from '../../components/ui/StatCard'
import Spinner from '../../components/ui/Spinner'

// =============================================================
// Dashboard real — sin mockData. Junta datos de turnos, vecinos,
// mensajes, denuncias, noticias, gastos e ingresos vía hooks
// existentes + queries inline para los conteos head:true.
// =============================================================

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

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

// ─────────────────────────────────────────────────────────────────
// Conteos rápidos vía head:true — no traen filas, solo el count
// ─────────────────────────────────────────────────────────────────

async function fetchVecinosCount(municipioId) {
  let q = supabase.from('vecinos').select('id', { count: 'exact', head: true })
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { count, error } = await q
  if (error) {
    console.warn('[Dashboard] fetchVecinosCount:', error.message)
    return 0
  }
  return count ?? 0
}

async function fetchMensajesMesCount(municipioId) {
  const mes = currentMonthYYYYMM()
  const { first, next } = monthRange(mes)
  // Las fechas son timestamptz — comparamos con ISO de la primera
  // hora del mes en zona local (suficiente para un KPI de cabecera).
  let q = supabase
    .from('sms_log')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', `${first}T00:00:00`)
    .lt('created_at',  `${next}T00:00:00`)
  if (municipioId) q = q.eq('municipio_id', municipioId)
  const { count, error } = await q
  if (error) {
    console.warn('[Dashboard] fetchMensajesMesCount:', error.message)
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

// ─────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────

function vecinoNombre(v) {
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

function StatCardLoading({ label }) {
  return (
    <div className="card flex flex-col gap-2 p-5">
      <p className="text-sm font-medium text-primary-500">{label}</p>
      <Spinner size="sm" />
    </div>
  )
}

function TurnosHoyCard({ turnos, isLoading }) {
  // Próximos del día: confirmados + pendientes ordenados por hora.
  const proximos = (turnos ?? [])
    .filter(t => t.estado === 'pendiente' || t.estado === 'confirmado' || t.estado === 'en_curso')
    .sort((a, b) => (a.fecha_hora ?? '').localeCompare(b.fecha_hora ?? ''))
    .slice(0, 5)

  return (
    <div className="card overflow-hidden p-0">
      <header className="flex items-center justify-between border-b border-border bg-primary-50 px-5 py-3">
        <h3 className="text-sm font-semibold text-primary">Turnos de hoy</h3>
        <Link to="/admin/turnos" className="text-xs font-medium text-primary hover:underline">
          Ver todos →
        </Link>
      </header>
      {isLoading ? (
        <div className="flex items-center justify-center p-8"><Spinner /></div>
      ) : proximos.length === 0 ? (
        <p className="p-6 text-center text-sm text-primary-400">
          No hay turnos pendientes para hoy.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {proximos.map(t => {
            const isFamiliar = !!t.metadata?.para_familiar
            const nombre = isFamiliar
              ? (t.metadata.familiar_nombre || vecinoNombre(t.vecino))
              : vecinoNombre(t.vecino)
            return (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                <div className="shrink-0 text-right">
                  <p className="text-base font-bold leading-none text-primary">
                    {timeOf(t.fecha_hora) || '—'}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-primary-700">{nombre}</p>
                  <p className="truncate text-xs text-primary-400">
                    {t.dependencia?.nombre ?? '—'}
                    {isFamiliar && ' · 👨‍👩‍👧'}
                  </p>
                </div>
                <span className={ESTADO_CLASS[t.estado] ?? 'estado-pendiente'}>
                  {ESTADO_LABEL[t.estado] ?? t.estado}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ActividadRecienteCard({ noticias, gastos, isLoading }) {
  const ultimasNoticias = noticias ?? []
  const ultimosGastos   = (gastos ?? []).slice(0, 3)

  return (
    <div className="card overflow-hidden p-0">
      <header className="flex items-center justify-between border-b border-border bg-primary-50 px-5 py-3">
        <h3 className="text-sm font-semibold text-primary">Actividad reciente</h3>
      </header>
      {isLoading ? (
        <div className="flex items-center justify-center p-8"><Spinner /></div>
      ) : (
        <div className="divide-y divide-border">
          <section className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-accent-700">
                Últimas noticias
              </p>
              <Link to="/admin/noticias" className="text-xs font-medium text-primary hover:underline">
                Ver noticias →
              </Link>
            </div>
            {ultimasNoticias.length === 0 ? (
              <p className="text-sm text-primary-400">Todavía no hay noticias publicadas.</p>
            ) : (
              <ul className="space-y-2">
                {ultimasNoticias.map(n => (
                  <li key={n.id} className="flex items-start gap-3">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-primary-700">{n.titulo}</p>
                      <p className="text-xs text-primary-400">
                        {n.categoria ? `${n.categoria} · ` : ''}
                        {n.publicado_at ? dateOf(n.publicado_at) : '—'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-accent-700">
                Últimos gastos
              </p>
              <Link to="/admin/administracion" className="text-xs font-medium text-primary hover:underline">
                Ver gastos →
              </Link>
            </div>
            {ultimosGastos.length === 0 ? (
              <p className="text-sm text-primary-400">No hay gastos cargados.</p>
            ) : (
              <ul className="space-y-2">
                {ultimosGastos.map(g => (
                  <li key={g.id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-primary-700">{g.descripcion}</p>
                      <p className="text-xs text-primary-400">
                        {g.categoria ? `${g.categoria} · ` : ''}
                        {dateOf(g.fecha)}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-primary">
                      {fmtMoney.format(g.monto ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function ResumenFinancieroCard({ ingresos, gastos, presupuesto, isLoading }) {
  const sum = (rows, key = 'monto') =>
    (rows ?? []).reduce((a, r) => a + Number(r[key] ?? 0), 0)

  const totalIng = sum(ingresos)
  const totalGas = sum(gastos)
  const saldo    = totalIng - totalGas

  // % de ejecución presupuestaria YTD: gastos aprobados del año en
  // curso sobre el presupuesto anual total. Usamos la versión rápida:
  // el componente recibe el presupuesto del año + los gastos del mes,
  // pero para el % necesitamos los aprobados YTD — si no los tenemos
  // en este componente, mostramos solo ingresos vs gastos del mes.
  const presTotal = sum(presupuesto, 'monto_anual')
  const gastadoMesAprobado = sum((gastos ?? []).filter(g => g.estado === 'aprobado'))
  const pctMes = presTotal > 0
    ? Math.min(100, Math.round((gastadoMesAprobado / presTotal) * 100 * 12)) // proyección anualizada
    : 0
  // Usamos pctMes solo como referencia del mes — la página de
  // administración tiene el indicador YTD real. Acá privilegiamos
  // un dashboard rápido sin queries adicionales.
  const max = Math.max(totalIng, totalGas, 1)

  return (
    <div className="card p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-primary">Resumen financiero del mes</h3>
          <p className="text-xs text-primary-400">Ingresos vs gastos · {currentMonthYYYYMM()}</p>
        </div>
        <Link to="/admin/administracion" className="text-xs font-medium text-primary hover:underline">
          Ver detalle →
        </Link>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center p-8"><Spinner /></div>
      ) : (
        <div className="space-y-5">
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

          {/* Barra comparativa simple ingresos vs gastos */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-primary-500">
              <span>Comparativa del mes</span>
              <span>
                Ingresos {Math.round((totalIng / max) * 100)}% · Gastos {Math.round((totalGas / max) * 100)}%
              </span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs font-medium text-primary-500">Ingresos</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary-50">
                  <div className="h-full bg-ok" style={{ width: `${(totalIng / max) * 100}%` }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs font-medium text-primary-500">Gastos</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-primary-50">
                  <div className="h-full bg-accent" style={{ width: `${(totalGas / max) * 100}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Ejecución presupuestaria (proyección mensual) */}
          {presTotal > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-primary-500">
                <span>Ejecución presupuestaria del mes (proyectada al año)</span>
                <span>{pctMes}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-primary-50">
                <div
                  className={pctMes > 90 ? 'bg-danger h-full' : pctMes > 70 ? 'bg-accent h-full' : 'bg-ok h-full'}
                  style={{ width: `${Math.min(100, pctMes)}%` }}
                />
              </div>
            </div>
          )}
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
  const anio  = currentYear()

  // Turnos del día (hook ya filtrado por municipio del perfil).
  const turnosQ = useTurnos({ fecha: today })

  // Conteos rápidos de KPIs.
  const vecinosCountQ = useQuery({
    queryKey: ['dashboard', 'vecinos-count', municipioId ?? '__ALL__'],
    queryFn:  () => fetchVecinosCount(municipioId),
    enabled:  !!perfil,
  })
  const mensajesMesQ = useQuery({
    queryKey: ['dashboard', 'mensajes-mes', municipioId ?? '__ALL__', mes],
    queryFn:  () => fetchMensajesMesCount(municipioId),
    enabled:  !!perfil,
  })
  const denunciasAbQ = useQuery({
    queryKey: ['dashboard', 'denuncias-abiertas', municipioId ?? '__ALL__'],
    queryFn:  () => fetchDenunciasAbiertasCount(municipioId),
    enabled:  !!perfil,
  })

  // Actividad reciente — noticias publicadas y últimos gastos.
  const noticiasQ = useQuery({
    queryKey: ['dashboard', 'ultimas-noticias', municipioId ?? '__ALL__'],
    queryFn:  () => fetchUltimasNoticias(municipioId),
    enabled:  !!perfil,
  })
  const gastosRecientesQ = useGastos({}) // sin filtros — la query trae los más recientes (orden DESC por fecha)

  // Resumen financiero del mes.
  const ingresosMesQ    = useIngresos({ mes })
  const gastosMesQ      = useGastos({ mes })
  const presupuestoQ    = usePresupuesto(anio)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <p className="text-sm text-primary-400">
          Resumen del día — {municipio?.nombre ?? 'tu municipio'}
        </p>
      </header>

      {/* Fila 1: KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {turnosQ.isLoading ? (
          <StatCardLoading label="Turnos hoy" />
        ) : (
          <StatCard
            label="Turnos hoy"
            value={turnosQ.data?.length ?? 0}
            hint={`${(turnosQ.data ?? []).filter(t => t.estado === 'completado' || t.estado === 'atendido').length} atendidos`}
          />
        )}
        {vecinosCountQ.isLoading ? (
          <StatCardLoading label="Vecinos registrados" />
        ) : (
          <StatCard
            label="Vecinos registrados"
            value={vecinosCountQ.data ?? 0}
            hint="Padrón actual"
          />
        )}
        {mensajesMesQ.isLoading ? (
          <StatCardLoading label="Mensajes del mes" />
        ) : (
          <StatCard
            label="Mensajes del mes"
            value={mensajesMesQ.data ?? 0}
            hint="SMS + WhatsApp"
          />
        )}
        {denunciasAbQ.isLoading ? (
          <StatCardLoading label="Denuncias abiertas" />
        ) : (
          <StatCard
            label="Denuncias abiertas"
            value={denunciasAbQ.data ?? 0}
            hint="Sin resolver"
            accent={denunciasAbQ.data > 0 ? 'danger' : 'primary'}
          />
        )}
      </div>

      {/* Fila 2: Turnos del día + Actividad reciente */}
      <div className="grid gap-4 lg:grid-cols-2">
        <TurnosHoyCard turnos={turnosQ.data} isLoading={turnosQ.isLoading} />
        <ActividadRecienteCard
          noticias={noticiasQ.data}
          gastos={gastosRecientesQ.data}
          isLoading={noticiasQ.isLoading || gastosRecientesQ.isLoading}
        />
      </div>

      {/* Fila 3: Resumen financiero del mes */}
      <ResumenFinancieroCard
        ingresos={ingresosMesQ.data}
        gastos={gastosMesQ.data}
        presupuesto={presupuestoQ.data}
        isLoading={ingresosMesQ.isLoading || gastosMesQ.isLoading || presupuestoQ.isLoading}
      />
    </div>
  )
}
