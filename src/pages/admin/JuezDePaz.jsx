import { useMemo, useState } from 'react'
import { useTurnos, useDependenciaByTipo } from '../../hooks/useTurnos'
import { useQueryClient } from '@tanstack/react-query'
import { todayArgYMD, shortDateOf, timeOf } from '../../lib/datetime'
import Tabs from '../../components/ui/Tabs'
import Spinner from '../../components/ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import CalendarioSemanal from '../../components/turnos/CalendarioSemanal'
import NuevoTurnoModal from '../../components/admin/NuevoTurnoModal'

// =============================================================
// Juez de Paz — gestión de turnos del juzgado.
// 3 tabs: Turnos del día | Agenda semanal | Consultas frecuentes.
// =============================================================

const TABS = [
  { value: 'dia',       label: 'Turnos del día' },
  { value: 'semana',    label: 'Agenda semanal' },
  { value: 'consultas', label: 'Consultas frecuentes' },
]

const ESTADO_LABEL = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  en_curso:   'En curso',
  completado: 'Completado',
  cancelado:  'Cancelado',
}
const ESTADO_CLASS = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
}

function vecinoNombre(v) {
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

function startOfWeekMonday(date) {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r }
function ymdLocal(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// ─────────────────────────────────────────────────────────────────
// TAB 1 · Turnos del día
// ─────────────────────────────────────────────────────────────────

function TurnosDiaTab({ depJuez, onOpenNuevo }) {
  const today = todayArgYMD()
  const { turnos, isLoading, error, updateEstado, cancel } = useTurnos({
    fecha:          today,
    dependenciaId:  depJuez?.id,
  })

  async function handleConfirmar(id) {
    try { await updateEstado.mutateAsync({ id, estado: 'confirmado' }) }
    catch (e) { alert(`No se pudo confirmar: ${e.message}`) }
  }
  async function handleCancelar(id) {
    if (!confirm('¿Cancelar este turno?')) return
    try { await cancel.mutateAsync(id) }
    catch (e) { alert(`No se pudo cancelar: ${e.message}`) }
  }

  const ordenados = (turnos ?? []).slice().sort((a, b) =>
    (a.fecha_hora ?? '').localeCompare(b.fecha_hora ?? '')
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-primary-500">
            Turnos para hoy ({today}) en <strong className="text-primary-700">{depJuez?.nombre ?? 'Juez de Paz'}</strong>
          </p>
        </div>
        <button onClick={onOpenNuevo} className="btn-primary">+ Nuevo turno</button>
      </div>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los turnos: {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : ordenados.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay turnos en el Juzgado de Paz para hoy.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Hora</Th>
              <Th>Vecino</Th>
              <Th>Motivo</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </Tr>
          </THead>
          <tbody>
            {ordenados.map(t => (
              <Tr key={t.id}>
                <Td className="whitespace-nowrap font-semibold text-primary">
                  {timeOf(t.fecha_hora) || '—'}
                  {t.numero_turno && (
                    <span className="ml-1 text-xs font-normal text-primary-400">#{t.numero_turno}</span>
                  )}
                </Td>
                <Td>{vecinoNombre(t.vecino)}</Td>
                <Td className="max-w-xs">
                  <span className="line-clamp-2">{t.motivo || '—'}</span>
                </Td>
                <Td>
                  <span className={ESTADO_CLASS[t.estado] ?? 'estado-pendiente'}>
                    {ESTADO_LABEL[t.estado] ?? t.estado}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-right text-xs font-medium">
                  <div className="flex justify-end gap-3">
                    {t.estado === 'pendiente' && (
                      <button onClick={() => handleConfirmar(t.id)} className="text-ok-700 hover:underline">
                        Confirmar
                      </button>
                    )}
                    {t.estado !== 'cancelado' && t.estado !== 'completado' && (
                      <button onClick={() => handleCancelar(t.id)} className="text-danger hover:underline">
                        Cancelar
                      </button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 2 · Agenda semanal
// ─────────────────────────────────────────────────────────────────

function AgendaSemanalTab({ depJuez }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()))
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  const { turnos, isLoading, error } = useTurnos({
    fechaFrom:     ymdLocal(weekStart),
    fechaTo:       ymdLocal(weekEnd),
    dependenciaId: depJuez?.id,
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-primary-500">
          {shortDateOf(weekStart)} – {shortDateOf(weekEnd)}
        </p>
        <div className="inline-flex gap-2">
          <button onClick={() => setWeekStart(p => addDays(p, -7))} className="btn-secondary px-3 py-1.5 text-xs">
            ← Anterior
          </button>
          <button onClick={() => setWeekStart(startOfWeekMonday(new Date()))} className="btn-secondary px-3 py-1.5 text-xs">
            Hoy
          </button>
          <button onClick={() => setWeekStart(p => addDays(p, 7))} className="btn-secondary px-3 py-1.5 text-xs">
            Siguiente →
          </button>
        </div>
      </div>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar la agenda: {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : (
        <CalendarioSemanal weekStart={weekStart} turnos={turnos ?? []} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 3 · Consultas frecuentes (informativo)
// ─────────────────────────────────────────────────────────────────

const CONSULTAS = [
  {
    titulo: 'Certificados de convivencia',
    desc:   'Acreditan que dos o más personas conviven en el mismo domicilio.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
      </svg>
    ),
  },
  {
    titulo: 'Mediaciones vecinales',
    desc:   'Resolución de conflictos entre vecinos sin necesidad de juicio.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 21l-2-7M16 21l2-7M12 3v18M3 8h18M5 12h14" />
      </svg>
    ),
  },
  {
    titulo: 'Declaraciones juradas',
    desc:   'Manifestaciones bajo juramento ante el Juez de Paz.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    titulo: 'Autorizaciones de viaje de menores',
    desc:   'Autorización firmada por padres/tutores para viajes de menores de edad.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 16l8-1 8-7 3 3-7 8-1 8M2 22l3-3M14 2l8 8" />
      </svg>
    ),
  },
  {
    titulo: 'Certificados de domicilio',
    desc:   'Acreditan la residencia del vecino dentro de la jurisdicción.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l9-9 9 9M5 11v9h14v-9M9 20v-5h6v5" />
      </svg>
    ),
  },
]

function ConsultasTab({ depJuez }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-primary">Consultas y trámites frecuentes</h2>
        <p className="mt-1 text-sm text-primary-500">
          Servicios habituales del Juzgado de Paz. Todos requieren turno previo.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {CONSULTAS.map(c => (
          <article key={c.titulo} className="card flex gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-accent">
              {c.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-sora text-base font-semibold text-primary">{c.titulo}</p>
              <p className="mt-1 text-sm text-primary-500">{c.desc}</p>
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-inset ring-accent-100">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" d="M12 7v5l3 2" />
                </svg>
                Requiere turno previo
              </span>
            </div>
          </article>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Contacto del Juzgado</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-primary-400">Atención</dt>
            <dd className="mt-1 text-primary-700">Lunes a Viernes 7:00 – 13:00</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-primary-400">Dependencia</dt>
            <dd className="mt-1 text-primary-700">{depJuez?.nombre ?? 'Juzgado de Paz'}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-primary-400">Teléfono</dt>
            <dd className="mt-1 text-primary-700">(0385) 4-110-001</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-primary-400">WhatsApp</dt>
            <dd className="mt-1 text-primary-700">+54 9 3854 110001</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function JuezDePaz() {
  const qc = useQueryClient()
  const [tab, setTab] = useState('dia')
  const [modalOpen, setModalOpen] = useState(false)

  // Busca la dependencia "juzgado" del municipio del operador. Si
  // es superadmin (municipio_id = null), useDependenciaByTipo cae a
  // la primera dependencia activa con ese tipo en cualquier municipio.
  const { data: depJuez = null, isLoading: depsLoading } = useDependenciaByTipo('juzgado')

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-primary">Juez de Paz</h1>
        <p className="text-sm text-primary-400">
          Gestión de turnos y consultas frecuentes del Juzgado.
        </p>
      </header>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {depsLoading && (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      )}

      {!depsLoading && !depJuez && (
        <div className="card border-accent-100 bg-accent-50 p-5 text-sm text-accent-700">
          <p className="font-semibold">No hay un Juzgado de Paz configurado en este municipio.</p>
          <p className="mt-1 text-xs">
            Pedile al administrador que cree una dependencia con tipo <code>juzgado</code>.
          </p>
        </div>
      )}

      {!depsLoading && depJuez && (
        <>
          {tab === 'dia'       && <TurnosDiaTab depJuez={depJuez} onOpenNuevo={() => setModalOpen(true)} />}
          {tab === 'semana'    && <AgendaSemanalTab depJuez={depJuez} />}
          {tab === 'consultas' && <ConsultasTab depJuez={depJuez} />}
        </>
      )}

      <NuevoTurnoModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        dependencia={depJuez}
        onCreated={() => qc.invalidateQueries({ queryKey: ['turnos'] })}
      />
    </div>
  )
}
