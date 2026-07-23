import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useTurnosByVecino } from '../../hooks/useTurnos'
import { dateTimeOf, ARG_OFFSET } from '../../lib/datetime'
import Spinner from '../ui/Spinner'
import CanalBadge from '../turnos/CanalBadge'

// Clases en src/index.css — paleta unificada (cero verde).
const ESTADO_CLASS = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
  reservado:  'estado-pendiente',
  atendido:   'estado-atendido',
  ausente:    'estado-cancelado',
}

const ESTADO_LABEL = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  en_curso:   'En curso',
  completado: 'Completado',
  cancelado:  'Cancelado',
}

export default function VecinoTurnos() {
  const { id: vecinoId } = useParams()
  const { turnos: turnosRaw, isLoading, error } = useTurnosByVecino(vecinoId)

  // turnos_agenda no tiene columna fecha_hora — solo fecha + hora_inicio
  // por separado (mismo fix ya aplicado en SalaPrimerosAuxilios.jsx /
  // CicSalud.jsx). Sin esto, dateTimeOf(t.fecha_hora) siempre daba '—'.
  const turnos = useMemo(() => (turnosRaw ?? []).map(t => ({
    ...t,
    fecha_hora: t.fecha && t.hora_inicio ? `${t.fecha}T${t.hora_inicio}${ARG_OFFSET}` : undefined,
  })), [turnosRaw])

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
      {turnos.map(t => {
        const dependenciaNombre = t.dependencia_nombre ?? t.dependencia?.nombre
        const profesionalNombre = t.profesional_nombre ?? t.profesional?.nombre
        // Título: dependencia/especialidad real del turno en vez del
        // label genérico "Turno" repetido en cada fila (hallazgo de
        // la auditoría de UX 2026-07-23) — numero_turno como último
        // fallback, para cuando ninguno de los dos está cargado.
        const titulo = dependenciaNombre || t.especialidad
          || (t.numero_turno ? `Turno #${t.numero_turno}` : 'Turno')
        return (
          <div key={t.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-primary">{titulo}</p>
              <p className="mt-1 text-xs text-primary-400">
                {dateTimeOf(t.fecha_hora)}
                {t.especialidad && t.especialidad !== titulo ? ` · ${t.especialidad}` : ''}
                {profesionalNombre ? ` · ${profesionalNombre}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={ESTADO_CLASS[t.estado] ?? 'estado-pendiente'}>
                {ESTADO_LABEL[t.estado] ?? t.estado}
              </span>
              {t.canal && <CanalBadge canal={t.canal} />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
