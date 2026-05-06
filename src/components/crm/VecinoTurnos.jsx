import { useParams } from 'react-router-dom'
import { useTurnosByVecino } from '../../hooks/useTurnos'
import Spinner from '../ui/Spinner'
import CanalBadge from '../turnos/CanalBadge'

const ESTADO_CLASS = {
  pendiente:  'badge-neutral',
  confirmado: 'badge-ok',
  en_curso:   'badge-accent',
  completado: 'badge-accent',
  cancelado:  'badge-danger',
}

const ESTADO_LABEL = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  en_curso:   'En curso',
  completado: 'Completado',
  cancelado:  'Cancelado',
}

function formatFechaHora(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return String(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function VecinoTurnos() {
  const { id: vecinoId } = useParams()
  const { turnos, isLoading, error } = useTurnosByVecino(vecinoId)

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center p-10">
        <Spinner size="lg" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
        No pudimos cargar los turnos: {error.message}
      </div>
    )
  }
  if (!turnos.length) {
    return (
      <div className="card p-10 text-center text-sm text-primary-400">
        Sin turnos registrados.
      </div>
    )
  }
  return (
    <div className="card divide-y divide-border p-0">
      {turnos.map(t => (
        <div key={t.id} className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary">
              {t.numero_turno ? `Turno #${t.numero_turno}` : 'Turno'}
            </p>
            <p className="mt-1 text-xs text-primary-400">
              {formatFechaHora(t.fecha_hora)}
              {t.dependencia_nombre ? ` · ${t.dependencia_nombre}` : ''}
              {t.profesional_nombre ? ` · ${t.profesional_nombre}` : ''}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className={ESTADO_CLASS[t.estado] ?? 'badge-neutral'}>
              {ESTADO_LABEL[t.estado] ?? t.estado}
            </span>
            {t.canal && <CanalBadge canal={t.canal} />}
          </div>
        </div>
      ))}
    </div>
  )
}
