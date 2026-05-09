import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'

// =============================================================
// Modal alta/edición de fuente RSS para el panel /admin/config.
// El padre maneja el array completo de fuentes (en memoria) y este
// modal solo emite los cambios de UNA fuente vía onSave(fuente).
// =============================================================

// Slug derivado del nombre — usado como `key` cuando es alta.
function slugify(s) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function emptyForm() {
  return {
    label:    '',
    url:      '',
    home:     '',
    keywords: '',
  }
}

function fuenteToForm(f) {
  if (!f) return emptyForm()
  return {
    label:    f.label ?? '',
    url:      f.url ?? '',
    home:     f.home ?? '',
    keywords: (f.palabras_clave ?? []).join(', '),
  }
}

// El padre debe pasar `key={fuente?.key ?? 'new'}` para que el
// componente se remonte cuando cambia la fuente editada — así el
// estado del formulario arranca con los datos correctos sin
// necesidad de useEffect → setState.
export default function FuenteRssFormModal({
  open,
  onClose,
  onSave,
  fuente,
  saving = false,
}) {
  const [form, setForm] = useState(() => fuenteToForm(fuente))
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const isEdit  = !!fuente
  const canSave = !!form.label.trim() && !!form.url.trim()

  function handleSave() {
    setError('')
    try {
      const url   = form.url.trim()
      const label = form.label.trim()
      if (!/^https?:\/\//i.test(url)) {
        throw new Error('La URL del RSS debe empezar con http:// o https://')
      }
      const palabras_clave = form.keywords
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)

      const next = {
        // En edición preservamos el `key` y el `active` originales;
        // en alta generamos slug del nombre y arrancamos activa.
        key:    isEdit ? fuente.key    : slugify(label) || `fuente-${Date.now()}`,
        active: isEdit ? fuente.active !== false : true,
        label,
        url,
        home:   form.home.trim() || null,
        palabras_clave,
      }
      onSave(next)
    } catch (e) {
      setError(e?.message ?? 'No se pudo guardar la fuente.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar fuente RSS' : 'Agregar fuente RSS'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSave}>
            {isEdit ? 'Guardar cambios' : 'Agregar fuente'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Nombre de la fuente"
          value={form.label}
          onChange={e => set('label', e.target.value)}
          required
          placeholder="Ej: El Liberal"
        />
        <Input
          label="URL del feed RSS"
          value={form.url}
          onChange={e => set('url', e.target.value)}
          required
          placeholder="https://www.medio.com.ar/rss/"
          type="url"
          autoComplete="off"
        />
        <Input
          label="URL del sitio (opcional)"
          value={form.home}
          onChange={e => set('home', e.target.value)}
          placeholder="https://www.medio.com.ar/"
          type="url"
          autoComplete="off"
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Palabras clave adicionales <span className="font-normal text-primary-400">(opcional)</span>
          </label>
          <textarea
            value={form.keywords}
            onChange={e => set('keywords', e.target.value)}
            rows={2}
            className="input-field resize-none"
            placeholder="banco provincia, intendente, justicia santiagueña"
          />
          <p className="mt-1 text-xs text-primary-400">
            Tags separados por coma. Se suman al filtro regional base
            (Santiago, NOA, provincias del norte, etc).
          </p>
        </div>
        <div className="rounded-md border border-primary-100 bg-primary-50 p-3 text-xs text-primary-700">
          La URL se proxea automáticamente por <strong>rss2json.com</strong> para
          convertir el feed a JSON desde el navegador. Asegurate de que el medio
          publique su RSS sin restricción de origen.
        </div>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
