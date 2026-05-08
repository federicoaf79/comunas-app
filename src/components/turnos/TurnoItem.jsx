import Avatar from '../ui/Avatar'
import CanalBadge from './CanalBadge'
import { timeOf } from '../../lib/datetime'

// Clases definidas en src/index.css — paleta unificada para
// accesibilidad daltónica. Cero verde.
const ESTADO_CLASS = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
  // Aliases legacy del mock data:
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

// Etiqueta amable para el vínculo familiar — el form guarda
// 'hijo'/'conyuge'/etc o un texto libre cuando se eligió "Otro".
const VINCULO_LABEL = {
  hijo:    'Hijo / Hija',
  conyuge: 'Cónyuge / Pareja',
  padre:   'Padre / Madre',
  hermano: 'Hermano / Hermana',
  abuelo:  'Abuelo / Abuela',
  nieto:   'Nieto / Nieta',
  otro:    'Otro familiar',
}

function vinculoLabel(v) {
  if (!v) return 'Familiar'
  return VINCULO_LABEL[v] ?? v
}

// Tooltip contenido — incluye nombre del familiar y vínculo cuando
// están disponibles. Se muestra como atributo `title` (acceso por hover/long-press).
function familiarTooltip(meta) {
  if (!meta?.para_familiar) return ''
  const partes = []
  if (meta.familiar_nombre) partes.push(meta.familiar_nombre)
  if (meta.vinculo)         partes.push(`(${vinculoLabel(meta.vinculo)})`)
  if (meta.familiar_edad)   partes.push(`· ${meta.familiar_edad} años`)
  if (meta.solicitante_nombre) partes.push(`\nSolicitó: ${meta.solicitante_nombre}`)
  return partes.length > 0 ? partes.join(' ') : 'Turno para un familiar'
}

export default function TurnoItem({ turno, showDependencia = false, onConfirmar, onCancelar }) {
  const v   = turno.vecino
  const dep = showDependencia
    ? (turno.dependencia_nombre ?? turno.dependencia?.nombre ?? null)
    : null
  const hora = timeOf(turno.fecha_hora)
  const profesional = turno.profesional_nombre ?? turno.profesional?.nombre ?? null
  const meta = turno.metadata ?? null
  const isFamiliar = !!meta?.para_familiar

  // Cuando es turno para un familiar, mostramos al familiar como
  // protagonista (es quien va a atenderse). El nombre del vecino
  // del registro (= el solicitante) queda como referencia abajo.
  const nombrePrincipal = isFamiliar
    ? (meta.familiar_nombre || vecinoDisplay(v))
    : vecinoDisplay(v)
  const avatarFor = isFamiliar
    ? (meta.familiar_nombre || vecinoAvatar(v))
    : vecinoAvatar(v)

  return (
    <li className="space-y-3 p-4">
      {/* Línea principal: hora + vecino + datos */}
      <div className="flex items-start gap-4">
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold leading-none text-primary">{hora || '—'}</p>
          {turno.numero_turno && (
            <p className="mt-1 text-xs font-medium text-primary-400">
              Turno #{turno.numero_turno}
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Avatar name={avatarFor} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-primary">
              {nombrePrincipal}
            </p>
            {isFamiliar && v && (
              <p className="mt-0.5 text-xs text-primary-400">
                Solicitó: {vecinoDisplay(v)}
              </p>
            )}
            {profesional && (
              <p className="mt-0.5 text-xs text-primary-400">{profesional}</p>
            )}
            {dep && (
              <p className="text-xs text-primary-400">{dep}</p>
            )}
          </div>
        </div>
      </div>

      {/* Fila inferior: badges + acciones */}
      <div className="flex flex-wrap items-center gap-2 pl-1">
        <span className={ESTADO_CLASS[turno.estado] ?? 'estado-pendiente'}>
          {ESTADO_LABEL[turno.estado] ?? turno.estado}
        </span>
        {turno.canal && <CanalBadge canal={turno.canal} />}
        {isFamiliar && (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-100"
            title={familiarTooltip(meta)}
          >
            <span aria-hidden="true">👨‍👩‍👧</span>
            Familiar
            {meta.vinculo && (
              <span className="ml-1 hidden text-[10px] font-normal uppercase tracking-wide text-accent-700/80 sm:inline">
                · {vinculoLabel(meta.vinculo)}
              </span>
            )}
          </span>
        )}
        {(onConfirmar || onCancelar) && (
          <div className="ml-auto flex gap-3 text-xs font-medium">
            {onConfirmar && (
              <button onClick={onConfirmar} className="text-ok-700 hover:underline">
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
    </li>
  )
}
