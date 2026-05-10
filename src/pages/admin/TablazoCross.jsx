import { useMemo, useState } from 'react'
import { useTurnos, useDependencias } from '../../hooks/useTurnos'
import { todayArgYMD, timeOf, shortDateOf } from '../../lib/datetime'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'

// =============================================================
// Tablero de turnos — toggle Día / Semana.
//
// Vista Día:    lista vertical agrupada por franja horaria. El
//               operador ve la jornada completa de un vistazo.
// Vista Semana: 5 columnas (Lun-Vie) con turnos compactos por día,
//               para anticipar la carga de la semana.
//
// Las fechas anteriores a hoy son read-only (sin Confirmar/Cancelar)
// y muestran un badge naranja "HISTÓRICO". El día actual se
// destaca con borde gold en la vista semana.
// =============================================================

const ESTADOS_OPTS = [
  { value: 'pendiente',  label: 'Pendientes' },
  { value: 'confirmado', label: 'Confirmados' },
  { value: 'en_curso',   label: 'En curso' },
  { value: 'completado', label: 'Completados' },
  { value: 'cancelado',  label: 'Cancelados' },
]

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

const CANAL_CLASS = {
  whatsapp:   'canal-whatsapp',
  sms:        'canal-sms',
  web:        'canal-web',
  presencial: 'canal-presencial',
}

const DOW_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']

// Color del badge de dependencia según `tipo`. Cero verde — todas
// las variantes caen a navy / azul OK / gold / gris / slate.
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

function vecinoNombre(v) {
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

// ─────────────────────────────────────────────────────────────────
// Helpers de fecha
// ─────────────────────────────────────────────────────────────────

// "YYYY-MM-DD" en hora local. Nota: la página trabaja con fechas
// como strings — comparamos con orden lexicográfico, que para
// YYYY-MM-DD es equivalente a orden cronológico.
function ymd(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseYmd(s) {
  // new Date("YYYY-MM-DD") interpreta como UTC, lo cual hace que
  // en zonas con offset negativo (Argentina) el día se muestre
  // shifted. Forzamos el parseo local.
  const [y, m, day] = (s ?? '').split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, day ?? 1)
}

function startOfWeekMonday(date) {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0) // anchor a mediodía para evitar rollover por DST
  const dow = d.getDay()  // 0 = Dom ... 6 = Sáb
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// Devuelve los 5 días de la semana laborable (Lun-Vie) que contiene
// `fecha` (YYYY-MM-DD). Cada item: { date: Date, ymd: string, dow: 'Lun'... }.
function semanaLaboralDe(fechaYmd) {
  const lunes = startOfWeekMonday(parseYmd(fechaYmd))
  return Array.from({ length: 5 }, (_, i) => {
    const d = addDays(lunes, i)
    return { date: d, ymd: ymd(d), dow: DOW_LABELS[i] }
  })
}

// ─────────────────────────────────────────────────────────────────
// Sub-componentes compartidos
// ─────────────────────────────────────────────────────────────────

function HistoricoBadge({ small = false }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full bg-orange-100 font-bold uppercase tracking-wide text-orange-700 ring-1 ring-inset ring-orange-200 ' +
        (small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs')
      }
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 7v5l3 2" />
      </svg>
      Histórico
    </span>
  )
}

