import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useGastos, useIngresos, usePresupuesto, usePresupuestoPartidas,
  useCreateGasto, useUpdateGastoEstado, useCreateIngreso,
  useCreatePresupuestoPartida,
  currentMonthYYYYMM, currentYear, monthRange,
} from '../../hooks/useAdministracion'
import {
  usePartidasTipo, useOrdenesCompra, useUpdateOrdenEstado,
} from '../../hooks/useInventario'
import { useDependencias } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useAuth } from '../../context/AuthContext'
import Select from '../../components/ui/Select'
import Input from '../../components/ui/Input'
import StatCard from '../../components/ui/StatCard'
import Spinner from '../../components/ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import GastoFormModal from '../../components/admin/GastoFormModal'
import IngresoFormModal from '../../components/admin/IngresoFormModal'
import { dateOf } from '../../lib/datetime'

// =============================================================
// Administración Municipal — gastos, ingresos y presupuesto.
// 4 tabs: Dashboard | Gastos | Ingresos | Presupuesto.
// Paleta COMUNAS estricta (cero verde, OK/azul = #1D4ED8).
// =============================================================

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

// Secciones del módulo Administración. La página no renderiza una
// barra de tabs interna: la navegación viene del sidebar (Gestión
// Municipal → Administración) vía ?tab=. Acá solo necesitamos
// validar el valor de la URL y derivar la etiqueta para el
// breadcrumb del header.
const SECCIONES = [
  { value: 'dashboard',    label: 'Dashboard' },
  { value: 'solicitudes',  label: 'Solicitudes' },
  { value: 'gastos',       label: 'Gastos' },
  { value: 'ingresos',     label: 'Ingresos' },
  { value: 'presupuesto',  label: 'Presupuesto' },
  { value: 'partidas',     label: 'Partidas' },
]
const SECCION_LABEL = Object.fromEntries(SECCIONES.map(s => [s.value, s.label]))
const SECCION_VALORES = new Set(SECCIONES.map(s => s.value))

const FUENTES_PARTIDA = [
  { value: 'coparticipacion',   label: 'Coparticipación' },
  { value: 'recursos_propios',  label: 'Recursos propios' },
  { value: 'aportes_no_reint',  label: 'Aportes no reintegrables' },
  { value: 'tasas',             label: 'Tasas y servicios' },
  { value: 'otros',             label: 'Otros' },
]

const CATEGORIAS_GASTOS = [
  'Personal', 'Servicios', 'Insumos', 'Obras',
  'Mantenimiento', 'Combustible', 'Otros',
]

const ESTADOS_GASTOS = [
  { value: 'borrador',  label: 'Borrador',  className: 'estado-pendiente' },
  { value: 'aprobado',  label: 'Aprobado',  className: 'estado-confirmado' },
  { value: 'rechazado', label: 'Rechazado', className: 'estado-cancelado' },
]
const estadoLabel = Object.fromEntries(ESTADOS_GASTOS.map(e => [e.value, e.label]))
const estadoClass = Object.fromEntries(ESTADOS_GASTOS.map(e => [e.value, e.className]))

function sum(rows, key = 'monto') {
  return rows.reduce((a, r) => a + Number(r[key] ?? 0), 0)
}

// ─────────────────────────────────────────────────────────────────
// TAB 1 · Dashboard financiero
// ─────────────────────────────────────────────────────────────────

const MES_LABEL = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// Devuelve los últimos 6 meses como array de objetos {key:'YYYY-MM', label:'May 26'}
function last6Months(today = new Date()) {
  const out = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = d.getMonth()
    out.push({
      key: `${y}-${String(m + 1).padStart(2, '0')}`,
      label: `${MES_LABEL[m]} ${String(y).slice(2)}`,
    })
  }
  return out
}

function aggregateByMonth(rows, months) {
  // Suma `monto` de cada row al mes que corresponda. Las fechas son
  // 'date' (YYYY-MM-DD) — agrupamos por substring(0,7).
  const map = Object.fromEntries(months.map(m => [m.key, 0]))
  for (const r of rows) {
    const ym = (r.fecha ?? '').slice(0, 7)
    if (ym in map) map[ym] += Number(r.monto ?? 0)
  }
  return months.map(m => ({ ...m, total: map[m.key] }))
}

