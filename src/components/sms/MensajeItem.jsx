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

// El vecino ya viene resuelto en `mensaje.vecino` (embed de la query
// real en Mensajeria.jsx, o simplemente ausente cuando el caller no
// lo necesita — ver VecinoMensajes.jsx, que llama con
// showVecino={false} porque ya está parado en la ficha de ESE
// vecino). Ya no se resuelve acá por lookup propio.
function vecinoLabel(v) {
  if (!v) return null
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || null
}

// `direction` no tiene un vocabulario confirmado todavía (la tabla
// real está vacía) — se acepta cualquier variante razonable de
// "entrante" en vez de asumir un único valor exacto.
function esEntrante(direction) {
  const d = (direction ?? '').toLowerCase()
  return d === 'in' || d === 'inbound' || d === 'entrante'
}

export default function MensajeItem({ mensaje, showVecino = true }) {
  const nombreVecino = showVecino ? vecinoLabel(mensaje.vecino) : null

  return (
    <li className="px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CanalBadge canal={mensaje.canal} />
          <span className="text-xs text-primary-400">
            {esEntrante(mensaje.direction) ? 'Entrante' : 'Saliente'}
          </span>
          {nombreVecino && (
            <span className="text-xs font-medium text-primary-700">
              · {nombreVecino}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={ESTADO_CLASS[mensaje.estado] ?? 'msg-queued'}>
            {mensaje.estado || '—'}
          </span>
          <span className="text-xs text-primary-400">{(mensaje.fecha ?? '').replace('T', ' · ')}</span>
        </div>
      </div>
      <p className="mt-1.5 text-sm text-primary-700">
        {mensaje.mensaje || <span className="italic text-primary-300">(sin texto)</span>}
      </p>
      {mensaje.error && (
        <p className="mt-1 text-xs text-danger">Error: {mensaje.error}</p>
      )}
    </li>
  )
}
