import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { dateTimeOf } from '../../lib/datetime'
import { usePortalMunicipioId } from '../../hooks/useConfigPortal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import Modal from '../ui/Modal'

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

// Intenta primero por numero_turno, después por DNI vía RPC function.
// La RPC bypassa RLS de vecinos (SECURITY DEFINER) para permitir búsqueda
// pública sin exponer la tabla vecinos directamente.
async function buscarTurnos(input, municipioId) {
  const q = input.trim()
  if (!q || !municipioId) return []

  const COLS = `
    id, numero_turno, fecha, hora_inicio, hora_fin, estado, canal,
    motivo, notas_vecino, direccion,
    dependencia:dependencia_id ( id, nombre )
  `

  // 1) por numero_turno (la columna podría ser int o text — PostgREST coerce).
  //    Filtrar por municipio_id para scopear la búsqueda al portal actual.
  const { data: byNumero } = await supabase
    .from('turnos_agenda')
    .select(COLS)
    .eq('numero_turno', q)
    .eq('municipio_id', municipioId)
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: false })
  if (byNumero && byNumero.length > 0) return byNumero

  // 2) por DNI: usar RPC function que hace el lookup internamente con SECURITY DEFINER.
  //    Pasar municipio_id para scopear la búsqueda al portal actual.
  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('buscar_turnos_por_dni', { p_dni: q, p_municipio_id: municipioId })

  if (rpcError) {
    console.warn('[ConsultarTurno] RPC error:', rpcError.message)
    return []
  }
  if (!rpcResult || rpcResult.length === 0) return []

  // La RPC devuelve turnos con dependencia_id pero sin el join embed.
  // Necesitamos traer los nombres de dependencias para la UI.
  const depIds = [...new Set(rpcResult.map(t => t.dependencia_id).filter(Boolean))]
  let depsMap = {}
  if (depIds.length > 0) {
    const { data: deps } = await supabase
      .from('dependencias')
      .select('id, nombre')
      .in('id', depIds)
    if (deps) {
      depsMap = Object.fromEntries(deps.map(d => [d.id, d]))
    }
  }

  // Mapear resultado RPC al formato esperado por la UI (con embed de dependencia)
  return rpcResult.map(t => ({
    ...t,
    dependencia: depsMap[t.dependencia_id] || null,
  }))
}

