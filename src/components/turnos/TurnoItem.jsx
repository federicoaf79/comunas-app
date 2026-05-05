import { vecinoById, dependenciaById } from '../../lib/mockData'
import Avatar from '../ui/Avatar'

const ESTADO = {
  reservado:  'badge-neutral',
  confirmado: 'badge-ok',
  atendido:   'badge-accent',
  ausente:    'badge-danger',
  cancelado:  'badge-danger',
}

export default function TurnoItem({ turno, showDependencia = false }) {
  const v = vecinoById(turno.vecino_id)
  const dep = showDependencia ? dependenciaById(turno.dependencia_id) : null

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="w-12 shrink-0 text-sm font-semibold text-primary">{turno.hora}</span>
      <Avatar name={`${v?.nombre} ${v?.apellido}`} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-primary-700">
          {v?.apellido}, {v?.nombre}
        </p>
        <p className="truncate text-xs text-primary-400">
          {turno.motivo}
          {turno.medico ? ` · ${turno.medico}` : ''}
          {dep ? ` · ${dep.nombre}` : ''}
        </p>
      </div>
      <span className={ESTADO[turno.estado] ?? 'badge-neutral'}>{turno.estado}</span>
    </li>
  )
}
