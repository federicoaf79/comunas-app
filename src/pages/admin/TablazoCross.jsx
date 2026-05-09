import { useMemo, useState } from 'react'
import { useTurnos, useDependencias } from '../../hooks/useTurnos'
import { todayArgYMD, timeOf } from '../../lib/datetime'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'

// =============================================================
// Tablero de turnos — vista de lista agrupada por franja horaria.
//
// Reemplaza el antiguo layout Kanban horizontal (una columna por
// dependencia) por una lista vertical organizada por hora. Cada
// franja muestra un separador con la hora a la izquierda y todos
// los turnos de esa franja debajo, con badge coloreado por
// dependencia. Escala mucho mejor cuando hay muchas dependencias
// y se colapsa naturalmente en mobile.
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
// Fila de turno (un item dentro del bloque de la franja horaria)
// ─────────────────────────────────────────────────────────────────

function TurnoRow({ turno, onConfirmar, onCancelar }) {
  const isFamiliar = !!turno.metadata?.para_familiar
  const nombrePrincipal = isFamiliar
    ? (turno.metadata.familiar_nombre || vecinoNombre(turno.vecino))
    : vecinoNombre(turno.vecino)

  const depNombre = turno.dependencia?.nombre ?? turno.dependencia_nombre ?? '—'
  const depCls    = depBadgeClass(turno.dependencia?.tipo)

  return (
    <li className="group flex flex-wrap items-start gap-3 p-4 transition-colors hover:bg-primary-50/40">
      {/* Badge de dependencia, coloreada por tipo */}
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

      {/* Acciones — siempre visibles en mobile (no hay hover),
          ocultas hasta hover/focus en desktop. */}
      {(onConfirmar || onCancelar) && (
        <div className="flex shrink-0 gap-3 text-xs font-medium opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {onConfirmar && (
            <button onClick={onConfirmar} className="text-ok-700 hover:underline">
              Confirmar
            </button>
          )}
          {onCancelar && (
            <button onClick={onCancelar} className="text-danger hover:underline">
              Cancelar
            </button>
          )}
        </div>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function TablazoCross() {
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

  const { turnos, isLoading, isFetching, error, updateEstado, cancel } = useTurnos({
    fecha,
    dependenciaId: dependenciaId || undefined,
    estado:        estado || undefined,
  })

  // Agrupamos por hora HH:MM. Si dos turnos tienen exactamente la
  // misma hora, quedan apilados bajo el mismo separador.
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
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Tablero de turnos</h1>
          <p className="text-sm text-primary-400">
            Lista por franja horaria · {fecha} · {total} turno{total === 1 ? '' : 's'}
            {isFetching && !isLoading && (
              <span className="ml-2 text-primary-300">(actualizando...)</span>
            )}
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
      </header>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los turnos: {error.message}
        </div>
      )}

      {isLoading && (
        <div className="card flex items-center justify-center p-12">
          <Spinner size="lg" />
        </div>
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
              {/* Separador de franja horaria */}
              <div className="mb-2 flex items-center gap-3">
                <p className="shrink-0 font-sora text-lg font-bold text-primary sm:text-xl">
                  {g.hora}
                </p>
                <div className="h-px flex-1 bg-border" aria-hidden="true" />
                <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-primary-400">
                  {g.turnos.length} turno{g.turnos.length === 1 ? '' : 's'}
                </p>
              </div>

              {/* Lista de turnos de la franja */}
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white shadow-card">
                {g.turnos.map(t => (
                  <TurnoRow
                    key={t.id}
                    turno={t}
                    onConfirmar={t.estado === 'pendiente' ? () => handleConfirmar(t.id) : null}
                    onCancelar={
                      t.estado !== 'cancelado' && t.estado !== 'completado'
                        ? () => handleCancelar(t.id)
                        : null
                    }
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
