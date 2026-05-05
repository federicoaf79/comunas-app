import { useRef, useState } from 'react'
import Button from '../ui/Button'

export default function RecetaUploader({ onSubmit }) {
  const [foto, setFoto] = useState(null)
  const [vecinoLabel, setVecinoLabel] = useState('')
  const [medicamento, setMedicamento] = useState('')
  const inputRef = useRef(null)

  function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFoto({ name: file.name, size: file.size, url: URL.createObjectURL(file) })
  }

  function reset() {
    setFoto(null)
    setVecinoLabel('')
    setMedicamento('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleSubmit(e) {
    e.preventDefault()
    onSubmit?.({ vecino: vecinoLabel, medicamento, foto: foto?.name })
    alert(`Receta cargada (simulada): ${medicamento || 'sin nombre'} para ${vecinoLabel || 'vecino sin nombre'}`)
    reset()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-primary-700">Vecino</label>
        <input
          type="text"
          value={vecinoLabel}
          onChange={e => setVecinoLabel(e.target.value)}
          placeholder="Apellido y nombre"
          className="input-field"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-primary-700">Medicamento / posología</label>
        <input
          type="text"
          value={medicamento}
          onChange={e => setMedicamento(e.target.value)}
          placeholder="Ej: Amoxicilina 500mg / 8h x 7 días"
          className="input-field"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-primary-700">Foto de la receta</label>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFile}
          className="block w-full text-xs text-primary-500 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-primary-600"
        />
        {foto && (
          <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-primary-50 p-2">
            <img src={foto.url} alt={foto.name} className="h-12 w-12 rounded object-cover" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-primary-700">{foto.name}</p>
              <p className="text-[10px] text-primary-400">{Math.round(foto.size / 1024)} KB</p>
            </div>
            <button
              type="button"
              onClick={reset}
              className="ml-auto text-xs text-primary-400 hover:text-danger"
            >
              Quitar
            </button>
          </div>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={!foto}>
        Cargar receta
      </Button>
    </form>
  )
}
