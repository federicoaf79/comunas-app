import { vecinoById } from '../../lib/mockData'
import CanalBadge from '../turnos/CanalBadge'

// Clases en src/index.css — paleta unificada para accesibilidad
// daltónica. Cero verde.
const ESTADO_CLASS = {
  queued:    'msg-queued',
  sent:      'msg-sent',
  delivered: 'msg-delivered',
  received:  'msg-received',
  failed:    'msg-failed',
  // alias por si llega 'undelivered' del provider
  undelivered: 'msg-failed',
}

export default function MensajeItem({ mensaje, showVecino = true }) {
  const v = showVecino ? vecinoById(mensaje.vecino_id) : null

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CanalBadge canal={mensaje.canal} />
          <span className="text-xs text-primary-400">
            {mensaje.direction === 'in' ? 'Entrante' : 'Saliente'}
          </span>
          {v && (
            <span className="text-xs font-medium text-primary-700">
              · {v.apellido}, {v.nombre}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={ESTADO_CLASS[mensaje.estado] ?? 'msg-queued'}>
            {mensaje.estado}
          </span>
          <span className="text-xs text-primary-400">{mensaje.fecha.replace('T', ' · ')}</span>
        </div>
      </div>
      <p className="mt-1.5 text-sm text-primary-700">{mensaje.mensaje}</p>
      {mensaje.error && (
        <p className="mt-1 text-xs text-danger">Error: {mensaje.error}</p>
      )}
    </li>
  )
}