// Fila completa para Vista Día (con acciones inline al hover).
function TurnoRow({ turno, onConfirmar, onCancelar }) {
  const isFamiliar = !!turno.metadata?.para_familiar
  const nombrePrincipal = isFamiliar
    ? (turno.metadata.familiar_nombre || vecinoNombre(turno.vecino))
    : vecinoNombre(turno.vecino)

  const depNombre = turno.dependencia?.nombre ?? turno.dependencia_nombre ?? '—'
  const depCls    = depBadgeClass(turno.dependencia?.tipo)

  return (
    <li className="group flex flex-wrap items-start gap-3 p-4 transition-colors hover:bg-primary-50/40">
      <span
        className={
          'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ' +
          depCls
        }
      >
        {depNombre}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary sm:text-base">
          {nombrePrincipal}
        </p>
        {isFamiliar && turno.vecino && (
          <p className="mt-0.5 text-[11px] text-primary-400">
            Solicitó: {vecinoNombre(turno.vecino)}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={ESTADO_CLASS[turno.estado] ?? 'estado-pendiente'}>
            {ESTADO_LABEL[turno.estado] ?? turno.estado}
          </span>
          {turno.canal && (
            <span className={CANAL_CLASS[turno.canal] ?? 'canal-presencial'}>
              {turno.canal}
            </span>
          )}
          {turno.numero_turno && (
            <span className="font-medium text-primary-400">
              #{turno.numero_turno}
            </span>
          )}
          {isFamiliar && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent-700 ring-1 ring-inset ring-accent-100"
              title={turno.metadata.vinculo ? `Vínculo: ${turno.metadata.vinculo}` : 'Turno familiar'}
            >
              <span aria-hidden="true">👨‍👩‍👧</span>
              Familiar
            </span>
          )}
        </div>
      </div>

      {(onConfirmar || onCancelar) && (
        <div className="flex shrink-0 gap-3 text-xs font-medium opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {onConfirmar && (
            <button onClick={onConfirmar} className="text-ok-700 hover:underline">Confirmar</button>
          )}
          {onCancelar && (
            <button onClick={onCancelar} className="text-danger hover:underline">Cancelar</button>
          )}
        </div>
      )}
    </li>
  )
}

