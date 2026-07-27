import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

// =============================================================
// AnularValeModal — Vales Electrónicos, Fase 4 parte 1.
//
// Solo se abre para vales en estado 'emitido' (el botón que lo
// dispara ya filtra eso en ValesEmitidos.jsx). Motivo obligatorio --
// el RPC anular_vale() lo exige igual del lado del server, pero acá
// se deshabilita el botón para no hacerle pegar el viaje al usuario
// por un motivo vacío.
//
// Si el RPC rechaza (ej. el vale se abrió entre que se cargó la
// lista y se apretó "Confirmar anulación" -- el vecino ya está en
// el mostrador), se muestra e.message tal cual, sin traducir.
// =============================================================

export default function AnularValeModal({ open, onClose, vale, onAnular }) {
  const [motivo, setMotivo]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!open) return
    setMotivo('')
    setError('')
  }, [open])

  const canSubmit = motivo.trim().length > 0 && !saving

  async function handleConfirmar() {
    if (!canSubmit) return
    setError('')
    setSaving(true)
    try {
      await onAnular(motivo.trim())
      onClose?.()
    } catch (e) {
      setError(e?.message ?? 'No pudimos anular el vale.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Anular vale"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="danger" onClick={handleConfirmar} loading={saving} disabled={!canSubmit}>
            Confirmar anulación
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-md border border-border bg-[#F5F4EF] p-3 text-sm">
          <p className="font-mono text-xs font-semibold text-primary">{vale?.codigo}</p>
          <p className="mt-1 text-primary-600">
            {vale?.vecino?.nombre_completo ?? '—'} · {vale?.proveedor?.nombre ?? '—'}
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Motivo de la anulación
          </label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            className="input-field resize-none"
            placeholder="Ej: emitido por error, el beneficiario no correspondía…"
            autoFocus
          />
        </div>

        <p className="text-xs text-primary-400">
          El vale pasa a estado <span className="font-semibold">Cancelado</span> y deja de poder
          canjearse. Esta acción no se puede deshacer.
        </p>

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
