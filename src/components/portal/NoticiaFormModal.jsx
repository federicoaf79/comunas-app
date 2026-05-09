import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'

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

// Sanitiza el nombre del archivo para usarlo en el path de
// Storage. Lowercase, ASCII, sin espacios. El prefijo timestamp
// es responsabilidad del caller.
function safeFilename(name) {
  return (name || 'imagen')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

// Sube `file` al bucket 'noticias' con path
// "<municipioId>/<timestamp>_<safeName>" y devuelve la URL pública.
async function uploadImagenToStorage({ file, municipioId }) {
  if (!municipioId) {
    throw new Error('Tu usuario no tiene un municipio asignado.')
  }
  const path = `${municipioId}/${Date.now()}_${safeFilename(file.name)}`
  const { error } = await supabase.storage
    .from('noticias')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert:      false,
    })
  if (error) {
    console.error('[NoticiaFormModal] upload error:', error)
    throw new Error(error.message ?? 'No pudimos subir la imagen.')
  }
  const { data } = supabase.storage.from('noticias').getPublicUrl(path)
  return data.publicUrl
}

// ─────────────────────────────────────────────────────────────────
// Sub-componente: tabs de imagen
// ─────────────────────────────────────────────────────────────────

function ImageTab({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'flex-1 rounded-md px-3 py-2 text-xs font-semibold transition-colors sm:text-sm ' +
        (active
          ? 'bg-primary text-white shadow-sm'
          : 'bg-white text-primary-500 hover:bg-primary-50 hover:text-primary')
      }
    >
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────
// Componente principal
//
// El padre debe pasar `key={noticia?.id ?? 'new'}` para que el
// componente se remonte cuando cambia la noticia editada — así el
// estado del formulario arranca desde la noticia correcta sin
// necesidad de sincronizar vía useEffect.
// ─────────────────────────────────────────────────────────────────
export default function NoticiaFormModal({
  open,
  onClose,
  onSave,
  noticia,
  saving = false,
  municipioId = null,   // necesario para subir imágenes a Storage
}) {
  const [form, setForm] = useState(() => noticiaToForm(noticia))
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  // Estado del bloque de imagen — se separa del form para no
  // mezclar la URL final con el archivo local pendiente de upload.
  const initialMode = (noticia?.imagen_url ?? '').trim() ? 'url' : 'upload'
  const [imagenMode, setImagenMode]       = useState(initialMode)
  const [imagenFile, setImagenFile]       = useState(null)
  const [localPreview, setLocalPreview]   = useState(null) // object URL del File seleccionado
  const [uploading, setUploading]         = useState(false)
  const [imagenError, setImagenError]     = useState('')
  const fileInputRef = useRef(null)

  // Limpieza del object URL local al desmontar / cambiar de archivo
  // — evita filtrar memoria.
  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview)
    }
  }, [localPreview])

  function handleFileChange(e) {
    setImagenError('')
    const file = e.target.files?.[0] ?? null
    if (localPreview) URL.revokeObjectURL(localPreview)
    if (!file) {
      setImagenFile(null)
      setLocalPreview(null)
      return
    }
    if (!/^image\//.test(file.type)) {
      setImagenError('El archivo no parece ser una imagen.')
      setImagenFile(null)
      setLocalPreview(null)
      return
    }
    setImagenFile(file)
    setLocalPreview(URL.createObjectURL(file))
  }

  function clearFile() {
    if (localPreview) URL.revokeObjectURL(localPreview)
    setImagenFile(null)
    setLocalPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSave() {
    setImagenError('')
    let imagenUrl = (form.imagen_url ?? '').trim()
    try {
      if (imagenMode === 'upload') {
        if (imagenFile) {
          setUploading(true)
          imagenUrl = await uploadImagenToStorage({ file: imagenFile, municipioId })
        } else if (!noticia?.imagen_url) {
          // Modo upload sin archivo elegido y noticia nueva —
          // queda sin imagen.
          imagenUrl = ''
        } else {
          // Modo upload sobre una noticia que ya tenía imagen y el
          // usuario no eligió archivo nuevo — preservamos la imagen
          // existente para no romper la noticia al editar otros campos.
          imagenUrl = noticia.imagen_url
        }
      }
      onSave?.({ ...form, imagen_url: imagenUrl || '' })
    } catch (e) {
      setImagenError(e?.message ?? 'No pudimos subir la imagen.')
    } finally {
      setUploading(false)
    }
  }

  // Preview activo — depende del tab seleccionado
  const previewSrc = imagenMode === 'upload'
    ? (localPreview ?? (noticia?.imagen_url ?? null))
    : (form.imagen_url?.trim() || null)

  const busy     = saving || uploading
  const canSubmit = !!form.titulo.trim() && !!form.cuerpo.trim() && !busy

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={noticia ? 'Editar noticia' : 'Nueva noticia'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            loading={busy}
            disabled={!canSubmit}
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

        <Select
          label="Categoría"
          value={form.categoria}
          onChange={v => set('categoria', v)}
          placeholder="Sin categoría"
          options={CATEGORIAS}
        />

        {/* ── Imagen — tabs Subir / URL ─────────────────────── */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-primary-700">Imagen de la noticia</p>
          <div className="mb-3 inline-flex w-full gap-1 rounded-lg border border-border bg-primary-50 p-1 sm:w-auto">
            <ImageTab
              active={imagenMode === 'upload'}
              label="Subir imagen"
              onClick={() => { setImagenMode('upload'); setImagenError('') }}
            />
            <ImageTab
              active={imagenMode === 'url'}
              label="URL externa"
              onClick={() => { setImagenMode('url'); setImagenError('') }}
            />
          </div>

          {imagenMode === 'upload' ? (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="block w-full text-sm text-primary-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-600"
              />
              {imagenFile && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-primary-500">
                  <span>{imagenFile.name} · {Math.round(imagenFile.size / 1024)} KB</span>
                  <button
                    type="button"
                    onClick={clearFile}
                    className="font-semibold text-danger hover:underline"
                  >
                    Quitar
                  </button>
                </div>
              )}
              {!imagenFile && noticia?.imagen_url && (
                <p className="text-xs text-primary-400">
                  La noticia ya tiene una imagen. Si no elegís un archivo nuevo, se conserva la actual.
                </p>
              )}
            </div>
          ) : (
            <Input
              label=""
              value={form.imagen_url}
              onChange={e => set('imagen_url', e.target.value)}
              placeholder="https://..."
            />
          )}

          {imagenError && (
            <p className="mt-2 rounded-md border border-red-100 bg-red-50 p-2 text-xs text-danger">
              {imagenError}
            </p>
          )}
        </div>

        {/* Vista previa */}
        {previewSrc && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-primary-500">Vista previa</p>
            <div className="overflow-hidden rounded-md border border-border bg-primary-50">
              <img
                src={previewSrc}
                alt=""
                className="aspect-[16/9] w-full object-cover"
                onError={e => { e.currentTarget.style.opacity = '0.3' }}
                style={{ maxHeight: 200 }}
              />
            </div>
          </div>
        )}

        {uploading && (
          <div className="flex items-center gap-2 text-xs text-primary-500">
            <Spinner size="sm" /> Subiendo imagen…
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
