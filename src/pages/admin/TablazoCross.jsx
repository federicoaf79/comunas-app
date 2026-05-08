import { useMemo, useState } from 'react'
import { useTurnos, useDependencias } from '../../hooks/useTurnos'
import { todayArgYMD, timeOf } from '../../lib/datetime'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'

// =============================================================
// Tablero de turnos cruzado — vista kanban horizontal.
//
// Una columna por dependencia activa, dentro de cada columna los
// turnos del día seleccionado ordenados por hora. Pensado para que
// el operador vea de un vistazo cómo está cargada la jornada.
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

// Color del borde superior de cada columna según el `tipo` de la
// dependencia. Cero verde — los matches caen a tonos navy/azul/gold/gris.
function topBorderForTipo(tipo) {
  const t = (tipo ?? '').toLowerCase()
  if (/caps|salud|sala/.test(t))                return 'border-t-ok'         // Sala PA → azul
  if (/juzgado|paz/.test(t))                    return 'border-t-primary'    // Juez de Paz → navy
  if (/sum|sal[oó]n|cultural/.test(t))          return 'border-t-accent'     // SUM → gold
  if (/intendencia|admin|gobierno|comuna/.test(t)) return 'border-t-gray-400' // Admin → gris
  return 'border-t-primary-200'
}

function vecinoNombre(v) {
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

// ─────────────────────────────────────────────────────────────────
// Card de turno dentro de la columna
// ─────────────────────────────────────────────────────────────────

function TurnoCard({ turno }) {
  const isFamiliar = !!turno.metadata?.para_familiar
  const nombre = isFamiliar
    ? (turno.metadata.familiar_nombre || vecinoNombre(turno.vecino))
    : vecinoNombre(turno.vecino)

  return (
    <article className="rounded-lg border border-border bg-white p-3 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <p className="font-sora text-base font-bold text-primary">
          {timeOf(turno.fecha_hora) || '—'}
        </p>
        {turno.numero_turno && (
          <span className="text-[11px] font-medium text-primary-400">
            #{turno.numero_turno}
          </span>
        )}
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium text-primary-700">
        {nombre}
      </p>
      {isFamiliar && turno.vecino && (
        <p className="mt-0.5 text-[11px] text-primary-400">
          Solicitó: {vecinoNombre(turno.vecino)}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={ESTADO_CLASS[turno.estado] ?? 'estado-pendiente'}>
          {ESTADO_LABEL[turno.estado] ?? turno.estado}
        </span>
        {turno.canal && (
          <span className={CANAL_CLASS[turno.canal] ?? 'canal-presencial'}>
            {turno.canal}
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
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────
// Columna por dependencia
// ─────────────────────────────────────────────────────────────────

function DependenciaColumn({ dependencia, turnos }) {
  const top = topBorderForTipo(dependencia.tipo)
  const sorted = [...turnos].sort((a, b) => (a.fecha_hora ?? '').localeCompare(b.fecha_hora ?? ''))

  return (
    <div className={`flex w-72 shrink-0 flex-col rounded-xl border-t-4 border border-border bg-primary-50/60 ${top}`}>
      <header className="border-b border-border bg-white px-4 py-3">
        <h3 className="font-sora text-sm font-bold text-primary">
          {dependencia.nombre}
        </h3>
        <p className="mt-0.5 text-xs font-medium text-primary-400">
          {turnos.length} turno{turnos.length === 1 ? '' : 's'} hoy
        </p>
      </header>
      <div className="flex flex-1 flex-col gap-2.5 p-3">
        {sorted.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-white p-4 text-center text-xs text-primary-400">
            Sin turnos para esta fecha.
          </p>
        ) : (
          sorted.map(t => <TurnoCard key={t.id} turno={t} />)
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function TablazoCross() {
  const [fecha, setFecha]   = useState(() => todayArgYMD())
  const [estado, setEstado] = useState('')

  const { turnos, isLoading, isFetching, error } = useTurnos({
    fecha,
    estado: estado || undefined,
  })
  const { data: dependencias = [], isLoading: depsLoading } = useDependencias()

  // Catálogo activo (orden alfabético) + agrupación de turnos por
  // dependencia_id. Si un turno apunta a una dep que no está en el
  // catálogo (caso raro), se acumula bajo la key del dep.id sin
  // bloque visual — preferimos no perderlo.
  const grupos = useMemo(() => {
    const turnosByDep = new Map()
    for (const t of turnos ?? []) {
      const k = t.dependencia_id
      if (!turnosByDep.has(k)) turnosByDep.set(k, [])
      turnosByDep.get(k).push(t)
    }
    // Tomamos solo dependencias activas; las que no estén activas
    // pero tengan turnos del día también las mostramos al final.
    const activas = (dependencias ?? [])
      .filter(d => d.activo !== false)
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))

    const conTurnosFueraDeCatalogo = []
    for (const [depId, rows] of turnosByDep.entries()) {
      if (!activas.find(d => d.id === depId) && rows[0]?.dependencia?.nombre) {
        conTurnosFueraDeCatalogo.push({
          id:     depId,
          nombre: rows[0].dependencia.nombre,
          tipo:   '',
          activo: true,
        })
      }
    }
    return [...activas, ...conTurnosFueraDeCatalogo].map(d => ({
      dependencia: d,
      turnos:      turnosByDep.get(d.id) ?? [],
    }))
  }, [turnos, dependencias])

  const totalTurnos = (turnos ?? []).length

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Tablero de turnos</h1>
          <p className="text-sm text-primary-400">
            Vista cruzada por dependencia · {fecha}
            {isFetching && !isLoading && (
              <span className="ml-2 text-primary-300">(actualizando...)</span>
            )}
            {' · '}{totalTurnos} turno{totalTurnos === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label="Fecha"
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="min-w-[160px]"
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
      </header>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los turnos: {error.message}
        </div>
      )}

      {(isLoading || depsLoading) && (
        <div className="card flex items-center justify-center p-12">
          <Spinner size="lg" />
        </div>
      )}

      {!isLoading && !depsLoading && grupos.length === 0 && (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay dependencias activas para mostrar.
        </div>
      )}

      {!isLoading && !depsLoading && grupos.length > 0 && (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          <div className="flex gap-4">
            {grupos.map(g => (
              <DependenciaColumn
                key={g.dependencia.id}
                dependencia={g.dependencia}
                turnos={g.turnos}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
