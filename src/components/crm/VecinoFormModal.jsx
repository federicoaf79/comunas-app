import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import { barrios } from '../../lib/mockData'

const EMPTY = {
  apellido: '', nombre: '', dni: '', telefono: '', email: '',
  zona: 'urbano', barrio: '', direccion: '',
}

const ZONA_OPTS = [
  { value: 'urbano', label: 'Urbano' },
  { value: 'rural',  label: 'Rural' },
]

export default function VecinoFormModal({ open, onClose, onSubmit }) {
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  // Reset al abrir.
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
      setError(e?.message ?? 'No se pudo guardar el vecino.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo vecino"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!form.apellido.trim() || !form.nombre.trim()}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Apellido" value={form.apellido} onChange={e => set('apellido', e.target.value)} required />
        <Input label="Nombre"   value={form.nombre}   onChange={e => set('nombre', e.target.value)} required />
        <Input label="DNI"      value={form.dni}      onChange={e => set('dni', e.target.value)} />
        <Input label="Teléfono" value={form.telefono} onChange={e => set('telefono', e.target.value)} />
        <Input label="Email"    type="email" value={form.email} onChange={e => set('email', e.target.value)} />
        <Select
          label="Zona"
          value={form.zona}
          onChange={v => set('zona', v || 'urbano')}
          options={ZONA_OPTS}
        />
        <Select
          label="Barrio"
          value={form.barrio}
          onChange={v => set('barrio', v)}
          placeholder="Seleccionar..."
          options={barrios.map(b => ({ value: b, label: b }))}
        />
        <div className="md:col-span-2">
          <Input label="Dirección" value={form.direccion} onChange={e => set('direccion', e.target.value)} />
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