// Gráfico SVG inline — barras pareadas por mes (ingresos navy, gastos gold).
function BarChart({ ingresos, gastos }) {
  const months = ingresos.map((m, i) => ({
    label:    m.label,
    ingresos: m.total,
    gastos:   gastos[i].total,
  }))
  const max = Math.max(1, ...months.flatMap(m => [m.ingresos, m.gastos]))

  const W       = 720
  const H       = 240
  const PAD_X   = 28
  const PAD_TOP = 16
  const PAD_BOT = 32
  const groupW  = (W - PAD_X * 2) / months.length
  const barW    = Math.max(14, (groupW - 18) / 2)
  const chartH  = H - PAD_TOP - PAD_BOT

  return (
    <div className="card overflow-hidden p-0">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div>
          <h3 className="text-sm font-semibold text-primary">Ingresos vs gastos</h3>
          <p className="text-xs text-primary-400">Últimos 6 meses</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-sm bg-primary" /> Ingresos
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-3 rounded-sm bg-accent" /> Gastos
          </span>
        </div>
      </header>
      <div className="overflow-x-auto p-4">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block min-w-[640px] h-auto w-full"
          role="img"
          aria-label="Gráfico de barras: ingresos vs gastos por mes"
        >
          {/* Eje X */}
          <line x1={PAD_X} y1={H - PAD_BOT} x2={W - PAD_X} y2={H - PAD_BOT} stroke="#DDE0EC" strokeWidth="1" />
          {/* Bars + labels */}
          {months.map((m, i) => {
            const cx = PAD_X + groupW * i + groupW / 2
            const xIng = cx - barW - 4
            const xGas = cx + 4
            const hIng = (m.ingresos / max) * chartH
            const hGas = (m.gastos   / max) * chartH
            return (
              <g key={m.label}>
                {/* Bar ingresos (navy) */}
                <rect
                  x={xIng}
                  y={H - PAD_BOT - hIng}
                  width={barW}
                  height={hIng}
                  fill="#0F1C35"
                  rx="2"
                >
                  <title>{`${m.label} · Ingresos: ${fmtMoney.format(m.ingresos)}`}</title>
                </rect>
                {/* Bar gastos (gold) */}
                <rect
                  x={xGas}
                  y={H - PAD_BOT - hGas}
                  width={barW}
                  height={hGas}
                  fill="#C9A84C"
                  rx="2"
                >
                  <title>{`${m.label} · Gastos: ${fmtMoney.format(m.gastos)}`}</title>
                </rect>
                {/* Etiqueta del mes */}
                <text
                  x={cx}
                  y={H - PAD_BOT + 16}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="#475A7C"
                >
                  {m.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function DashboardTab({ municipioId }) {
  const today = useMemo(() => new Date(), [])
  const months = useMemo(() => last6Months(today), [today])
  const anio   = currentYear(today)
  const mes    = currentMonthYYYYMM(today)
  const { first: yearStart } = monthRange(`${anio}-01`)
  const { next: yearEnd   } = monthRange(`${anio}-12`)

  // Gastos e ingresos del año en curso (suficiente para KPIs y chart).
  const opts = { municipioIdOverride: municipioId }
  const gastosQ   = useGastos({   fechaFrom: yearStart, fechaTo: yearEnd }, opts)
  const ingresosQ = useIngresos({ fechaFrom: yearStart, fechaTo: yearEnd }, opts)
  const presQ     = usePresupuesto(anio, opts)

  const gastos      = gastosQ.data   ?? []
  const ingresos    = ingresosQ.data ?? []
  const presupuesto = presQ.data     ?? []
  const isLoading   = gastosQ.isLoading || ingresosQ.isLoading || presQ.isLoading

  // KPIs del mes actual.
  const { first: monthStart, next: monthEnd } = monthRange(mes)
  const inMes  = (r) => r.fecha >= monthStart && r.fecha < monthEnd
  const ingresosMes = ingresos.filter(inMes)
  const gastosMes   = gastos.filter(inMes)
  const totalIngMes = sum(ingresosMes)
  const totalGasMes = sum(gastosMes)
  const saldoMes    = totalIngMes - totalGasMes

  // % ejecución presupuestaria YTD (gastos aprobados / presupuesto anual).
  const presupuestoTotal = sum(presupuesto, 'monto_asignado')
  const gastadoYTD       = sum(gastos.filter(g => g.estado === 'aprobado'))
  const pctEjecucion     = presupuestoTotal > 0
    ? Math.round((gastadoYTD / presupuestoTotal) * 100)
    : 0

  // Series mensuales para el chart.
  const ingPorMes = aggregateByMonth(ingresos, months)
  const gasPorMes = aggregateByMonth(gastos,   months)

  // Alerta: saldo del mes < 20% del mayor ingreso individual del mes.
  const mayorIngresoMes = ingresosMes.reduce((mx, r) => Math.max(mx, Number(r.monto ?? 0)), 0)
  const showAlerta = mayorIngresoMes > 0 && saldoMes < 0.2 * mayorIngresoMes

  if (isLoading) {
    return <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
  }
  if (!municipioId) {
    return (
      <div className="card p-6 text-sm text-primary-500">
        Tu usuario no tiene un municipio asignado. Pedile al administrador que lo configure.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ingresos del mes"
          value={fmtMoney.format(totalIngMes)}
          hint={`${ingresosMes.length} registro${ingresosMes.length === 1 ? '' : 's'}`}
          accent="ok"
        />
        <StatCard
          label="Gastos del mes"
          value={fmtMoney.format(totalGasMes)}
          hint={`${gastosMes.length} registro${gastosMes.length === 1 ? '' : 's'}`}
          accent="accent"
        />
        <StatCard
          label="Saldo del mes"
          value={fmtMoney.format(saldoMes)}
          hint={saldoMes >= 0 ? 'Superávit' : 'Déficit'}
          accent={saldoMes >= 0 ? 'primary' : 'danger'}
        />
        <StatCard
          label="% ejecución anual"
          value={`${pctEjecucion}%`}
          hint={`${fmtMoney.format(gastadoYTD)} / ${fmtMoney.format(presupuestoTotal)}`}
          accent={pctEjecucion > 90 ? 'danger' : pctEjecucion > 70 ? 'accent' : 'primary'}
        />
      </div>

      {showAlerta && (
        <div className="rounded-xl border border-accent-200 bg-accent-50 p-4">
          <div className="flex items-start gap-3">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 h-5 w-5 shrink-0 text-accent-700" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-accent-700">
                Saldo del mes bajo
              </p>
              <p className="mt-1 text-xs text-accent-700/90 sm:text-sm">
                El saldo del mes ({fmtMoney.format(saldoMes)}) es menor al 20% del mayor
                ingreso individual del período ({fmtMoney.format(mayorIngresoMes)}).
                Revisá el flujo de caja antes de aprobar nuevos gastos.
              </p>
            </div>
          </div>
        </div>
      )}

      <BarChart ingresos={ingPorMes} gastos={gasPorMes} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 2 · Gastos
// ─────────────────────────────────────────────────────────────────

function GastoEstadoBadge({ estado }) {
  return (
    <span className={estadoClass[estado] ?? 'estado-pendiente'}>
      {estadoLabel[estado] ?? estado}
    </span>
  )
}

function GastosTab({ municipioId, dependencias, canApprove }) {
  const [mes, setMes]                   = useState(currentMonthYYYYMM())
  const [categoria, setCategoria]       = useState('')
  const [dependenciaId, setDependenciaId] = useState('')
  const [estado, setEstado]             = useState('')
  const [modalOpen, setModalOpen]       = useState(false)

  const filters = {
    mes:           mes || undefined,
    categoria:     categoria || undefined,
    dependenciaId: dependenciaId || undefined,
    estado:        estado || undefined,
  }
  const gastosQ      = useGastos(filters, { municipioIdOverride: municipioId })
  const createMut    = useCreateGasto()
  const updateEstMut = useUpdateGastoEstado()
  const gastos       = gastosQ.data ?? []

  async function handleCreate(data) {
    if (!municipioId) throw new Error('No hay municipio asignado.')
    await createMut.mutateAsync({ ...data, municipio_id: municipioId })
  }
  async function handleEstado(id, est) {
    await updateEstMut.mutateAsync({ id, estado: est })
  }

  const total = sum(gastos)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label="Mes"
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="min-w-[150px]"
          />
          <Select
            label="Categoría"
            value={categoria}
            onChange={setCategoria}
            placeholder="Todas"
            options={CATEGORIAS_GASTOS.map(c => ({ value: c, label: c }))}
          />
          <Select
            label="Dependencia"
            value={dependenciaId}
            onChange={setDependenciaId}
            placeholder="Todas"
            options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
          />
          <Select
            label="Estado"
            value={estado}
            onChange={setEstado}
            placeholder="Todos"
            options={ESTADOS_GASTOS.map(e => ({ value: e.value, label: e.label }))}
          />
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="btn-primary self-end"
        >
          + Cargar gasto
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-primary-50 px-4 py-3 text-sm">
        <span className="font-medium text-primary-700">
          {gastos.length} registro{gastos.length === 1 ? '' : 's'}
        </span>
        <span className="font-semibold text-primary">
          Total: {fmtMoney.format(total)}
        </span>
      </div>

      {gastosQ.isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : gastos.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay gastos con esos filtros.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Fecha</Th>
              <Th>Descripción</Th>
              <Th>Categoría</Th>
              <Th>Dependencia</Th>
              <Th className="text-right">Monto</Th>
              <Th>Estado</Th>
              <Th className="text-center">Comprob.</Th>
              {canApprove && <Th className="text-right">Acciones</Th>}
            </Tr>
          </THead>
          <tbody>
            {gastos.map(g => (
              <Tr key={g.id}>
                <Td className="whitespace-nowrap">{dateOf(g.fecha)}</Td>
                <Td>{g.descripcion}</Td>
                <Td>{g.categoria || '—'}</Td>
                <Td>{g.dependencia?.nombre ?? '—'}</Td>
                <Td className="whitespace-nowrap text-right font-semibold">
                  {fmtMoney.format(g.monto)}
                </Td>
                <Td><GastoEstadoBadge estado={g.estado} /></Td>
                <Td className="text-center">
                  {g.comprobante_url ? (
                    <a
                      href={g.comprobante_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-primary-500 hover:text-primary"
                      title="Ver comprobante"
                      aria-label="Ver comprobante"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.49" />
                      </svg>
                    </a>
                  ) : <span className="text-primary-300">—</span>}
                </Td>
                {canApprove && (
                  <Td className="whitespace-nowrap text-right text-xs">
                    {g.estado === 'borrador' && (
                      <div className="flex justify-end gap-3 font-medium">
                        <button onClick={() => handleEstado(g.id, 'aprobado')} className="text-ok-700 hover:underline">
                          Aprobar
                        </button>
                        <button onClick={() => handleEstado(g.id, 'rechazado')} className="text-danger hover:underline">
                          Rechazar
                        </button>
                      </div>
                    )}
                    {g.estado === 'aprobado' && (
                      <button onClick={() => handleEstado(g.id, 'borrador')} className="font-medium text-primary-500 hover:underline">
                        Volver a borrador
                      </button>
                    )}
                    {g.estado === 'rechazado' && (
                      <button onClick={() => handleEstado(g.id, 'borrador')} className="font-medium text-primary-500 hover:underline">
                        Reabrir
                      </button>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <GastoFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleCreate}
        dependencias={dependencias}
        saving={createMut.isPending}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 3 · Ingresos
// ─────────────────────────────────────────────────────────────────

function IngresosTab({ municipioId }) {
  const [mes, setMes]             = useState(currentMonthYYYYMM())
  const [modalOpen, setModalOpen] = useState(false)

  const ingresosQ = useIngresos({ mes: mes || undefined }, { municipioIdOverride: municipioId })
  const createMut = useCreateIngreso()
  const ingresos  = ingresosQ.data ?? []

  async function handleCreate(data) {
    if (!municipioId) throw new Error('No hay municipio asignado.')
    await createMut.mutateAsync({ ...data, municipio_id: municipioId })
  }

  const total = sum(ingresos)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Input
          label="Mes"
          type="month"
          value={mes}
          onChange={e => setMes(e.target.value)}
          className="min-w-[150px]"
        />
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="btn-primary self-end"
        >
          + Registrar ingreso
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ok-100 bg-ok-50 px-4 py-3 text-sm">
        <span className="font-medium text-ok-700">
          {ingresos.length} registro{ingresos.length === 1 ? '' : 's'} en el mes
        </span>
        <span className="font-bold text-ok-700">
          Total del mes: {fmtMoney.format(total)}
        </span>
      </div>

      {ingresosQ.isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : ingresos.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay ingresos cargados en este mes.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Fecha</Th>
              <Th>Origen</Th>
              <Th>Descripción</Th>
              <Th className="text-right">Monto</Th>
            </Tr>
          </THead>
          <tbody>
            {ingresos.map(r => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap">{dateOf(r.fecha)}</Td>
                <Td>{r.origen || '—'}</Td>
                <Td>{r.descripcion}</Td>
                <Td className="whitespace-nowrap text-right font-semibold">
                  {fmtMoney.format(r.monto)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <IngresoFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleCreate}
        saving={createMut.isPending}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 4 · Presupuesto
// ─────────────────────────────────────────────────────────────────

function ProgressBar({ pct }) {
  // Cero verde — < 70% azul OK, 70-90% gold, > 90% rojo danger.
  const clamped = Math.max(0, Math.min(100, pct))
  const bg = pct > 90 ? 'bg-danger' : pct > 70 ? 'bg-accent' : 'bg-ok'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-primary-50">
      <div className={`h-full ${bg}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

function PresupuestoTab({ municipioId }) {
  const anio = currentYear()
  const opts = { municipioIdOverride: municipioId }
  const presQ   = usePresupuesto(anio, opts)
  const { first: yearStart } = monthRange(`${anio}-01`)
  const { next: yearEnd  }   = monthRange(`${anio}-12`)
  const gastosQ = useGastos({ fechaFrom: yearStart, fechaTo: yearEnd, estado: 'aprobado' }, opts)

  // Para cada presupuesto, sumamos los gastos aprobados de su dependencia.
  // Tomamos las refs originales (presQ.data / gastosQ.data) en deps —
  // si las cubrimos con `?? []` por fuera generaríamos arrays nuevos
  // cada render y romperíamos la memoización.
  const rows = useMemo(() => {
    const presupuesto = presQ.data   ?? []
    const gastosAprob = gastosQ.data ?? []
    const gastoPorDep = new Map()
    for (const g of gastosAprob) {
      const k = g.dependencia_id
      if (!k) continue
      gastoPorDep.set(k, (gastoPorDep.get(k) ?? 0) + Number(g.monto ?? 0))
    }
    return presupuesto.map(p => {
      const gastado    = gastoPorDep.get(p.dependencia_id) ?? 0
      const disponible = Number(p.monto_asignado ?? 0) - gastado
      const pct        = p.monto_asignado > 0
        ? Math.round((gastado / Number(p.monto_asignado)) * 100)
        : 0
      return {
        id:            p.id,
        dependencia:   p.dependencia?.nombre ?? '—',
        monto_asignado:   Number(p.monto_asignado ?? 0),
        gastado,
        disponible,
        pct,
      }
    })
  }, [presQ.data, gastosQ.data])

  const totalAnual      = sum(rows, 'monto_asignado')
  const totalGastado    = sum(rows, 'gastado')
  const totalDisponible = totalAnual - totalGastado
  const totalPct        = totalAnual > 0 ? Math.round((totalGastado / totalAnual) * 100) : 0

  const isLoading = presQ.isLoading || gastosQ.isLoading

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-bold text-primary">Presupuesto {anio}</h2>
        <p className="text-sm text-primary-400">
          El "gastado" se calcula en tiempo real desde los gastos en estado <strong>aprobado</strong>.
        </p>
      </header>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay presupuesto cargado para {anio}.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Dependencia</Th>
              <Th className="text-right">Presupuesto anual</Th>
              <Th className="text-right">Gastado</Th>
              <Th className="text-right">Disponible</Th>
              <Th className="min-w-[180px]">% ejecución</Th>
            </Tr>
          </THead>
          <tbody>
            {rows.map(r => (
              <Tr key={r.id}>
                <Td className="font-medium text-primary">{r.dependencia}</Td>
                <Td className="whitespace-nowrap text-right">{fmtMoney.format(r.monto_asignado)}</Td>
                <Td className="whitespace-nowrap text-right font-semibold">{fmtMoney.format(r.gastado)}</Td>
                <Td className={`whitespace-nowrap text-right font-semibold ${r.disponible < 0 ? 'text-danger' : 'text-primary-700'}`}>
                  {fmtMoney.format(r.disponible)}
                </Td>
                <Td>
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs font-medium text-primary-500">
                      <span>{r.pct}%</span>
                    </div>
                    <ProgressBar pct={r.pct} />
                  </div>
                </Td>
              </Tr>
            ))}
            <Tr className="bg-primary-50/60 font-semibold">
              <Td className="font-bold text-primary">Total</Td>
              <Td className="whitespace-nowrap text-right">{fmtMoney.format(totalAnual)}</Td>
              <Td className="whitespace-nowrap text-right">{fmtMoney.format(totalGastado)}</Td>
              <Td className={`whitespace-nowrap text-right ${totalDisponible < 0 ? 'text-danger' : 'text-primary-700'}`}>
                {fmtMoney.format(totalDisponible)}
              </Td>
              <Td>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-primary-500">
                    <span>{totalPct}%</span>
                  </div>
                  <ProgressBar pct={totalPct} />
                </div>
              </Td>
            </Tr>
          </tbody>
        </Table>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 5 · Partidas (presupuesto fino por dependencia × partida)
// ─────────────────────────────────────────────────────────────────

function PartidasTab({ municipioId, dependencias }) {
  const anio = currentYear()
  const opts = { municipioIdOverride: municipioId }
  const partQ   = usePresupuestoPartidas(anio, opts)
  const tipoQ   = usePartidasTipo()
  const { first: yearStart } = monthRange(`${anio}-01`)
  const { next: yearEnd  }   = monthRange(`${anio}-12`)
  const gastosQ = useGastos({ fechaFrom: yearStart, fechaTo: yearEnd, estado: 'aprobado' }, opts)

  const [modalNew, setModalNew] = useState(false)
  const createMut = useCreatePresupuestoPartida()

  // Agrupamos por dependencia para que la tabla muestre las partidas
  // bajo cada dependencia. El "ejecutado" se calcula por dependencia
  // (no por partida) — los `gastos` no llevan partida_codigo en este
  // schema; se prorratea por suma total de la dependencia.
  const grupos = useMemo(() => {
    const partidas = partQ.data ?? []
    const gastosAprob = gastosQ.data ?? []
    const partidasNombre = Object.fromEntries((tipoQ.data ?? []).map(p => [p.codigo, p.nombre]))
    const gastoPorDep = new Map()
    for (const g of gastosAprob) {
      const k = g.dependencia_id
      if (!k) continue
      gastoPorDep.set(k, (gastoPorDep.get(k) ?? 0) + Number(g.monto ?? 0))
    }
    const porDep = new Map()
    for (const p of partidas) {
      const k = p.dependencia_id ?? '__sin__'
      if (!porDep.has(k)) {
        porDep.set(k, {
          dependencia_id: p.dependencia_id,
          dependencia:    p.dependencia?.nombre ?? '—',
          asignadoTotal:  0,
          ejecutadoTotal: gastoPorDep.get(p.dependencia_id) ?? 0,
          partidas:       [],
        })
      }
      const g = porDep.get(k)
      g.asignadoTotal += Number(p.monto_asignado ?? 0)
      g.partidas.push({
        ...p,
        partida_label: partidasNombre[p.partida_codigo] ?? p.partida_codigo,
      })
    }
    return Array.from(porDep.values())
  }, [partQ.data, gastosQ.data, tipoQ.data])

  const totalAsignado  = grupos.reduce((s, g) => s + g.asignadoTotal, 0)
  const totalEjecutado = grupos.reduce((s, g) => s + g.ejecutadoTotal, 0)
  const totalPct       = totalAsignado > 0
    ? Math.round((totalEjecutado / totalAsignado) * 100)
    : 0

  const isLoading = partQ.isLoading || gastosQ.isLoading || tipoQ.isLoading

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary">Presupuesto por partidas {anio}</h2>
          <p className="text-sm text-primary-400">
            Asignación fina de partidas por dependencia y fuente — alineado con la rendición provincial (SARC).
          </p>
        </div>
        <Button onClick={() => setModalNew(true)}>+ Asignar partida</Button>
      </header>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : grupos.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay partidas asignadas para {anio}.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Dependencia</Th>
              <Th>Partida</Th>
              <Th>Fuente</Th>
              <Th className="text-right">Asignado</Th>
              <Th className="text-right">Ejecutado (dep.)</Th>
              <Th className="text-right">Disponible</Th>
              <Th className="min-w-[160px]">% ejecución</Th>
            </Tr>
          </THead>
          <tbody>
            {grupos.map(g => {
              const disponible = g.asignadoTotal - g.ejecutadoTotal
              const pct = g.asignadoTotal > 0
                ? Math.round((g.ejecutadoTotal / g.asignadoTotal) * 100)
                : 0
              return [
                <Tr key={`${g.dependencia_id}-head`} className="bg-primary-50/40 font-semibold">
                  <Td className="font-bold text-primary" colSpan={3}>{g.dependencia}</Td>
                  <Td className="whitespace-nowrap text-right">{fmtMoney.format(g.asignadoTotal)}</Td>
                  <Td className="whitespace-nowrap text-right">{fmtMoney.format(g.ejecutadoTotal)}</Td>
                  <Td className={`whitespace-nowrap text-right ${disponible < 0 ? 'text-danger' : 'text-primary-700'}`}>
                    {fmtMoney.format(disponible)}
                  </Td>
                  <Td>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-primary-500">{pct}%</div>
                      <ProgressBar pct={pct} />
                    </div>
                  </Td>
                </Tr>,
                ...g.partidas.map(p => (
                  <Tr key={p.id}>
                    <Td className="text-primary-400">↳</Td>
                    <Td className="font-mono text-xs">{p.partida_codigo} — {p.partida_label}</Td>
                    <Td className="text-xs">
                      {FUENTES_PARTIDA.find(f => f.value === p.fuente)?.label ?? (p.fuente || '—')}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{fmtMoney.format(p.monto_asignado)}</Td>
                    <Td colSpan={3} className="text-primary-300" />
                  </Tr>
                )),
              ]
            }).flat()}
            <Tr className="bg-primary-50/60 font-bold">
              <Td className="font-bold text-primary" colSpan={3}>Total</Td>
              <Td className="whitespace-nowrap text-right">{fmtMoney.format(totalAsignado)}</Td>
              <Td className="whitespace-nowrap text-right">{fmtMoney.format(totalEjecutado)}</Td>
              <Td className={`whitespace-nowrap text-right ${(totalAsignado - totalEjecutado) < 0 ? 'text-danger' : 'text-primary-700'}`}>
                {fmtMoney.format(totalAsignado - totalEjecutado)}
              </Td>
              <Td>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-primary-500">{totalPct}%</div>
                  <ProgressBar pct={totalPct} />
                </div>
              </Td>
            </Tr>
          </tbody>
        </Table>
      )}

      {modalNew && (
        <PartidaFormModal
          municipioId={municipioId}
          dependencias={dependencias}
          partidasTipo={tipoQ.data ?? []}
          anioDefault={anio}
          onClose={() => setModalNew(false)}
          onSave={async (data) => {
            await createMut.mutateAsync({ ...data, municipio_id: municipioId })
            setModalNew(false)
          }}
          saving={createMut.isPending}
        />
      )}
    </div>
  )
}

function PartidaFormModal({ dependencias, partidasTipo, anioDefault, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    dependencia_id: '', partida_codigo: '', fuente: '',
    monto_asignado: '', anio: anioDefault,
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const canSubmit =
    !!form.dependencia_id && !!form.partida_codigo && !!form.fuente &&
    Number(form.monto_asignado) > 0 && !!form.anio

  async function handle() {
    setError('')
    try {
      await onSave({
        dependencia_id: form.dependencia_id,
        partida_codigo: form.partida_codigo,
        fuente:         form.fuente,
        monto_asignado: Number(form.monto_asignado),
        anio:           Number(form.anio),
      })
    } catch (e) { setError(e?.message ?? 'No pudimos guardar') }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title="Asignar partida presupuestaria"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handle} loading={saving} disabled={!canSubmit}>Guardar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Dependencia" value={form.dependencia_id} onChange={v => set('dependencia_id', v)}
          placeholder="Seleccionar..."
          options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
        />
        <Select
          label="Partida" value={form.partida_codigo} onChange={v => set('partida_codigo', v)}
          placeholder="Seleccionar..."
          options={partidasTipo.map(p => ({ value: p.codigo, label: `${p.codigo} — ${p.nombre}` }))}
        />
        <Select
          label="Fuente" value={form.fuente} onChange={v => set('fuente', v)}
          placeholder="Seleccionar..."
          options={FUENTES_PARTIDA}
        />
        <Input
          label="Monto asignado" type="number" min="0" step="0.01"
          value={form.monto_asignado} onChange={e => set('monto_asignado', e.target.value)}
          required
        />
        <Input
          label="Año" type="number" min="2000" max="2099"
          value={form.anio} onChange={e => set('anio', e.target.value)}
          required
        />
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB · Solicitudes (cola de aprobación de órdenes de compra)
// ─────────────────────────────────────────────────────────────────

const OC_ESTADO_BADGE_ADMIN = {
  pendiente: { label: 'Pendiente', cls: 'estado-pendiente' },
  aprobada:  { label: 'Aprobada',  cls: 'estado-confirmado' },
  rechazada: { label: 'Rechazada', cls: 'estado-cancelado' },
}

function SolicitudesTab({ municipioId, dependencias, canApprove }) {
  const [dependenciaId, setDependenciaId] = useState('')
  // Default 'pendiente' — esta pantalla es la cola de aprobación.
  // El usuario puede cambiar el filtro para ver el historial.
  const [estado, setEstado] = useState('pendiente')

  const { data: ordenes = [], isLoading } = useOrdenesCompra({
    dependenciaId: dependenciaId || undefined,
    estado:        estado        || undefined,
  }, { municipioIdOverride: municipioId })

  const updateEst = useUpdateOrdenEstado()

  const total = ordenes.reduce((acc, o) => acc + Number(o.monto_total ?? 0), 0)
  const pendientes = ordenes.filter(o => o.estado === 'pendiente')

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary">
            Solicitudes de las dependencias
          </h2>
          <p className="text-sm text-primary-400">
            Las solicitudes enviadas por cada dependencia llegan acá. Al aprobar,
            el gasto se crea (o se promueve) automáticamente.
          </p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Pendientes"
          value={pendientes.length}
          accent={pendientes.length > 0 ? 'accent' : 'primary'}
        />
        <StatCard
          label="Monto en cola"
          value={fmtMoney.format(pendientes.reduce((a, o) => a + Number(o.monto_total ?? 0), 0))}
          accent="primary"
        />
        <StatCard
          label="Total filtrado"
          value={fmtMoney.format(total)}
          accent="accent"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Select
          label="Dependencia" value={dependenciaId} onChange={setDependenciaId}
          placeholder="Todas"
          options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
        />
        <Select
          label="Estado" value={estado} onChange={setEstado}
          placeholder="Todos"
          options={Object.entries(OC_ESTADO_BADGE_ADMIN).map(([v, b]) => ({ value: v, label: b.label }))}
        />
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : ordenes.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          {estado === 'pendiente'
            ? 'No hay solicitudes pendientes — todo aprobado.'
            : 'No hay solicitudes con estos filtros.'}
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>N°</Th>
              <Th>Dependencia</Th>
              <Th>Proveedor</Th>
              <Th>Descripción</Th>
              <Th className="text-right">Monto</Th>
              <Th>Partida</Th>
              <Th>Tipo</Th>
              <Th>Estado</Th>
              <Th>Fecha</Th>
              {canApprove && <Th className="text-right">Acciones</Th>}
            </Tr>
          </THead>
          <tbody>
            {ordenes.map(o => {
              const badge = OC_ESTADO_BADGE_ADMIN[o.estado] ?? { label: o.estado, cls: 'estado-pendiente' }
              return (
                <Tr key={o.id}>
                  <Td className="font-mono text-xs">{o.numero ?? `OC-${o.id.slice(0, 6)}`}</Td>
                  <Td>{o.dependencia?.nombre ?? '—'}</Td>
                  <Td className="font-medium text-primary">{o.proveedor ?? '—'}</Td>
                  <Td className="max-w-[260px] truncate" title={o.descripcion ?? ''}>{o.descripcion ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-right font-semibold tabular-nums">
                    {fmtMoney.format(o.monto_total ?? 0)}
                  </Td>
                  <Td className="font-mono text-xs">{o.partida_codigo ?? '—'}</Td>
                  <Td className="text-xs">{o.tipo === 'cotizacion' ? 'Cotización' : 'Directa'}</Td>
                  <Td><span className={badge.cls}>{badge.label}</span></Td>
                  <Td className="whitespace-nowrap">{o.fecha ? dateOf(o.fecha) : '—'}</Td>
                  {canApprove && (
                    <Td className="whitespace-nowrap text-right text-xs">
                      {o.estado === 'pendiente' && (
                        <div className="flex justify-end gap-3 font-medium">
                          <button
                            onClick={() => updateEst.mutate({ id: o.id, estado: 'aprobada' })}
                            className="text-ok-700 hover:underline"
                          >Aprobar</button>
                          <button
                            onClick={() => updateEst.mutate({ id: o.id, estado: 'rechazada' })}
                            className="text-danger hover:underline"
                          >Rechazar</button>
                        </div>
                      )}
                      {o.comprobante_url && (
                        <a
                          href={o.comprobante_url} target="_blank" rel="noopener noreferrer"
                          className="ml-2 text-primary-500 hover:underline"
                        >Comprob.</a>
                      )}
                    </Td>
                  )}
                </Tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function Administracion() {
  const { hasRole } = useAuth()
  // useEffectiveMunicipioId resuelve el municipio destino — el del
  // perfil para admin_comuna/operador, o el primer municipio activo
  // como fallback para superadmin (perfil.municipio_id null).
  const municipioId = useEffectiveMunicipioId()
  const canApprove  = hasRole(['admin_comuna', 'superadmin'])

  // Lectura del ?tab= desde URL. Sin escritura: la navegación
  // entre sub-secciones viene del sidebar (Gestión Municipal →
  // Administración). Default 'dashboard' si no hay ?tab o si el
  // valor no está en el catálogo.
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') || ''
  const seccion  = SECCION_VALORES.has(tabParam) ? tabParam : 'dashboard'
  const { data: dependencias = [] } = useDependencias()

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Administración municipal</h1>
        <p className="mt-1 text-sm text-primary-500">
          <span className="text-primary-400">Administración municipal</span>
          <span className="mx-1.5 text-primary-300">›</span>
          <span className="font-medium text-primary-700">{SECCION_LABEL[seccion] ?? '—'}</span>
        </p>
      </header>

      {!municipioId && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">
          No encontramos un municipio asignado ni un municipio activo de fallback.
          Pedile al administrador que configure al menos un municipio.
        </div>
      )}

      <div>
        {seccion === 'dashboard'   && <DashboardTab municipioId={municipioId} />}
        {seccion === 'solicitudes' && <SolicitudesTab municipioId={municipioId} dependencias={dependencias} canApprove={canApprove} />}
        {seccion === 'gastos'      && <GastosTab municipioId={municipioId} dependencias={dependencias} canApprove={canApprove} />}
        {seccion === 'ingresos'    && <IngresosTab municipioId={municipioId} />}
        {seccion === 'presupuesto' && <PresupuestoTab municipioId={municipioId} />}
        {seccion === 'partidas'    && <PartidasTab municipioId={municipioId} dependencias={dependencias} />}
      </div>
    </div>
  )
}
