import Avatar from '../ui/Avatar'
import CanalBadge from './CanalBadge'
import { timeOf } from '../../lib/datetime'

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

function vecinoDisplay(v) {
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

function vecinoAvatar(v) {
  if (!v) return '?'
  if (v.nombre && v.apellido) return `${v.nombre} ${v.apellido}`
  return v.nombre_completo || v.apellido || v.nombre || '?'
}

export default function TurnoItem({ turno, showDependencia = false, onConfirmar, onCancelar }) {
  const v   = turno.vecino
  const dep = showDependencia
    ? (turno.dependencia_nombre ?? turno.dependencia?.nombre ?? null)
    : null
  const hora = timeOf(turno.fecha_hora)
  const profesional = turno.profesional_nombre ?? turno.profesional?.nombre ?? null

  const meta = [
    turno.numero_turno ? `Turno #${turno.numero_turno}` : null,
    profesional,
    dep,
  ].filter(Boolean).join(' · ')

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className="w-12 shrink-0 text-sm font-semibold text-primary">{hora || '—'}</span>
      <Avatar name={vecinoAvatar(v)} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-primary-700">
          {vecinoDisplay(v)}
        </p>
        {meta && <p className="truncate text-xs text-primary-400">{meta}</p>}
        {(onConfirmar || onCancelar) && (
          <div className="mt-2 flex gap-3 text-xs font-medium">
            {onConfirmar && (
              <button onClick={onConfirmar} className="text-ok hover:underline">
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
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={ESTADO_CLASS[turno.estado] ?? 'badge-neutral'}>
          {ESTADO_LABEL[turno.estado] ?? turno.estado}
        </span>
        {turno.canal && <CanalBadge canal={turno.canal} />}
      </div>
    </li>
  )
}
