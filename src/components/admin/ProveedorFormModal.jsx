import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'

const EMPTY = {
  nombre: '', categoria: '', telefono: '', direccion: '',
}

export default function ProveedorFormModal({ open, onClose, onSubmit, proveedor = null }) {
  const [form, setForm]     = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const isEdit = !!proveedor

  useEffect(() => {
    if (open) {
      setForm(proveedor ? {
        nombre:    proveedor.nombre ?? '',
        categoria: proveedor.categoria ?? '',
        telefono:  proveedor.telefono ?? '',
        direccion: proveedor.direccion ?? '',
      } : EMPTY)
      setError('')
      setSaving(false)
    }
  }, [open, proveedor])

  async function handleSave() {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await onSubmit?.({
        nombre:    form.nombre.trim(),
        categoria: form.categoria.trim() || null,
        telefono:  form.telefono.trim() || null,
        direccion: form.direccion.trim() || null,
      })
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No se pudo guardar el proveedor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar proveedor' : 'Nuevo proveedor'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!form.nombre.trim()}
          >
            {isEdit ? 'Guardar cambios' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="Nombre del establecimiento" value={form.nombre} onChange={e => set('nombre', e.target.value)} required />
        <Input label="Categoría" value={form.categoria} onChange={e => set('categoria', e.target.value)} placeholder="Ej: Ferretería, Almacén, Farmacia..." />
        <Input label="Teléfono" value={form.telefono} onChange={e => set('telefono', e.target.value)} />
        <Input label="Dirección" value={form.direccion} onChange={e => set('direccion', e.target.value)} />
      </div>
      {error && (
        <p className="mt-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-danger">
          {error}
        </p>
      )}
    </Modal>
  )
}
