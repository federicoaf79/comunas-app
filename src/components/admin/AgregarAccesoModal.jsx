import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import Select from '../ui/Select'
import Button from '../ui/Button'
import VecinoBuscador from './VecinoBuscador'

// =============================================================
// AgregarAccesoModal — Vales Electrónicos, Fase 4 parte 2.
//
// Default 'secundario' a propósito -- otorgar 'responsable' (el rol
// más poderoso, el único que puede vincular/desvincular teléfonos)
// tiene que ser una elección deliberada del staff, no lo que ya viene
// tildado.
// =============================================================

const ROL_OPTS = [
  { value: 'secundario', label: 'Secundario' },
  { value: 'responsable', label: 'Responsable' },
]

export default function AgregarAccesoModal({ open, onClose, onAgregar, municipioId }) {
  const [vecino, setVecino] = useState(null)
  const [rol, setRol]       = useState('secundario')
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  useEffect(() => {
    if (!open) return
    setVecino(null)
    setRol('secundario')
    setError('')
  }, [open])

  const canSubmit = !!vecino?.id && !saving

  async function handleSave() {
    if (!canSubmit) return
    setError('')
    setSaving(true)
    try {
      await onAgregar({ vecino, rol })
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos agregar el acceso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Agregar persona autorizada"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>Agregar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <VecinoBuscador
          municipioId={municipioId}
          vecino={vecino}
          onSeleccionar={setVecino}
          label="Buscar vecino"
        />

        <Select label="Rol" value={rol} onChange={setRol} options={ROL_OPTS} />

        <p className="text-xs text-primary-400">
          El responsable puede vincular/desvincular teléfonos y ve el historial completo
          de canjes. El secundario solo puede canjear.
        </p>

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">{error}</div>
        )}
      </div>
    </Modal>
  )
}
