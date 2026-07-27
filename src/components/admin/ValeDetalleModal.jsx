import Modal from '../ui/Modal'
import { EstadoBadge } from './EstadoBadgeVale'
import { dateTimeOf } from '../../lib/datetime'

// =============================================================
// ValeDetalleModal — Vales Electrónicos, Fase 4 parte 1.
//
// Detalle de solo lectura de un vale. El bloque de anulación (motivo,
// fecha, quién anuló) solo se muestra si estado === 'cancelado' --
// para el resto de los estados esos 3 campos vienen null.
// =============================================================

function detalleVale(v) {
  if (v.monto != null) return `$${Number(v.monto).toLocaleString('es-AR')}`
  if (v.cantidad != null) return `${v.cantidad} ${v.unidad ?? ''}`.trim()
  return '—'
}

function Bloque({ titulo, children }) {
  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-primary-500">{titulo}</p>
      {children}
    </div>
  )
}

export default function ValeDetalleModal({ open, onClose, vale }) {
  if (!vale) return null

  return (
    <Modal open={open} onClose={onClose} title="Detalle del vale" size="lg">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-semibold text-primary">{vale.codigo}</span>
          <EstadoBadge estado={vale.estado} />
        </div>

        <Bloque titulo="Beneficiario">
          <p className="font-sora text-base font-bold text-primary">
            {vale.vecino?.nombre_completo ?? '—'}
          </p>
          <p className="mt-0.5 text-sm text-primary-500">DNI {vale.vecino?.dni ?? '—'}</p>
        </Bloque>

        <div className="grid gap-4 sm:grid-cols-2">
          <Bloque titulo="Comercio">
            <p className="text-base font-semibold text-primary">{vale.proveedor?.nombre ?? '—'}</p>
          </Bloque>
          <Bloque titulo="Importe">
            <p className="text-base font-semibold text-primary">{detalleVale(vale)}</p>
          </Bloque>
        </div>

        <Bloque titulo="Descripción">
          <p className="text-sm text-primary-700">{vale.descripcion || '—'}</p>
        </Bloque>

        <div className="grid gap-4 sm:grid-cols-2">
          <Bloque titulo="Emitido">
            <p className="text-sm text-primary-700">{dateTimeOf(vale.emitido_en)}</p>
            <p className="mt-0.5 text-xs text-primary-400">por {vale.emisor?.nombre ?? '—'}</p>
          </Bloque>
          {vale.estado === 'canjeado' && (
            <Bloque titulo="Canjeado">
              <p className="text-sm text-primary-700">{dateTimeOf(vale.canjeado_en)}</p>
              <p className="mt-0.5 text-xs text-primary-400">por {vale.canjeador?.nombre_completo ?? '—'}</p>
            </Bloque>
          )}
        </div>

        {vale.estado === 'cancelado' && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-red-700">
              Anulado
            </p>
            <p className="text-sm text-red-800">{vale.motivo_anulacion || '—'}</p>
            <p className="mt-2 text-xs text-red-700/80">
              {dateTimeOf(vale.anulado_en)} · por {vale.anulador?.nombre ?? '—'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}