export default function ConsultarTurnoFormPortal() {
  const portalMunicipioQ = usePortalMunicipioId()
  const municipioId = portalMunicipioQ.data ?? null

  const [busqueda, setBusqueda] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [turnos, setTurnos] = useState(null)
  const [turnoSeleccionado, setTurnoSeleccionado] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!busqueda.trim()) return
    if (!municipioId) {
      setError('No pudimos identificar el municipio. Recargá la página.')
      return
    }
    setError('')
    setSubmitting(true)
    setTurnos(null)
    try {
      const result = await buscarTurnos(busqueda, municipioId)
      setTurnos(result)
    } catch (e) {
      setError(e?.message ?? 'No pudimos consultar tu turno.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card p-5">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="DNI o número de turno"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Ej: 32145678"
            className="flex-1"
            inputMode="numeric"
            autoComplete="off"
          />
          <div className="flex flex-col gap-1">
            <Button type="submit" loading={submitting} disabled={!busqueda.trim()}>
              Consultar
            </Button>
            {!busqueda.trim() && (
              <p className="text-xs text-primary-400">Completá el campo para continuar</p>
            )}
          </div>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
          {error}
        </div>
      )}

      {turnos !== null && !error && turnos.length === 0 && (
        <div className="mt-4 rounded-md border border-border bg-primary-50 p-3 text-sm text-primary-500">
          No encontramos turnos con ese DNI o número. Verificá los datos o sacá uno nuevo arriba.
        </div>
      )}

      {turnos && turnos.length > 0 && (() => {
        const activos = turnos.filter(t => t.estado === 'pendiente' || t.estado === 'confirmado')
        const historial = turnos.filter(t => t.estado === 'atendido' || t.estado === 'cancelado')

        return (
          <>
            {/* Sección: Turnos activos */}
            {activos.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-3 text-sm font-semibold text-primary">Turnos activos</h3>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {activos.map(t => {
                    const dep = t.dependencia?.nombre ?? '—'
                    return (
                      <li
                        key={t.id}
                        onClick={() => setTurnoSeleccionado(t)}
                        className="flex cursor-pointer flex-wrap items-start justify-between gap-3 p-4 transition-colors hover:bg-primary-50"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-primary">
                            {t.numero_turno ? `Turno #${t.numero_turno}` : 'Turno'}
                          </p>
                          <p className="mt-1 text-xs text-primary-400">
                            {t.fecha} {t.hora_inicio} · {dep}
                          </p>
                        </div>
                        <span className={ESTADO_CLASS[t.estado] ?? 'estado-pendiente'}>
                          {ESTADO_LABEL[t.estado] ?? t.estado}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* Sección: Historial (lista condensada) */}
            {historial.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold text-primary">Historial</h3>
                <ul className="divide-y divide-border rounded-md border border-border">
                  {historial.map(t => {
                    const dep = t.dependencia?.nombre ?? '—'
                    return (
                      <li
                        key={t.id}
                        onClick={() => setTurnoSeleccionado(t)}
                        className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-xs transition-colors hover:bg-primary-50"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-primary">
                            {t.numero_turno ? `#${t.numero_turno}` : 'Turno'}
                          </span>
                          <span className="ml-2 text-primary-400">
                            {t.fecha} · {dep}
                          </span>
                        </div>
                        <span className={ESTADO_CLASS[t.estado] ?? 'estado-pendiente'}>
                          {ESTADO_LABEL[t.estado] ?? t.estado}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </>
        )
      })()}

      {/* Modal de detalle */}
      <Modal
        open={!!turnoSeleccionado}
        onClose={() => setTurnoSeleccionado(null)}
        title={turnoSeleccionado?.numero_turno ? `Turno #${turnoSeleccionado.numero_turno}` : 'Detalle del turno'}
        size="md"
      >
        {turnoSeleccionado && (
          <div className="space-y-4 p-5">
            {/* Dependencia */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Dependencia</p>
              <p className="mt-1 text-sm text-primary">{turnoSeleccionado.dependencia?.nombre ?? '—'}</p>
            </div>

            {/* Fecha y hora */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Fecha</p>
                <p className="mt-1 text-sm text-primary">{turnoSeleccionado.fecha ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Horario</p>
                <p className="mt-1 text-sm text-primary">
                  {turnoSeleccionado.hora_inicio ?? '—'}
                  {turnoSeleccionado.hora_fin && ` - ${turnoSeleccionado.hora_fin}`}
                </p>
              </div>
            </div>

            {/* Estado */}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Estado</p>
              <div className="mt-1">
                <span className={ESTADO_CLASS[turnoSeleccionado.estado] ?? 'estado-pendiente'}>
                  {ESTADO_LABEL[turnoSeleccionado.estado] ?? turnoSeleccionado.estado}
                </span>
              </div>
            </div>

            {/* Motivo */}
            {turnoSeleccionado.motivo && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Motivo</p>
                <p className="mt-1 text-sm text-primary">{turnoSeleccionado.motivo}</p>
              </div>
            )}

            {/* Notas / Detalle */}
            {turnoSeleccionado.notas_vecino && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Notas / Detalle</p>
                <p className="mt-1 text-sm text-primary">{turnoSeleccionado.notas_vecino}</p>
              </div>
            )}

            {/* Dirección (solo Agencia de Desarrollo) */}
            {turnoSeleccionado.direccion && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Dirección</p>
                <p className="mt-1 text-sm text-primary">{turnoSeleccionado.direccion}</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
