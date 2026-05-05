import { dependenciaById } from '../../lib/mockData'

const ESTADO = {
  reservado:  'badge-neutral',
  confirmado: 'badge-ok',
  atendido:   'badge-accent',
  ausente:    'badge-danger',
  cancelado:  'badge-danger',
}

export default function VecinoTurnos({ turnos }) {
  if (!turnos?.length) {
    return (
      <div className="card p-10 text-center text-sm text-primary-400">
        Sin turnos registrados.
      </div>
    )
  }
  return (
    <div className="card divide-y divide-border p-0">
      {turnos.map(t => {
        const dep = dependenciaById(t.dependencia_id)
        return (
          <div key={t.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-primary">{t.motivo}</p>
              <p className="mt-1 text-xs text-primary-400">
                {t.fecha} · {t.hora} · {dep?.nombre}
                {t.medico ? ` · ${t.medico}` : ''}
              </p>
            </div>
            <span className={ESTADO[t.estado] ?? 'badge-neutral'}>{t.estado}</span>
          </div>
        )
      })}
    </div>
  )
}
