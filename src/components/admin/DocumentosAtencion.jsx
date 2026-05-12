import { useRef, useState } from 'react'
import {
  useDocumentosAtencion, useUploadDocumento, useDeleteDocumento,
} from '../../hooks/useAtenciones'
import Spinner from '../ui/Spinner'
import Button from '../ui/Button'
import Select from '../ui/Select'
import Input from '../ui/Input'
import { dateOf } from '../../lib/datetime'

// =============================================================
// DocumentosAtencion — sección que va dentro del tab Atención
// del AtencionDetalle. Lista los archivos subidos para esta
// atención y ofrece un form de upload con selector de tipo.
//
// Storage bucket: 'documentos-hc'
// Path:           '<municipio_id>/<vecino_id>/<atencion_id>/<file>'
//
// El input file usa `accept` amplio (imágenes + pdf + word) y NO
// fuerza el atributo `capture`: el usuario decide si abrir la
// cámara o el selector. En mobile la mayoría de OS muestra ambas
// opciones nativamente.
// =============================================================

// Mapa del label humano del tipo (con ícono) al valor del check
// constraint en hc_documentos.tipo. Mantener sincronizado con la
// migración 20250505000001 (estudio|receta|informe|imagen|otro).
const TIPOS_DOC = [
  { value: 'receta',  label: 'Receta médica',     icono: '📋' },
  { value: 'estudio', label: 'Estudio / análisis', icono: '🔬' },
  { value: 'informe', label: 'Derivación',         icono: '🏥' },
  { value: 'otro',    label: 'Otro documento',     icono: '📄' },
]

function iconoTipo(t) {
  return TIPOS_DOC.find(x => x.value === t)?.icono ?? '📄'
}
function labelTipo(t) {
  return TIPOS_DOC.find(x => x.value === t)?.label ?? t
}

export default function DocumentosAtencion({ atencionId, vecinoId, municipioId, disabled = false }) {
  const docsQ = useDocumentosAtencion(atencionId)
  const upload = useUploadDocumento()
  const remove = useDeleteDocumento()
  const inputRef = useRef(null)

  const [tipo, setTipo]               = useState('receta')
  const [descripcion, setDescripcion] = useState('')
  const [pendingFile, setPendingFile] = useState(null)
  const [error, setError]             = useState('')
  const [ok, setOk]                   = useState('')

  const items = docsQ.data ?? []

  function onPickFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(''); setOk('')
    setPendingFile(f)
  }

  async function handleUpload() {
    if (!pendingFile) {
      // Abre el selector nativo (en mobile incluye cámara).
      inputRef.current?.click()
      return
    }
    if (!atencionId) {
      setError('Guardá la atención como borrador antes de adjuntar documentos.')
      return
    }
    setError(''); setOk('')
    try {
      await upload.mutateAsync({
        file:        pendingFile,
        atencionId,
        vecinoId,
        municipioId,
        tipo,
        descripcion,
      })
      setOk('Documento subido.')
      setPendingFile(null)
      setDescripcion('')
      if (inputRef.current) inputRef.current.value = ''
    } catch (e) {
      setError(e?.message ?? 'No pudimos subir el documento.')
    }
  }

  async function handleDelete(d) {
    if (!confirm(`¿Eliminar el archivo "${d.nombre_archivo}"?`)) return
    try {
      await remove.mutateAsync({
        id:           d.id,
        storagePath:  d.storage_path,
        atencionId,
      })
    } catch (e) {
      setError(e?.message ?? 'No pudimos eliminar el documento.')
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-border bg-white p-4">
      <header>
        <h3 className="font-sora text-sm font-bold text-primary">Documentos adjuntos</h3>
        <p className="mt-0.5 text-xs text-primary-500">
          Recetas, estudios o derivaciones que se cargan desde el celular o la
          computadora. Quedan asociadas a esta atención y a la historia clínica
          del vecino.
        </p>
      </header>

      {!atencionId && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-xs text-accent-700">
          Guardá la atención como borrador para poder adjuntar documentos.
        </div>
      )}

      {/* Lista */}
      {docsQ.isLoading ? (
        <div className="flex justify-center p-4"><Spinner size="sm" /></div>
      ) : items.length === 0 ? (
        <p className="text-xs text-primary-400">Sin documentos adjuntos todavía.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {items.map(d => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="text-xl leading-none" aria-hidden="true">{iconoTipo(d.tipo)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-primary" title={d.nombre_archivo}>
                  {d.nombre_archivo}
                </p>
                <p className="text-[11px] text-primary-500">
                  {labelTipo(d.tipo)} · {dateOf(d.created_at)}
                  {d.descripcion && <> · {d.descripcion}</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
                {d.public_url && (
                  <a
                    href={d.public_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-700 hover:underline"
                  >
                    Ver
                  </a>
                )}
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleDelete(d)}
                    className="text-danger hover:underline"
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Form de upload */}
      {!disabled && (
        <div className="space-y-2 border-t border-border pt-3">
          <input
            ref={inputRef}
            type="file"
            // Sin `capture`: el navegador en mobile ofrece ambos
            // (cámara o explorador). Forzar capture="environment"
            // saltaría el explorador en algunos browsers.
            accept="image/*,application/pdf,.doc,.docx"
            onChange={onPickFile}
            className="hidden"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              label="Tipo de documento"
              value={tipo}
              onChange={setTipo}
              options={TIPOS_DOC.map(t => ({ value: t.value, label: `${t.icono} ${t.label}` }))}
            />
            <Input
              label="Descripción (opcional)"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej: Análisis de sangre, control mensual"
            />
          </div>
          {pendingFile && (
            <p className="rounded-md border border-border bg-primary-50/40 p-2 text-xs text-primary-700">
              Archivo elegido: <b>{pendingFile.name}</b> ({Math.round(pendingFile.size / 1024)} KB)
            </p>
          )}
          {error && (
            <div className="rounded-md border border-red-100 bg-red-50 p-2 text-xs text-danger">{error}</div>
          )}
          {ok && (
            <div className="rounded-md border border-ok-100 bg-ok-50 p-2 text-xs text-ok-700">{ok}</div>
          )}
          <Button
            onClick={handleUpload}
            loading={upload.isPending}
            disabled={!atencionId && !!pendingFile}
          >
            {pendingFile ? '⬆ Subir documento' : '📎 Adjuntar documento o foto'}
          </Button>
        </div>
      )}
    </section>
  )
}
