import { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'

const EMPTY = {
  titulo: '',
  resumen: '',
  contenido: '',
  imagen_url: '',
  publicado: false,
  autor: '',
}

export default function NoticiaFormModal({ open, onClose, onSave, noticia }) {
  const [form, setForm] = useState(EMPTY)
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  useEffect(() => {
    if (open) setForm(noticia ? { ...EMPTY, ...noticia } : EMPTY)
  }, [open, noticia])

  function handleSave() {
    onSave?.(form)
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={noticia ? 'Editar noticia' : 'Nueva noticia'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={handleSave}
            disabled={!form.titulo.trim() || !form.contenido.trim()}
          >
            {noticia ? 'Guardar cambios' : 'Crear noticia'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Título"
          value={form.titulo}
          onChange={e => set('titulo', e.target.value)}
          required
        />
        <Input
          label="Resumen (opcional)"
          value={form.resumen}
          onChange={e => set('resumen', e.target.value)}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">Contenido</label>
          <textarea
            value={form.contenido}
            onChange={e => set('contenido', e.target.value)}
            rows={6}
            className="input-field resize-none"
            required
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Autor"
            value={form.autor}
            onChange={e => set('autor', e.target.value)}
            placeholder="Intendencia, CAPS, ..."
          />
          <Input
            label="URL de imagen (opcional)"
            value={form.imagen_url}
            onChange={e => set('imagen_url', e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.publicado}
            onChange={e => set('publicado', e.target.checked)}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-primary-700">Publicar inmediatamente</span>
        </label>
      </div>
    </Modal>
  )
}
