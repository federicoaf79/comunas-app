import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { medicoGuardia } from '../../lib/mockData'
import { useTurnos, useDependenciaByTipo } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useAuth } from '../../context/AuthContext'
import { shortDateOf, todayArgYMD, timeOf } from '../../lib/datetime'
import Tabs from '../../components/ui/Tabs'
import Avatar from '../../components/ui/Avatar'
import StatCard from '../../components/ui/StatCard'
import Spinner from '../../components/ui/Spinner'
import RecetaUploader from '../../components/hc/RecetaUploader'
import AdministracionTab from '../../components/admin/AdministracionTab'
import CalendarioSemanal, {
  COLOR_BY_SPEC,
  SPEC_LABEL,
} from '../../components/turnos/CalendarioSemanal'

const TABS_SALA = [
  { value: 'agenda',         label: 'Agenda' },
  { value: 'administracion', label: 'Administración' },
]

function vecinoLabel(t) {
  const v = t.vecino
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

// Clases en src/index.css — paleta unificada (cero verde).
const ESTADO_DIA = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
  reservado:  'estado-pendiente',
  atendido:   'estado-atendido',
  ausente:    'estado-cancelado',
}

// Lunes 00:00 local de la semana que contiene `date`.
function startOfWeekMonday(date) {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0) // anchor a mediodía para evitar rollover
  const day = d.getDay()         // 0 = Domingo, 1 = Lunes, ...
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function ymdLocal(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function SalaPrimerosAuxilios() {
  const navigate = useNavigate()
  const { hasRole } = useAuth()
  const municipioId = useEffectiveMunicipioId()
  const canApprove  = hasRole(['admin_comuna', 'superadmin'])
  const canCreate   = hasRole(['admin_comuna', 'superadmin', 'subadmin', 'usuario_sub'])

  const [tab, setTab] = useState('agenda')
  const [vista, setVista] = useState('dia')
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()))
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  // Dependencia de salud para restringir las queries de turnos a
  // la Sala PA. La navegación a la página de atención lleva
  // turno_id como param — el municipioId se resuelve dentro de
  // AtencionDetalle.
  const depSaludQ  = useDependenciaByTipo('caps')
  const dependenciaSaludId = depSaludQ.data?.id ?? null
  const depSaludNombre     = depSaludQ.data?.nombre ?? null

  // Vista día: turnos reales del día actual (Supabase). Si la
  // dependencia de salud está resuelta, filtramos por ella.
  const today = todayArgYMD()
  const { turnos: turnosDia, isLoading: diaLoading } = useTurnos({
    fecha:         vista === 'dia' ? today : undefined,
    dependenciaId: dependenciaSaludId ?? undefined,
  })
  const atendidos = (turnosDia ?? []).filter(t => t.estado === 'atendido').length
  // Alergias requieren un hook real (TODO). Hasta entonces el KPI
  // queda en 0 — placeholder hasta que tengamos source of truth.
  const conAlergias = []

  // Vista semana: turnos del rango via Supabase real.
  const { turnos: turnosSemana, isLoading: weekLoading, error: weekError } = useTurnos({
    fechaFrom:     vista === 'semana' ? ymdLocal(weekStart) : undefined,
    fechaTo:       vista === 'semana' ? ymdLocal(weekEnd)   : undefined,
    dependenciaId: dependenciaSaludId ?? undefined,
  })

  function prevWeek() { setWeekStart(prev => addDays(prev, -7)) }
  function nextWeek() { setWeekStart(prev => addDays(prev,  7)) }
  function thisWeek() { setWeekStart(startOfWeekMonday(new Date())) }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Sala de Primeros Auxilios</h1>
          <p className="text-sm text-primary-400">Agenda — CAPS Real Sayana</p>
        </div>
        {tab === 'agenda' && (
          <div className="inline-flex rounded-md border border-border bg-white p-0.5 text-sm shadow-sm">
            <button
              onClick={() => setVista('dia')}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                vista === 'dia' ? 'bg-primary text-white' : 'text-primary-500 hover:bg-primary-50'
              }`}
            >
              Vista día
            </button>
            <button
              onClick={() => setVista('semana')}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                vista === 'semana' ? 'bg-primary text-white' : 'text-primary-500 hover:bg-primary-50'
              }`}
            >
              Vista semana
            </button>
          </div>
        )}
      </header>

      <Tabs tabs={TABS_SALA} value={tab} onChange={setTab} />

      {tab === 'administracion' && (
        <AdministracionTab
          dependenciaId={dependenciaSaludId}
          dependenciaNombre={depSaludNombre}
          municipioId={municipioId}
          canApprove={canApprove}
          canCreate={canCreate}
        />
      )}

      {tab === 'agenda' && <>
      {/* Médico de guardia (común a ambas vistas) */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v6a4 4 0 0 1-4 4M12 2v6a4 4 0 0 0 4 4M8 12h8M12 12v8" />
            </svg>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-primary-400">Médico de guardia</p>
            <p className="text-lg font-semibold text-primary">{medicoGuardia.nombre}</p>
            <p className="text-xs text-primary-500">
              {medicoGuardia.especialidad} · {medicoGuardia.matricula}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm text-primary-700">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary-400">Horario</p>
            <p className="font-semibold">{medicoGuardia.desde} – {medicoGuardia.hasta}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-primary-400">Contacto</p>
            <p className="font-semibold">{medicoGuardia.telefono}</p>
          </div>
        </div>
      </div>

      {vista === 'dia' && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Turnos del día" value={turnosDia.length} />
            <StatCard label="Atendidos"      value={atendidos} accent="accent" />
            <StatCard
              label="Pacientes con alergia"
              value={conAlergias.length}
              accent="danger"
              hint="Verificar antes de medicar"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="card overflow-hidden p-0 lg:col-span-2">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-primary-700">Agenda del día</h2>
              </header>
              {diaLoading ? (
                <div className="flex items-center justify-center px-5 py-10">
                  <Spinner />
                </div>
              ) : (turnosDia ?? []).length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-primary-400">Sin turnos cargados.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {(turnosDia ?? []).map(t => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/sala/atencion/${t.id}`)}
                        className="flex w-full flex-wrap items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-primary-50/50"
                      >
                        <span className="w-14 shrink-0 text-sm font-semibold text-primary">
                          {timeOf(t.fecha_hora) || '—'}
                        </span>
                        <Avatar name={vecinoLabel(t)} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-primary-700">
                            {vecinoLabel(t)}
                          </p>
                          <p className="truncate text-xs text-primary-400">
                            {t.motivo || 'Consulta clínica'}
                          </p>
                        </div>
                        <span className={ESTADO_DIA[t.estado] ?? 'estado-pendiente'}>{t.estado}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-0">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-primary-700">Cargar receta por foto</h2>
                <p className="mt-0.5 text-xs text-primary-400">
                  Foto desde el celular o seleccionar archivo. Queda asociada al vecino.
                </p>
              </header>
              <div className="p-5">
                <RecetaUploader />
              </div>
            </div>
          </div>
        </>
      )}

      {vista === 'semana' && (
        <>
          {/* Navegación */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={prevWeek} className="btn-secondary">← Semana anterior</button>
            <div className="flex items-center gap-3 text-sm">
              <button onClick={thisWeek} className="font-medium text-primary hover:underline">
                Esta semana
              </button>
              <span className="font-semibold text-primary">
                {shortDateOf(weekStart)} – {shortDateOf(weekEnd)}
              </span>
            </div>
            <button onClick={nextWeek} className="btn-secondary">Semana siguiente →</button>
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-white px-4 py-2 text-xs text-primary-500">
            {Object.keys(COLOR_BY_SPEC).map(key => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span className={`inline-block h-3 w-3 rounded ${COLOR_BY_SPEC[key].solid}`} />
                <span>{SPEC_LABEL[key]}</span>
              </span>
            ))}
            <span className="ml-auto inline-flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-5 rounded bg-primary" />
                Confirmado
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-5 rounded border-2 border-dashed border-primary" />
                Pendiente
              </span>
              <span className="inline-flex items-center gap-1 line-through opacity-50">
                <span className="inline-block h-3 w-5 rounded bg-primary opacity-50" />
                Cancelado
              </span>
            </span>
          </div>

          {weekError && (
            <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
              No pudimos cargar los turnos de la semana: {weekError.message}
            </div>
          )}

          {weekLoading ? (
            <div className="card flex items-center justify-center p-10">
              <Spinner size="lg" />
            </div>
          ) : (
            <CalendarioSemanal weekStart={weekStart} turnos={turnosSemana} />
          )}
        </>
      )}
      </>}

    </div>
  )
}
