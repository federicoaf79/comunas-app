import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDependencias } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useAuth } from '../../context/AuthContext'
import {
  useSumReservas, useCreateSumReserva, useUpdateSumReservaEstado,
} from '../../hooks/useSumReservas'
import { currentMonthYYYYMM } from '../../hooks/useAdministracion'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import SumReservaFormModal from '../../components/admin/SumReservaFormModal'
import AdministracionTab from '../../components/admin/AdministracionTab'
import { dateOf } from '../../lib/datetime'

// =============================================================
// SUM — Salón de Usos Múltiples.
// 3 tabs: Reservas | Calendario mensual | Tarifas.
// =============================================================

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

// Etiqueta de sección activa para el breadcrumb. Sin barra de tabs:
// la navegación se hace desde el sidebar (AdminLayout NavGroup).
const SECCION_LABEL = {
  reservas:       'Reservas',
  administracion: 'Administración',
}

const ESTADOS_OPTS = [
  { value: 'pendiente',  label: 'Pendientes' },
  { value: 'aprobada',   label: 'Aprobadas' },
  { value: 'rechazada',  label: 'Rechazadas' },
  { value: 'cancelada',  label: 'Canceladas' },
  { value: 'realizada',  label: 'Realizadas' },
]
const ESTADO_LABEL = Object.fromEntries(ESTADOS_OPTS.map(e => [e.value, e.label.replace(/s$/, '')]))
const ESTADO_CLASS = {
  pendiente: 'estado-pendiente',
  aprobada:  'estado-confirmado',
  rechazada: 'estado-cancelado',
  cancelada: 'estado-cancelado',
  realizada: 'estado-completado',
}

function vecinoNombre(v) {
  if (!v) return 'Solicitante'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Solicitante'
}

function horarioLabel(hi, hf) {
  const a = (hi ?? '').slice(0, 5)
  const b = (hf ?? '').slice(0, 5)
  if (!a && !b) return '—'
  return `${a} – ${b}`
}

// ─────────────────────────────────────────────────────────────────
// TAB 1 · Reservas
// ─────────────────────────────────────────────────────────────────

