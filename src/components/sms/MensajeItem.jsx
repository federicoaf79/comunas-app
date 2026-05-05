import { vecinoById } from '../../lib/mockData'

const ESTADO = {
  queued:    'badge-neutral',
  sent:      'badge-neutral',
  delivered: 'badge-ok',
  received:  'badge-ok',
  failed:    'badge-danger',
}

export default function MensajeItem({ mensaje, showVecino = true }) {
  const v = showVecino ? vecinoById(mensaje.vecino_id) : null
  const isWA = mensaje.canal === 'whatsapp'

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              isWA ? 'bg-accent-50 text-accent-700' : 'bg-primary-50 text-primary'
            }`}
          >
            {isWA ? 'WhatsApp' : 'SMS'}
          </span>
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
          <span className={ESTADO[mensaje.estado] ?? 'badge-neutral'}>{mensaje.estado}</span>
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
