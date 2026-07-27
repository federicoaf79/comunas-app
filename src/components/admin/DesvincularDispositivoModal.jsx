import { useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

// =============================================================
// DesvincularDispositivoModal — Vales Electrónicos, Fase 4 parte 2.
//
// Acción sensible (corta la operatoria de canje de un comercio desde
// la comuna) -- confirmación explícita explicando qué implica, no un
// window.confirm() genérico.
// =============================================================

export default function DesvincularDispositivoModal({ open, onClose, dispositivo, proveedorNombre, onConfirmar }) {
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleConfirmar() {
    setError('')
    setSaving(true)
    try {
      await onConfirmar()
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos desvincular el teléfono.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Desvincular teléfono"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="danger" onClick={handleConfirmar} loading={saving}>Sí, desvincular</Button>
        </>
      }
    >
      <div className="space-y-3">
        {dispositivo?.alias && (
          <p className="font-mono text-xs font-semibold text-primary">{dispositivo.alias}</p>
        )}
        <p className="text-sm text-primary-700">
          Este teléfono no va a poder canjear más vales de <strong>{proveedorNombre}</strong>.
          El responsable puede volver a vincularlo desde su celular.
        </p>

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">{error}</div>
        )}
      </div>
    </Modal>
  )
}
