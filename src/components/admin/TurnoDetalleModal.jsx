import { useState } from 'react'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'

// =============================================================
// TurnoDetalleModal — modal de detalle y acciones de un turno.
//
// Muestra información completa del turno seleccionado desde el
// Tablero de Turnos (TablazoCross.jsx). Permite confirmar o
// cancelar el turno con confirmación previa.
//
// Paleta COMUNAS: Navy #0F1C35, Gold #C9A84C, BG #F5F4EF.
// Font: Sora.
// =============================================================

// Clases de badge por estado
const ESTADO_BADGES = {
  pendiente:  'bg-[#0F1C35] text-white ring-1 ring-inset ring-[#0F1C35]/20',
  confirmado: 'bg-[#1D4ED8] text-white ring-1 ring-inset ring-blue-200',
  cancelado:  'bg-red-100 text-red-700 ring-1 ring-inset ring-red-200',
  atendido:   'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  ausente:    'bg-orange-100 text-orange-700 ring-1 ring-inset ring-orange-200',
}

const ESTADO_LABELS = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  cancelado:  'Cancelado',
  atendido:   'Atendido',
  ausente:    'Ausente',
}

const CANAL_BADGES = {
  whatsapp:   'bg-purple-100 text-purple-700 ring-1 ring-inset ring-purple-200',
  online:     'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  presencial: 'bg-[#C9A84C] text-[#0F1C35] ring-1 ring-inset ring-[#C9A84C]/30',
}

const CANAL_LABELS = {
  whatsapp:   'WhatsApp',
  online:     'Online',
  presencial: 'Presencial',
}

export default function TurnoDetalleModal({ turno, isOpen, onClose, onConfirmar, onCancelar }) {
  const [isConfirming, setIsConfirming] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  if (!turno) return null

  const estado = (turno.estado ?? 'pendiente').toLowerCase()
  const canal = (turno.canal ?? 'presencial').toLowerCase()

  const vecinoNombre = turno.vecino?.nombre_completo
    || (turno.vecino?.nombre && turno.vecino?.apellido ? `${turno.vecino.nombre} ${turno.vecino.apellido}` : null)
    || turno.vecino?.nombre
    || '—'

  const vecinoDNI = turno.vecino?.dni || null
  const vecinoTelefono = turno.vecino?.telefono || null

  const profesionalNombre = turno.profesional?.nombre || turno.profesional_nombre || '—'
  const dependenciaNombre = turno.dependencia?.nombre || turno.dependencia_nombre || '—'

  const fechaFormateada = turno.fecha
    ? new Date(turno.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '—'

  const horaInicio = turno.hora_inicio || '—'
  const horaFin = turno.hora_fin || '—'

  const motivo = turno.motivo || null
  const ordenMedicaUrl = turno.orden_medica_url || null
  const ordenMedicaNombre = turno.orden_medica_nombre || 'Orden médica'
  const numeroTurno = turno.numero_turno || null

  const canConfirmar = estado === 'pendiente' && onConfirmar
  const canCancelar = estado !== 'cancelado' && estado !== 'atendido' && onCancelar

  async function handleConfirmar() {
    if (!onConfirmar) return
    setIsConfirming(true)
    try {
      await onConfirmar(turno.id)
      onClose()
    } catch (e) {
      alert(`No se pudo confirmar: ${e.message}`)
    } finally {
      setIsConfirming(false)
    }
  }

  async function handleCancelar() {
    if (!onCancelar) return
    if (!confirm('¿Estás seguro de que querés cancelar este turno?')) return
    setIsCancelling(true)
    try {
      await onCancelar(turno.id)
      onClose()
    } catch (e) {
      alert(`No se pudo cancelar: ${e.message}`)
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title="Detalle del turno"
      size="lg"
    >
      <div className="space-y-5">
        {/* Estado y canal */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
              ESTADO_BADGES[estado] || ESTADO_BADGES.pendiente
            }`}
          >
            {ESTADO_LABELS[estado] || estado}
          </span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              CANAL_BADGES[canal] || CANAL_BADGES.presencial
            }`}
          >
            {canal === 'whatsapp' && (
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
            )}
            {canal === 'online' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            )}
            {canal === 'presencial' && (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                <path d="M9 22V12h6v10" />
              </svg>
            )}
            {CANAL_LABELS[canal] || canal}
          </span>
          {numeroTurno && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-3 py-1 text-xs font-bold text-primary ring-1 ring-inset ring-primary/10">
              #{numeroTurno}
            </span>
          )}
        </div>

        {/* Vecino */}
        <div className="rounded-xl border border-border bg-[#F5F4EF] p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary-500">Vecino</p>
          <p className="font-sora text-lg font-bold text-primary">{vecinoNombre}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-primary-600">
            {vecinoDNI && (
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-primary-400">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                </svg>
                DNI {vecinoDNI}
              </span>
            )}
            {vecinoTelefono && (
              <span className="inline-flex items-center gap-1.5">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-primary-400">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                </svg>
                {vecinoTelefono}
              </span>
            )}
          </div>
        </div>

        {/* Profesional y dependencia */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-white p-4">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-primary-500">Profesional</p>
            <p className="text-base font-semibold text-primary">{profesionalNombre}</p>
          </div>
          <div className="rounded-xl border border-border bg-white p-4">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-primary-500">Dependencia</p>
            <p className="text-base font-semibold text-primary">{dependenciaNombre}</p>
          </div>
        </div>

        {/* Fecha y hora */}
        <div className="rounded-xl border border-border bg-white p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-primary-500">Fecha y hora</p>
          <p className="font-sora text-base font-bold capitalize text-primary">{fechaFormateada}</p>
          <p className="mt-1 text-sm text-primary-600">
            {horaInicio} a {horaFin}
          </p>
        </div>

        {/* Motivo */}
        {motivo && (
          <div className="rounded-xl border border-border bg-white p-4">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-primary-500">Motivo</p>
            <p className="text-sm text-primary-700">{motivo}</p>
          </div>
        )}

        {/* Orden médica */}
        {ordenMedicaUrl && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-blue-700">Orden médica adjunta</p>
            <a
              href={ordenMedicaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:underline"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z" />
                <path d="M13 2v7h7" />
              </svg>
              {ordenMedicaNombre}
            </a>
          </div>
        )}
      </div>

      {/* Botones de acción */}
      <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          disabled={isConfirming || isCancelling}
          className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cerrar
        </button>
        {canCancelar && (
          <button
            type="button"
            onClick={handleCancelar}
            disabled={isConfirming || isCancelling}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-100 px-4 py-2 font-sora text-sm font-semibold text-red-700 transition-colors hover:bg-red-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCancelling && <Spinner size="sm" />}
            Cancelar turno
          </button>
        )}
        {canConfirmar && (
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={isConfirming || isCancelling}
            className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConfirming && <Spinner size="sm" />}
            Confirmar turno
          </button>
        )}
      </div>
    </Modal>
  )
}
