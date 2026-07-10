import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'
import { useReclamosVecino } from '../../hooks/useReclamos'
import Spinner from '../../components/ui/Spinner'

const ESTADO_BADGES = {
  pendiente:   { bg: 'bg-[#0F1C35]', text: 'text-white', ring: 'ring-[#0F1C35]/20', label: 'Pendiente' },
  en_proceso:  { bg: 'bg-[#1D4ED8]', text: 'text-white', ring: 'ring-blue-200', label: 'En proceso' },
  resuelto:    { bg: 'bg-[#1e40af]', text: 'text-white', ring: 'ring-blue-300', label: 'Resuelto' },
  abierto:     { bg: 'bg-[#0F1C35]', text: 'text-white', ring: 'ring-[#0F1C35]/20', label: 'Abierto' },
  cerrado:     { bg: 'bg-slate-500', text: 'text-white', ring: 'ring-slate-200', label: 'Cerrado' },
  rechazado:   { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-200', label: 'Rechazado' },
}

const TIPO_LABELS = {
  escombros:    'Escombros',
  ramas:        'Ramas y poda',
  restos_poda:  'Residuo de gran tamaño',
  otro:         'Otro',
}

function ReclamoCard({ reclamo, onClick }) {
  const badge = ESTADO_BADGES[reclamo.estado] || ESTADO_BADGES.pendiente
  const tipoLabel = TIPO_LABELS[reclamo.tipo] || reclamo.tipo

  const fechaFormateada = new Date(reclamo.created_at).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const primeraFoto = reclamo.fotos_urls?.[0]

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md"
    >
      <div className="flex gap-4">
        {/* Foto thumbnail */}
        {primeraFoto ? (
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border">
            <img src={primeraFoto} alt="Foto del reclamo" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-border bg-primary-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 text-primary-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        )}

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ring-1 ring-inset ${badge.bg} ${badge.text} ${badge.ring}`}>
              {badge.label}
            </span>
            <span className="text-xs text-primary-500">{fechaFormateada}</span>
          </div>
          <p className="mb-1 text-sm font-semibold text-primary">{tipoLabel}</p>
          <p className="mb-2 text-xs text-primary-600">{reclamo.ubicacion}</p>
          <p className="line-clamp-2 text-xs text-primary-500">{reclamo.descripcion}</p>
        </div>
      </div>
    </button>
  )
}

function ReclamoDetalleModal({ reclamo, onClose }) {
  if (!reclamo) return null

  const badge = ESTADO_BADGES[reclamo.estado] || ESTADO_BADGES.pendiente
  const tipoLabel = TIPO_LABELS[reclamo.tipo] || reclamo.tipo

  const fechaFormateada = new Date(reclamo.created_at).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/50 px-4 py-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-sora text-lg font-bold text-primary">Detalle del reclamo</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-primary-400 transition-colors hover:bg-primary-50 hover:text-primary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="space-y-6 p-6">
          {/* Estado y fecha */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide ring-1 ring-inset ${badge.bg} ${badge.text} ${badge.ring}`}>
              {badge.label}
            </span>
            <span className="text-sm text-primary-600 capitalize">{fechaFormateada}</span>
          </div>

          {/* Tipo y ubicación */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Tipo</p>
            <p className="mt-1 text-base font-semibold text-primary">{tipoLabel}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Dirección</p>
            <p className="mt-1 text-base text-primary-700">{reclamo.ubicacion}</p>
          </div>

          {/* Descripción */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Descripción</p>
            <p className="mt-1 text-sm text-primary-700 whitespace-pre-wrap">{reclamo.descripcion}</p>
          </div>

          {/* Fotos */}
          {reclamo.fotos_urls && reclamo.fotos_urls.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary-500">Fotos</p>
              <div className="grid grid-cols-2 gap-3">
                {reclamo.fotos_urls.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border"
                  >
                    <img src={url} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-border bg-white px-6 py-2.5 font-sora text-sm font-semibold text-primary transition-colors hover:bg-primary-50 sm:w-auto"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MisReclamosPortal() {
  const { vecino } = useVecino()
  const navigate = useNavigate()
  const { data: reclamos = [], isLoading } = useReclamosVecino(vecino?.id)
  const [reclamoSeleccionado, setReclamoSeleccionado] = useState(null)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F4EF]">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F4EF] py-8 px-4">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-sora text-2xl font-bold text-primary">Mis reclamos</h1>
            <p className="mt-1 text-sm text-primary-600">
              {reclamos.length} reclamo{reclamos.length === 1 ? '' : 's'} realizados
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/portal/reclamos/nuevo')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2.5 font-sora text-sm font-semibold text-white transition-colors hover:bg-[#1e40af]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            Nuevo reclamo
          </button>
        </div>

        {/* Lista */}
        {reclamos.length === 0 ? (
          <div className="rounded-xl border border-border bg-white p-12 text-center shadow-card">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto h-12 w-12 text-primary-300">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-4 text-sm font-semibold text-primary">Aún no hiciste ningún reclamo</p>
            <p className="mt-1 text-xs text-primary-500">Reportá escombros o residuos en la vía pública</p>
            <button
              type="button"
              onClick={() => navigate('/portal/reclamos/nuevo')}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2.5 font-sora text-sm font-semibold text-white transition-colors hover:bg-[#1e40af]"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
              </svg>
              Hacer mi primer reclamo
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {reclamos.map(reclamo => (
              <ReclamoCard
                key={reclamo.id}
                reclamo={reclamo}
                onClick={() => setReclamoSeleccionado(reclamo)}
              />
            ))}
          </div>
        )}

        {/* Modal detalle */}
        {reclamoSeleccionado && (
          <ReclamoDetalleModal
            reclamo={reclamoSeleccionado}
            onClose={() => setReclamoSeleccionado(null)}
          />
        )}
      </div>
    </div>
  )
}
