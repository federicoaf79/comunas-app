import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'

// Categorías sugeridas — el usuario puede dejarla en blanco o
// elegir una. El select además permite ingresar otra (custom)
// vía la opción "Otra…" que cambia a un Input libre.
const CATEGORIAS = [
  { value: 'Salud',         label: 'Salud' },
  { value: 'Educación',     label: 'Educación' },
  { value: 'Obras',         label: 'Obras' },
  { value: 'Deportes',      label: 'Deportes' },
  { value: 'Social',        label: 'Social' },
  { value: 'Servicios',     label: 'Servicios' },
  { value: 'Institucional', label: 'Institucional' },
]

const EMPTY = {
  titulo:     '',
  resumen:    '',
  cuerpo:     '',
  imagen_url: '',
  categoria:  '',
  publicar:   false,
}

// Mapa nutrirá el form desde una noticia traída de la DB. El
// flag `publicar` se deriva del estado para que el checkbox
// muestre el estado actual.
function noticiaToForm(noticia) {
  if (!noticia) return EMPTY
  return {
    titulo:     noticia.titulo     ?? '',
    resumen:    noticia.resumen    ?? '',
    cuerpo:     noticia.cuerpo     ?? '',
    imagen_url: noticia.imagen_url ?? '',
    categoria:  noticia.categoria  ?? '',
    publicar:   noticia.estado === 'publicada',
  }
}

// El padre debe pasar `key={noticia?.id ?? 'new'}` para que el
// componente se remonte cuando cambia la noticia editada — así el
// estado del formulario arranca desde la noticia correcta sin
// necesidad de sincronizar vía useEffect.
export default function NoticiaFormModal({ open, onClose, onSave, noticia, saving = false }) {
  const [form, setForm] = useState(() => noticiaToForm(noticia))
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  function handleSave() {
    onSave?.(form)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={noticia ? 'Editar noticia' : 'Nueva noticia'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={!form.titulo.trim() || !form.cuerpo.trim()}
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
          placeholder="Bajada corta — aparece en el listado del portal."
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Cuerpo de la noticia
          </label>
          <textarea
            value={form.cuerpo}
            onChange={e => set('cuerpo', e.target.value)}
            rows={10}
            className="input-field resize-y"
            placeholder="Escribí el contenido. Los saltos de línea se respetan en el portal."
            required
          />
          <p className="mt-1 text-xs text-primary-400">
            Editor simple: separá párrafos con un Enter. El portal renderiza los saltos de línea tal cual.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Select
            label="Categoría"
            value={form.categoria}
            onChange={v => set('categoria', v)}
            placeholder="Sin categoría"
            options={CATEGORIAS}
          />
          <Input
            label="URL de imagen (opcional)"
            value={form.imagen_url}
            onChange={e => set('imagen_url', e.target.value)}
            placeholder="https://..."
          />
        </div>
        {form.imagen_url?.trim() && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-primary-500">Vista previa de la imagen</p>
            <div className="overflow-hidden rounded-md border border-border bg-primary-50">
              <img
                src={form.imagen_url}
                alt=""
                className="aspect-[16/9] w-full object-cover"
                onError={e => { e.currentTarget.style.opacity = '0.3' }}
              />
            </div>
          </div>
        )}
        <label className="flex items-start gap-3 rounded-md border border-border bg-primary-50 p-3 text-sm">
          <input
            type="checkbox"
            checked={form.publicar}
            onChange={e => set('publicar', e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span className="flex-1">
            <span className="block font-semibold text-primary">Publicar inmediatamente</span>
            <span className="block text-xs text-primary-500">
              Si está tildado, la noticia aparece en el Portal Ciudadano apenas la guardes.
              Si lo destildás, queda como borrador y solo la ven los administradores.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  )
}
