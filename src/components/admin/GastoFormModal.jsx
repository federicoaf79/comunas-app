import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import { todayArgYMD } from '../../lib/datetime'

const CATEGORIAS = [
  { value: 'Personal',       label: 'Personal' },
  { value: 'Servicios',      label: 'Servicios' },
  { value: 'Insumos',        label: 'Insumos' },
  { value: 'Obras',          label: 'Obras' },
  { value: 'Mantenimiento',  label: 'Mantenimiento' },
  { value: 'Combustible',    label: 'Combustible' },
  { value: 'Otros',          label: 'Otros' },
]

function emptyForm() {
  return {
    fecha: todayArgYMD(),
    descripcion: '',
    categoria: '',
    dependencia_id: '',
    monto: '',
    comprobante_url: '',
  }
}

export default function GastoFormModal({ open, onClose, onSave, dependencias = [], saving = false }) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const canSubmit =
    !!form.fecha &&
    !!form.descripcion.trim() &&
    !!form.categoria &&
    !!form.dependencia_id &&
    !!form.monto && Number(form.monto) > 0

  async function handleSave() {
    setError('')
    try {
      await onSave({
        fecha:           form.fecha,
        descripcion:     form.descripcion.trim(),
        categoria:       form.categoria,
        dependencia_id:  form.dependencia_id,
        monto:           Number(form.monto),
        comprobante_url: form.comprobante_url.trim() || null,
      })
      setForm(emptyForm())
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar el gasto.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cargar gasto"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>Guardar gasto</Button>
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
        <div className="sm:col-span-2">
          <Input
            label="Descripción"
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            placeholder="Detalle del gasto"
            required
          />
        </div>
        <Select
          label="Categoría"
          value={form.categoria}
          onChange={v => set('categoria', v)}
          placeholder="Seleccionar..."
          options={CATEGORIAS}
        />
        <Select
          label="Dependencia"
          value={form.dependencia_id}
          onChange={v => set('dependencia_id', v)}
          placeholder="Seleccionar..."
          options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
        />
        <div className="sm:col-span-2">
          <Input
            label="Comprobante (URL, opcional)"
            value={form.comprobante_url}
            onChange={e => set('comprobante_url', e.target.value)}
            placeholder="https://..."
          />
        </div>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">
            {error}
          </div>
        )}
        <p className="text-xs text-primary-400 sm:col-span-2">
          Se crea como <strong>borrador</strong>. Un administrador de comuna puede aprobarlo o rechazarlo después.
        </p>
      </div>
    </Modal>
  )
}
