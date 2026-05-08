import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import { todayArgYMD } from '../../lib/datetime'

const ORIGENES = [
  { value: 'Provincia',        label: 'Provincia' },
  { value: 'Nación',           label: 'Nación' },
  { value: 'Impuestos/Tasas',  label: 'Impuestos / Tasas' },
  { value: 'Donaciones',       label: 'Donaciones' },
  { value: 'Eventos',          label: 'Eventos' },
  { value: 'Alquiler SUM',     label: 'Alquiler SUM' },
  { value: 'Otros',            label: 'Otros' },
]

function emptyForm() {
  return {
    fecha: todayArgYMD(),
    origen: '',
    descripcion: '',
    monto: '',
  }
}

export default function IngresoFormModal({ open, onClose, onSave, saving = false }) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const canSubmit =
    !!form.fecha &&
    !!form.descripcion.trim() &&
    !!form.origen &&
    !!form.monto && Number(form.monto) > 0

  async function handleSave() {
    setError('')
    try {
      await onSave({
        fecha:       form.fecha,
        descripcion: form.descripcion.trim(),
        origen:      form.origen,
        monto:       Number(form.monto),
      })
      setForm(emptyForm())
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar el ingreso.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar ingreso"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>Guardar ingreso</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Fecha"
          type="date"
          value={form.fecha}
          onChange={e => set('fecha', e.target.value)}
          required
        />
        <Input
          label="Monto"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          value={form.monto}
          onChange={e => set('monto', e.target.value)}
          required
        />
        <Select
          label="Origen"
          value={form.origen}
          onChange={v => set('origen', v)}
          placeholder="Seleccionar..."
          options={ORIGENES}
        />
        <div className="sm:col-span-2">
          <Input
            label="Descripción"
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            placeholder="Detalle del ingreso"
            required
          />
        </div>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
