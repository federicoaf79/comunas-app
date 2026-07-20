import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { dateTimeOf } from '../../lib/datetime'
import Input from '../ui/Input'
import Button from '../ui/Button'

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

// Intenta primero por numero_turno, después por DNI vía vecinos.
async function buscarTurnos(input) {
  const q = input.trim()
  if (!q) return []

  const COLS = `
    id, numero_turno, fecha, hora_inicio, estado, canal,
    dependencia:dependencia_id ( id, nombre )
  `

  // 1) por numero_turno (la columna podría ser int o text — PostgREST coerce).
  const { data: byNumero } = await supabase
    .from('turnos_agenda')
    .select(COLS)
    .eq('numero_turno', q)
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: false })
  if (byNumero && byNumero.length > 0) return byNumero

  // 2) por DNI: lookup vecino → turnos por vecino_id.
  const { data: vecino } = await supabase
    .from('vecinos')
    .select('id')
    .eq('dni', q)
    .limit(1)
  if (!vecino || vecino.length === 0) return []

  const { data: byDni } = await supabase
    .from('turnos_agenda')
    .select(COLS)
    .eq('vecino_id', vecino[0].id)
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: false })
    .limit(5)
  return byDni ?? []
}

export default function ConsultarTurnoFormPortal() {
  const [busqueda, setBusqueda] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [turnos, setTurnos] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!busqueda.trim()) return
    setError('')
    setSubmitting(true)
    setTurnos(null)
    try {
      const result = await buscarTurnos(busqueda)
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

      {turnos && turnos.length > 0 && (
        <ul className="mt-4 divide-y divide-border rounded-md border border-border">
          {turnos.map(t => {
            const dep = t.dependencia?.nombre ?? '—'
            return (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
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
      )}
    </div>
  )
}
