import { useState } from 'react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

// =============================================================
// DesactivarAccesoModal — Vales Electrónicos, Fase 4 parte 2.
//
// Reemplaza el confirm() nativo -- el texto tiene que decir qué
// implica DE VERDAD, no un genérico "¿estás seguro?". El caso que
// importa es desactivar al último responsable activo: es el estado
// inválido que la ficha del proveedor ya avisa DESPUÉS (0 responsables
// -> nadie puede vincular teléfonos), pero conviene avisarlo ANTES de
// crearlo, no solo constatarlo una vez creado.
// =============================================================

export default function DesactivarAccesoModal({ open, onClose, acceso, proveedorNombre, esUltimoResponsable, onConfirmar }) {
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  async function handleConfirmar() {
    setError('')
    setSaving(true)
    try {
      await onConfirmar()
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos desactivar el acceso.')
    } finally {
      setSaving(false)
    }
  }

  const nombre = acceso?.vecino?.nombre_completo ?? 'Esta persona'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Desactivar acceso"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="danger" onClick={handleConfirmar} loading={saving}>Sí, desactivar</Button>
        </>
      }
    >
      <div className="space-y-3">
        {esUltimoResponsable ? (
          <p className="text-sm text-primary-700">
            <strong>{nombre}</strong> es el único responsable de <strong>{proveedorNombre}</strong>.
            Si lo desactivás, nadie va a poder vincular teléfonos y el comercio no va a poder
            canjear vales.
          </p>
        ) : (
          <p className="text-sm text-primary-700">
            <strong>{nombre}</strong> no va a poder canjear más vales de <strong>{proveedorNombre}</strong>.
          </p>
        )}

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">{error}</div>
        )}
      </div>
    </Modal>
  )
}