function ReservasTab({ depSum, canApprove }) {
  const [mes, setMes]       = useState(currentMonthYYYYMM())
  const [estado, setEstado] = useState('')
  const [modalOpen, setModalOpen] = useState(false)

  const reservasQ = useSumReservas({ mes: mes || undefined, estado: estado || undefined })
  const createMut = useCreateSumReserva()
  const updateEstMut = useUpdateSumReservaEstado()

  const reservas = reservasQ.data ?? []
  const totalCosto = reservas.reduce((a, r) => a + Number(r.costo ?? 0), 0)

  async function handleCreate(payload) {
    await createMut.mutateAsync(payload)
  }
  async function handleEstado(id, est) {
    await updateEstMut.mutateAsync({ id, estado: est })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <Input
            label="Mes"
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="min-w-[160px]"
          />
          <Select
            label="Estado"
            value={estado}
            onChange={setEstado}
            placeholder="Todos"
            options={ESTADOS_OPTS}
            className="min-w-[180px]"
          />
        </div>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="btn-primary self-end"
        >
          + Nueva reserva
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-primary-50 px-4 py-3 text-sm">
        <span className="font-medium text-primary-700">
          {reservas.length} reserva{reservas.length === 1 ? '' : 's'}
        </span>
        <span className="font-semibold text-primary">
          Costo total: {fmtMoney.format(totalCosto)}
        </span>
      </div>

      {reservasQ.isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : reservas.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay reservas con esos filtros.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Fecha</Th>
              <Th>Horario</Th>
              <Th>Solicitante</Th>
              <Th>Motivo</Th>
              <Th className="text-right">Costo</Th>
              <Th>Estado</Th>
              {canApprove && <Th className="text-right">Acciones</Th>}
            </Tr>
          </THead>
          <tbody>
            {reservas.map(r => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap">{dateOf(r.fecha)}</Td>
                <Td className="whitespace-nowrap">{horarioLabel(r.hora_inicio, r.hora_fin)}</Td>
                <Td>
                  <p className="font-medium text-primary">{vecinoNombre(r.vecino)}</p>
                  {r.vecino?.dni && (
                    <p className="text-xs text-primary-400">DNI {r.vecino.dni}</p>
                  )}
                </Td>
                <Td className="max-w-xs">
                  <span className="line-clamp-2">{r.motivo || '—'}</span>
                </Td>
                <Td className="whitespace-nowrap text-right font-semibold">
                  {fmtMoney.format(r.costo ?? 0)}
                </Td>
                <Td>
                  <span className={ESTADO_CLASS[r.estado] ?? 'estado-pendiente'}>
                    {ESTADO_LABEL[r.estado] ?? r.estado}
                  </span>
                </Td>
                {canApprove && (
                  <Td className="whitespace-nowrap text-right text-xs font-medium">
                    {r.estado === 'pendiente' && (
                      <div className="flex justify-end gap-3">
                        <button onClick={() => handleEstado(r.id, 'aprobada')}  className="text-ok-700 hover:underline">Aprobar</button>
                        <button onClick={() => handleEstado(r.id, 'rechazada')} className="text-danger hover:underline">Rechazar</button>
                      </div>
                    )}
                    {r.estado === 'aprobada' && (
                      <button onClick={() => handleEstado(r.id, 'realizada')} className="text-primary-500 hover:underline">
                        Marcar realizada
                      </button>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <SumReservaFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleCreate}
        dependencia={depSum}
        saving={createMut.isPending}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 2 · Calendario mensual
// ─────────────────────────────────────────────────────────────────

const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function MonthCalendar({ year, month, reservasByDate }) {
  // Grilla 6×7 que cubre el mes. Lunes-primera (semana europea/AR).
  const first = new Date(year, month, 1)
  const startDay = (first.getDay() + 6) % 7  // 0 = Lun ... 6 = Dom
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < startDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(d)
  }
  while (cells.length % 7 !== 0) cells.push(null)

  function ymd(d) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="grid grid-cols-7 border-b border-border bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary">
        {DOW_LABELS.map(l => (
          <div key={l} className="border-r border-border px-2 py-2 text-center last:border-r-0">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const occupants = d != null ? (reservasByDate.get(ymd(d)) ?? []) : []
          const ocupado = occupants.length > 0
          const tooltip = occupants
            .map(r => `${vecinoNombre(r.vecino)} · ${horarioLabel(r.hora_inicio, r.hora_fin)} · ${r.motivo || ''}`)
            .join('\n')
          return (
            <div
              key={i}
              title={tooltip}
              className={
                'min-h-[88px] border-b border-r border-border p-2 text-xs last:border-r-0 ' +
                (d == null ? 'bg-primary-50/40' : ocupado ? 'bg-accent-50' : 'bg-white')
              }
            >
              {d != null && (
                <>
                  <div className="flex items-center justify-between">
                    <span className={'text-sm font-bold ' + (ocupado ? 'text-primary' : 'text-primary-700')}>
                      {d}
                    </span>
                    {ocupado && (
                      <span className="inline-flex items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-primary-900">
                        {occupants.length}
                      </span>
                    )}
                  </div>
                  {ocupado && (
                    <ul className="mt-1 space-y-0.5">
                      {occupants.slice(0, 2).map(r => (
                        <li key={r.id} className="truncate text-[10px] font-medium text-primary-700">
                          {(r.hora_inicio ?? '').slice(0, 5)} · {vecinoNombre(r.vecino).split(',')[0]}
                        </li>
                      ))}
                      {occupants.length > 2 && (
                        <li className="text-[10px] italic text-primary-400">+{occupants.length - 2} más</li>
                      )}
                    </ul>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalendarioTab() {
  const today = useMemo(() => new Date(), [])
  const [year, setYear]   = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())

  const mesYYYYMM = `${year}-${String(month + 1).padStart(2, '0')}`
  const reservasQ = useSumReservas({ mes: mesYYYYMM })

  // Agrupamos por fecha (YYYY-MM-DD). Tomamos la ref original
  // (reservasQ.data) en deps para no romper la memoización con un
  // `?? []` por fuera que crearía arrays nuevos en cada render.
  const reservasByDate = useMemo(() => {
    const map = new Map()
    for (const r of (reservasQ.data ?? [])) {
      if (!r.fecha) continue
      if (!map.has(r.fecha)) map.set(r.fecha, [])
      map.get(r.fecha).push(r)
    }
    return map
  }, [reservasQ.data])

  function goPrev() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1)
  }
  function goNext() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1)
  }
  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
  }

  const monthName = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' })
    .format(new Date(year, month, 1))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-semibold capitalize text-primary">{monthName}</p>
        <div className="inline-flex gap-2">
          <button onClick={goPrev}  className="btn-secondary px-3 py-1.5 text-xs">← Anterior</button>
          <button onClick={goToday} className="btn-secondary px-3 py-1.5 text-xs">Hoy</button>
          <button onClick={goNext}  className="btn-secondary px-3 py-1.5 text-xs">Siguiente →</button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm bg-accent-50 ring-1 ring-inset ring-accent-100" /> Día con reserva
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-3 rounded-sm bg-white ring-1 ring-inset ring-border" /> Día libre
        </span>
      </div>

      {reservasQ.isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : (
        <MonthCalendar year={year} month={month} reservasByDate={reservasByDate} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 3 · Tarifas y condiciones
// ─────────────────────────────────────────────────────────────────

const TARIFAS = [
  { tipo: 'Eventos sociales (cumpleaños, reuniones)', precio: 15000 },
  { tipo: 'Eventos deportivos',                       precio:  8000 },
  { tipo: 'Eventos institucionales / ONG',            precio:     0, nota: 'Sin costo' },
  { tipo: 'Día completo (cualquier categoría)',       precio: null,  nota: '+50% sobre tarifa base' },
]

function TarifasTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-primary">Tarifas vigentes</h2>
        <p className="mt-1 text-sm text-primary-500">
          Valores de referencia. La administración puede ajustar el costo
          al cargar la reserva según el caso.
        </p>
      </div>

      <Table>
        <THead>
          <Tr>
            <Th>Tipo de evento</Th>
            <Th className="text-right">Tarifa</Th>
          </Tr>
        </THead>
        <tbody>
          {TARIFAS.map(t => (
            <Tr key={t.tipo}>
              <Td className="font-medium text-primary">{t.tipo}</Td>
              <Td className="whitespace-nowrap text-right font-semibold text-primary-700">
                {t.precio === 0 ? 'Sin costo' : t.precio == null ? (t.nota ?? '—') : fmtMoney.format(t.precio)}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Capacidad</h3>
          <p className="mt-2 text-3xl font-bold text-primary">150</p>
          <p className="text-xs text-primary-500">personas máximo</p>
        </div>
        <div className="card p-5">
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Reservas</h3>
          <p className="mt-2 text-sm text-primary-700">
            Las reservas se realizan en Administración, de Lunes a Viernes
            de 7:00 a 13:00.
          </p>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Condiciones de uso</h3>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-primary-700">
          <li>El SUM debe entregarse en las mismas condiciones de limpieza en que se recibió.</li>
          <li>El solicitante es responsable por daños ocasionados durante el evento.</li>
          <li>No se permite música amplificada después de las 23:00.</li>
          <li>Se debe respetar la capacidad máxima de 150 personas.</li>
          <li>El costo se abona por adelantado al confirmar la reserva.</li>
          <li>Las reservas pueden cancelarse hasta 48 horas antes sin cargo.</li>
        </ul>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function SUM() {
  const { perfil, hasRole } = useAuth()
  const municipioId = useEffectiveMunicipioId()
  const esDirector  = hasRole(['admin_comuna', 'superadmin'])
  const canApprove  = esDirector
  const canCreate   = hasRole(['admin_comuna', 'superadmin', 'subadmin', 'usuario_sub'])

  // Lectura del ?tab= desde URL. Sin escritura: la navegación
  // entre sub-secciones viene del sidebar.
  //   'admin' → 'administracion' (alias)
  //   resto / vacío → 'reservas' (página principal del módulo, que
  //   incluye reservas + calendario + tarifas en un solo flujo).
  const [searchParams] = useSearchParams()
  const tabParamRaw = searchParams.get('tab') || ''
  const tabRequested = tabParamRaw === 'admin' || tabParamRaw === 'administracion'
                       ? 'administracion'
                       : 'reservas'
  // Busca la dependencia del SUM en el municipio efectivo. El find
  // tolera variaciones del seed (sum / salon / salon_usos_multiples).
  const depsQ = useDependencias(municipioId)
  const depsLoading = depsQ.isLoading
  const depSum = useMemo(() => {
    const tipos = ['sum', 'salon', 'salon_usos_multiples']
    return (depsQ.data ?? []).find(d => tipos.includes((d?.tipo ?? '').toLowerCase())) ?? null
  }, [depsQ.data])

  // Gating por dependencias_acceso. Directores ven todo.
  const miAcceso = useMemo(() => {
    if (!depSum) return null
    return (perfil?.dependencias_acceso ?? []).find(d => d?.dependencia_id === depSum.id) ?? null
  }, [perfil, depSum])
  const puedeGestionar   = esDirector || !!miAcceso?.puede_gestionar
  const puedeAdministrar = esDirector || !!miAcceso?.puede_administrar
  // Tarifas son info pública dentro de "reservas" — siempre visibles.
  // Si llega sin permisos, "reservas" sigue mostrando la vista
  // pública (calendario + tarifas) sin las acciones de aprobar/crear.
  const primeraSeccion = puedeGestionar
    ? 'reservas'
    : puedeAdministrar ? 'administracion' : 'reservas'
  const seccion = tabRequested === 'administracion' && !puedeAdministrar
    ? primeraSeccion
    : tabRequested

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Salón de Usos Múltiples</h1>
        <p className="mt-1 text-sm text-primary-500">
          <span className="text-primary-400">SUM</span>
          <span className="mx-1.5 text-primary-300">›</span>
          <span className="font-medium text-primary-700">{SECCION_LABEL[seccion] ?? '—'}</span>
          {depSum?.nombre && (
            <span className="text-primary-400"> · {depSum.nombre}</span>
          )}
        </p>
      </header>

      {depsLoading && (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      )}

      {!depsLoading && !depSum && seccion !== 'reservas' && (
        <div className="card border-accent-100 bg-accent-50 p-5 text-sm text-accent-700">
          <p className="font-semibold">No se encontró la dependencia del SUM.</p>
          <p className="mt-1 text-xs">
            Verificá que exista una dependencia de tipo
            {' '}<code>sum</code>, <code>salon</code> o <code>salon_usos_multiples</code>{' '}
            en este municipio.
          </p>
        </div>
      )}

      {!depsLoading && seccion === 'reservas' && (
        <div className="space-y-6">
          {depSum
            ? <ReservasTab depSum={depSum} canApprove={canApprove} />
            : (
              <div className="card border-accent-100 bg-accent-50 p-5 text-sm text-accent-700">
                <p className="font-semibold">No se encontró la dependencia del SUM.</p>
                <p className="mt-1 text-xs">
                  Verificá que exista una dependencia de tipo
                  {' '}<code>sum</code>, <code>salon</code> o <code>salon_usos_multiples</code>{' '}
                  en este municipio.
                </p>
              </div>
            )}
          {depSum && <CalendarioTab />}
          <TarifasTab />
        </div>
      )}

      {!depsLoading && seccion === 'administracion' && depSum && (
        <AdministracionTab
          dependenciaId={depSum.id}
          dependenciaNombre={depSum.nombre}
          municipioId={municipioId}
          canApprove={canApprove}
          canCreate={canCreate}
        />
      )}
    </div>
  )
}
