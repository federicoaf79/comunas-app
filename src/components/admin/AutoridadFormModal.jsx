import { useEffect, useRef, useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import { uploadFotoAutoridad } from '../../hooks/useAutoridades'

// =============================================================
// AutoridadFormModal — alta/edición de un miembro del cuerpo de
// autoridades del municipio. Usa el bucket `avatares` con path
// `<municipio_id>/autoridades/<timestamp>_<nombre_slug>.<ext>`.
//
// El padre debe pasar `key={autoridad?.id ?? 'new'}` para que el
// componente se remonte cuando cambia la autoridad editada — así
// el estado del formulario arranca desde la autoridad correcta sin
// necesidad de sincronizar vía useEffect.
// =============================================================

const EMPTY = {
  nombre:      '',
  cargo:       '',
  descripcion: '',
  foto_url:    '',
  orden:       0,
  activo:      true,
}

function autoridadToForm(a) {
  if (!a) return EMPTY
  return {
    nombre:      a.nombre      ?? '',
    cargo:       a.cargo       ?? '',
    descripcion: a.descripcion ?? '',
    foto_url:    a.foto_url    ?? '',
    orden:       a.orden       ?? 0,
    activo:      a.activo      ?? true,
  }
}

export default function AutoridadFormModal({
  open,
  onClose,
  onSave,
  autoridad,
  municipioId,
  saving = false,
}) {
  const [form, setForm] = useState(() => autoridadToForm(autoridad))
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const [fotoFile, setFotoFile]         = useState(null)
  const [localPreview, setLocalPreview] = useState(null)
  const [uploading, setUploading]       = useState(false)
  const [errorMsg, setErrorMsg]         = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    return () => {
      if (localPreview) URL.revokeObjectURL(localPreview)
    }
  }, [localPreview])

  function handleFile(e) {
    setErrorMsg('')
    const file = e.target.files?.[0] ?? null
    if (localPreview) URL.revokeObjectURL(localPreview)
    if (!file) { setFotoFile(null); setLocalPreview(null); return }
    if (!/^image\//.test(file.type)) {
      setErrorMsg('El archivo no parece ser una imagen.')
      setFotoFile(null); setLocalPreview(null)
      return
    }
    setFotoFile(file)
    setLocalPreview(URL.createObjectURL(file))
  }

  function clearFile() {
    if (localPreview) URL.revokeObjectURL(localPreview)
    setFotoFile(null)
    setLocalPreview(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleSave() {
    setErrorMsg('')
    let foto_url = (form.foto_url ?? '').trim()
    try {
      if (fotoFile) {
        setUploading(true)
        foto_url = await uploadFotoAutoridad({
          file:        fotoFile,
          municipioId,
          nombre:      form.nombre,
        })
      }
      onSave?.({ ...form, foto_url })
    } catch (e) {
      setErrorMsg(e?.message ?? 'No pudimos guardar la autoridad.')
    } finally {
      setUploading(false)
    }
  }

  const previewSrc = localPreview ?? (form.foto_url?.trim() || null)
  const busy       = saving || uploading
  const canSubmit  = !!form.nombre.trim() && !!form.cargo.trim() && !busy

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={autoridad ? 'Editar autoridad' : 'Nueva autoridad'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={handleSave} loading={busy} disabled={!canSubmit}>
            {autoridad ? 'Guardar cambios' : 'Crear autoridad'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Nombre completo"
          value={form.nombre}
          onChange={e => set('nombre', e.target.value)}
          required
          placeholder="Ej: María Elena Soria"
        />
        <Input
          label="Cargo"
          value={form.cargo}
          onChange={e => set('cargo', e.target.value)}
          required
          placeholder="Ej: Presidenta Comunal"
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Descripción breve (opcional)
          </label>
          <textarea
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            rows={3}
            className="input-field resize-y"
            placeholder="Trayectoria, áreas de trabajo, etc. Se muestra debajo del cargo en el portal."
          />
        </div>

        {/* Foto — input file con preview circular */}
        <div>
          <p className="mb-1.5 text-sm font-medium text-primary-700">Foto</p>
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt="Vista previa"
                  className="h-24 w-24 rounded-full object-cover ring-2 ring-accent/60"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-2xl font-bold text-white ring-2 ring-accent/60">
                  {form.nombre.trim() ? form.nombre.trim().split(/\s+/).map(w => w[0]).slice(0,2).join('').toUpperCase() : '?'}
                </div>
              )}
            </div>
            <div className="flex-1 space-y-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                className="block w-full text-sm text-primary-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-600"
              />
              {fotoFile && (
                <div className="flex flex-wrap items-center gap-3 text-xs text-primary-500">
                  <span>{fotoFile.name} · {Math.round(fotoFile.size / 1024)} KB</span>
                  <button type="button" onClick={clearFile} className="font-semibold text-danger hover:underline">
                    Quitar
                  </button>
                </div>
              )}
              {!fotoFile && form.foto_url && (
                <p className="text-xs text-primary-400">
                  Esta autoridad ya tiene una foto. Si no elegís un archivo nuevo, se conserva la actual.
                </p>
              )}
              <Input
                label="… o pegar URL"
                value={form.foto_url}
                onChange={e => set('foto_url', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        </div>

        <Input
          label="Orden (más bajo = aparece primero)"
          type="number"
          value={form.orden}
          onChange={e => set('orden', Number(e.target.value) || 0)}
        />

        <label className="flex items-start gap-3 rounded-md border border-border bg-primary-50 p-3 text-sm">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={e => set('activo', e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span className="flex-1">
            <span className="block font-semibold text-primary">Mostrar en el portal</span>
            <span className="block text-xs text-primary-500">
              Si está destildado, esta autoridad no se muestra a los vecinos.
            </span>
          </span>
        </label>

        {errorMsg && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
            {errorMsg}
          </div>
        )}

        {uploading && (
          <div className="flex items-center gap-2 text-xs text-primary-500">
            <Spinner size="sm" /> Subiendo foto…
          </div>
        )}
      </div>
    </Modal>
  )
}