// Línea compacta para Vista Semana — solo lo esencial.
function TurnoLineaCompacta({ turno }) {
  const isFamiliar = !!turno.metadata?.para_familiar
  const nombre = isFamiliar
    ? (turno.metadata.familiar_nombre || vecinoNombre(turno.vecino))
    : vecinoNombre(turno.vecino)
  const depNombre = turno.dependencia?.nombre ?? turno.dependencia_nombre ?? '—'
  const depCls    = depBadgeClass(turno.dependencia?.tipo)
  return (
    <li className="border-t border-border first:border-t-0 px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-sora text-sm font-bold text-primary">
          {timeOf(turno.fecha_hora) || '—'}
        </span>
        {turno.numero_turno && (
          <span className="text-[10px] text-primary-400">#{turno.numero_turno}</span>
        )}
      </div>
      <p className="mt-0.5 line-clamp-1 text-xs font-medium text-primary-700">
        {nombre}
      </p>
      <span
        className={
          'mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ' +
          depCls
        }
      >
        {depNombre}
      </span>
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────
// Vista Día — lista por franja horaria
// ─────────────────────────────────────────────────────────────────

function VistaDia({
  fecha, dependenciaId, estado, isHistorico,
}) {
  const { turnos, isLoading, isFetching, error, updateEstado, cancel } = useTurnos({
    fecha,
    dependenciaId: dependenciaId || undefined,
    estado:        estado || undefined,
  })

  const grupos = useMemo(() => {
    const map = new Map()
    for (const t of turnos ?? []) {
      const hora = timeOf(t.fecha_hora) || '—'
      if (!map.has(hora)) map.set(hora, [])
      map.get(hora).push(t)
    }
    return Array.from(map.entries())
      .map(([hora, items]) => ({
        hora,
        turnos: items.slice().sort((a, b) =>
          (a.fecha_hora ?? '').localeCompare(b.fecha_hora ?? ''),
        ),
      }))
      .sort((a, b) => a.hora.localeCompare(b.hora))
  }, [turnos])

  async function handleConfirmar(id) {
    try { await updateEstado.mutateAsync({ id, estado: 'confirmado' }) }
    catch (e) { alert(`No se pudo confirmar: ${e.message}`) }
  }
  async function handleCancelar(id) {
    if (!confirm('¿Cancelar este turno?')) return
    try { await cancel.mutateAsync(id) }
    catch (e) { alert(`No se pudo cancelar: ${e.message}`) }
  }

  const total = (turnos ?? []).length

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm text-primary-400">
        <span>{total} turno{total === 1 ? '' : 's'} en la fecha</span>
        {isFetching && !isLoading && <span className="text-primary-300">(actualizando…)</span>}
        {isHistorico && <HistoricoBadge />}
      </div>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los turnos: {error.message}
        </div>
      )}

      {isLoading && (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      )}

      {!isLoading && !error && grupos.length === 0 && (
        <div className="card p-12 text-center text-sm text-primary-400">
          No hay turnos para esta fecha.
        </div>
      )}

      {!isLoading && !error && grupos.length > 0 && (
        <div className="space-y-6">
          {grupos.map(g => (
            <section key={g.hora}>
              <div className="mb-2 flex items-center gap-3">
                <p className="shrink-0 font-sora text-lg font-bold text-primary sm:text-xl">{g.hora}</p>
                <div className="h-px flex-1 bg-border" aria-hidden="true" />
                <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-primary-400">
                  {g.turnos.length} turno{g.turnos.length === 1 ? '' : 's'}
                </p>
              </div>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white shadow-card">
                {g.turnos.map(t => {
                  // En histórico no se confirman ni cancelan turnos.
                  const canConfirmar = !isHistorico && t.estado === 'pendiente'
                  const canCancelar  = !isHistorico && t.estado !== 'cancelado' && t.estado !== 'completado'
                  return (
                    <TurnoRow
                      key={t.id}
                      turno={t}
                      onConfirmar={canConfirmar ? () => handleConfirmar(t.id) : null}
                      onCancelar={canCancelar  ? () => handleCancelar(t.id)  : null}
                    />
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Vista Semana — 5 columnas Lun-Vie
// ─────────────────────────────────────────────────────────────────

function VistaSemana({ fecha, dependenciaId, estado }) {
  const dias = useMemo(() => semanaLaboralDe(fecha), [fecha])
  const today = todayArgYMD()

  const fechaFrom = dias[0]?.ymd
  const fechaTo   = dias[4]?.ymd

  const { turnos, isLoading, isFetching, error } = useTurnos({
    fechaFrom,
    fechaTo,
    dependenciaId: dependenciaId || undefined,
    estado:        estado || undefined,
  })

  // Agrupamos por fecha (YYYY-MM-DD) y ordenamos por hora dentro
  // de cada día. Tomamos el ymd del propio fecha_hora (substring).
  const turnosPorDia = useMemo(() => {
    const map = new Map(dias.map(d => [d.ymd, []]))
    for (const t of (turnos ?? [])) {
      const k = (t.fecha_hora ?? '').slice(0, 10)
      if (map.has(k)) map.get(k).push(t)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.fecha_hora ?? '').localeCompare(b.fecha_hora ?? ''))
    }
    return map
  }, [turnos, dias])

  const total = (turnos ?? []).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-primary-400">
        <span>{total} turno{total === 1 ? '' : 's'} en la semana</span>
        <span className="text-primary-300">{shortDateOf(dias[0].date)} – {shortDateOf(dias[4].date)}</span>
        {isFetching && !isLoading && <span className="text-primary-300">(actualizando…)</span>}
      </div>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los turnos: {error.message}
        </div>
      )}

      {isLoading && (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      )}

      {!isLoading && !error && (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="grid min-w-[800px] grid-cols-5 gap-3 lg:min-w-0">
            {dias.map(d => {
              const items = turnosPorDia.get(d.ymd) ?? []
              const isToday      = d.ymd === today
              const isHistorico  = d.ymd < today
              const borderCls    = isToday
                ? 'border-accent ring-2 ring-accent/30'
                : 'border-border'
              return (
                <div
                  key={d.ymd}
                  className={`flex flex-col rounded-xl border bg-white shadow-card ${borderCls}`}
                >
                  <header className={
                    'flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 ' +
                    (isToday ? 'border-accent bg-accent-50' : 'border-border bg-primary-50/60')
                  }>
                    <div>
                      <p className="font-sora text-sm font-bold text-primary">{d.dow}</p>
                      <p className="text-[11px] font-medium text-primary-400">{shortDateOf(d.date)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                      <span className={
                        'rounded-full px-2 py-0.5 text-[10px] font-bold ' +
                        (isToday
                          ? 'bg-accent text-primary-900'
                          : 'bg-primary-100 text-primary-700')
                      }>
                        {items.length}
                      </span>
                      {isHistorico && <HistoricoBadge small />}
                    </div>
                  </header>
                  <ul className="flex-1">
                    {items.length === 0 ? (
                      <li className="p-4 text-center text-xs italic text-primary-300">
                        Sin turnos
                      </li>
                    ) : (
                      items.map(t => <TurnoLineaCompacta key={t.id} turno={t} />)
                    )}
                  </ul>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Toggle día / semana
// ─────────────────────────────────────────────────────────────────

function VistaToggle({ vista, onChange }) {
  return (
    <div className="inline-flex rounded-md border border-border bg-white p-0.5 text-sm shadow-sm">
      <button
        type="button"
        onClick={() => onChange('dia')}
        className={
          'rounded px-3 py-1 font-medium transition-colors ' +
          (vista === 'dia' ? 'bg-primary text-white' : 'text-primary-500 hover:bg-primary-50')
        }
      >
        <span aria-hidden="true">📅</span> Día
      </button>
      <button
        type="button"
        onClick={() => onChange('semana')}
        className={
          'rounded px-3 py-1 font-medium transition-colors ' +
          (vista === 'semana' ? 'bg-primary text-white' : 'text-primary-500 hover:bg-primary-50')
        }
      >
        <span aria-hidden="true">📆</span> Semana
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function TablazoCross() {
  const [vista, setVista]                 = useState('dia')
  const [fecha, setFecha]                 = useState(() => todayArgYMD())
  const [dependenciaId, setDependenciaId] = useState('')
  const [estado, setEstado]               = useState('')

  const { data: deps = [] } = useDependencias()
  const depsActivasOpts = useMemo(() =>
    (deps ?? [])
      .filter(d => d.activa !== false)
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
      .map(d => ({ value: d.id, label: d.nombre })),
    [deps],
  )

  const today = todayArgYMD()
  const isHistorico = vista === 'dia' && fecha < today

  // ← / → navegan: 1 día en vista día, 7 días en vista semana.
  function shiftFecha(deltaDias) {
    const d = parseYmd(fecha)
    d.setDate(d.getDate() + deltaDias)
    setFecha(ymd(d))
  }
  function goPrev()  { shiftFecha(vista === 'semana' ? -7 : -1) }
  function goNext()  { shiftFecha(vista === 'semana' ?  7 :  1) }
  function goToday() { setFecha(today) }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Tablero de turnos</h1>
          <p className="text-sm text-primary-400">
            {vista === 'dia'
              ? 'Lista por franja horaria'
              : 'Vista semanal de Lunes a Viernes'}
          </p>
        </div>
        <VistaToggle vista={vista} onChange={setVista} />
      </header>

      {/* Filtros + navegación */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label="Fecha"
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="min-w-[160px]"
          />
          <Select
            label="Dependencia"
            value={dependenciaId}
            onChange={setDependenciaId}
            placeholder="Todas"
            options={depsActivasOpts}
            className="min-w-[200px]"
          />
          <Select
            label="Estado"
            value={estado}
            onChange={setEstado}
            placeholder="Todos los estados"
            options={ESTADOS_OPTS}
            className="min-w-[180px]"
          />
        </div>
        <div className="inline-flex gap-2 self-end">
          <button onClick={goPrev}  className="btn-secondary px-3 py-1.5 text-xs">← Anterior</button>
          <button onClick={goToday} className="btn-secondary px-3 py-1.5 text-xs">Hoy</button>
          <button onClick={goNext}  className="btn-secondary px-3 py-1.5 text-xs">Siguiente →</button>
        </div>
      </div>

      {vista === 'dia' && (
        <VistaDia
          fecha={fecha}
          dependenciaId={dependenciaId}
          estado={estado}
          isHistorico={isHistorico}
        />
      )}
      {vista === 'semana' && (
        <VistaSemana
          fecha={fecha}
          dependenciaId={dependenciaId}
          estado={estado}
        />
      )}
    </div>
  )
}
