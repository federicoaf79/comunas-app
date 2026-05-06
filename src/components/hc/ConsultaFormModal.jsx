import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'

const EMPTY = { motivo: '', diagnostico: '', indicaciones: '' }

export default function ConsultaFormModal({ open, onClose, onSubmit }) {
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  useEffect(() => {
    if (open) {
      setForm(EMPTY)
      setError('')
      setSaving(false)
    }
  }, [open])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await onSubmit?.(form)
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No se pudo guardar la consulta.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva consulta"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!form.motivo.trim()}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Motivo"
          value={form.motivo}
          onChange={e => set('motivo', e.target.value)}
          required
          placeholder="Ej: Control general"
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Diagnóstico
          </label>
          <textarea
            value={form.diagnostico}
            onChange={e => set('diagnostico', e.target.value)}
            rows={3}
            className="input-field resize-none"
            placeholder="Ej: Tensión arterial elevada"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Receta / indicaciones
          </label>
          <textarea
            value={form.indicaciones}
            onChange={e => set('indicaciones', e.target.value)}
            rows={4}
            className="input-field resize-none"
            placeholder="Ej: Amlodipina 5mg, 1 comprimido por día"
          />
        </div>
      </div>
      {error && (
        <p className="mt-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </Modal>
  )
}
