import { useMemo, useState } from 'react'
import { mensajes, vecinos, vecinoById } from '../../lib/mockData'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import SearchBar from '../../components/ui/SearchBar'
import MensajeItem from '../../components/sms/MensajeItem'

export default function Mensajeria() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-primary">Mensajería</h1>
        <p className="text-sm text-primary-400">SMS y WhatsApp con los vecinos</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <Historial />
        <EnvioMasivo />
      </div>
    </div>
  )
}

function Historial() {
  const [canal, setCanal] = useState('')
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return mensajes.filter(m => {
      if (canal && m.canal !== canal) return false
      if (!term) return true
      const v = vecinoById(m.vecino_id)
      const name = v ? `${v.nombre} ${v.apellido}`.toLowerCase() : ''
      return name.includes(term) || m.mensaje.toLowerCase().includes(term)
    })
  }, [canal, q])

  return (
    <div className="card overflow-hidden p-0 lg:col-span-2">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-primary-700">Historial</h2>
        <div className="flex flex-wrap gap-2">
          <SearchBar value={q} onChange={setQ} placeholder="Buscar..." className="w-56" />
          <Select
            value={canal}
            onChange={setCanal}
            placeholder="Todos los canales"
            options={[
              { value: 'sms', label: 'SMS' },
              { value: 'whatsapp', label: 'WhatsApp' },
            ]}
            className="w-44"
          />
        </div>
      </header>
      {list.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-primary-400">
          No hay mensajes con esos filtros.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {list.map(m => <MensajeItem key={m.id} mensaje={m} />)}
        </ul>
      )}
    </div>
  )
}

const CANALES = [
  { value: 'sms',      label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ambos',    label: 'Ambos' },
]

function EnvioMasivo() {
  const [canal, setCanal] = useState('sms')
  const [mensaje, setMensaje] = useState('')
  const [destinatarios, setDestinatarios] = useState([])
  const [filtroDest, setFiltroDest] = useState('')

  function toggleDest(id) {
    setDestinatarios(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  function selectAll() {
    setDestinatarios(filteredVecinos.map(v => v.id))
  }

  function clearAll() {
    setDestinatarios([])
  }

  const filteredVecinos = useMemo(() => {
    const term = filtroDest.trim().toLowerCase()
    if (!term) return vecinos
    return vecinos.filter(v =>
      v.nombre.toLowerCase().includes(term) ||
      v.apellido.toLowerCase().includes(term) ||
      (v.dni ?? '').includes(term)
    )
  }, [filtroDest])

  function handleSend(e) {
    e.preventDefault()
    // mock — la conexión real a Twilio/WA se hace después
    alert(
      `Envío simulado por ${canal.toUpperCase()} a ${destinatarios.length} destinatarios:\n\n"${mensaje}"`
    )
    setMensaje('')
    setDestinatarios([])
  }

  return (
    <div className="card p-0">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-primary-700">Envío masivo</h2>
      </header>
      <form onSubmit={handleSend} className="space-y-4 p-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">Canal</label>
          <div className="flex gap-2">
            {CANALES.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCanal(opt.value)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  canal === opt.value
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-primary-500 hover:border-primary-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-primary-700">
              Destinatarios <span className="text-primary-400">({destinatarios.length})</span>
            </label>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={selectAll} className="font-medium text-primary hover:underline">
                Seleccionar todos
              </button>
              <span className="text-primary-300">·</span>
              <button type="button" onClick={clearAll} className="font-medium text-primary-400 hover:text-primary hover:underline">
                Limpiar
              </button>
            </div>
          </div>
          <input
            type="search"
            value={filtroDest}
            onChange={e => setFiltroDest(e.target.value)}
            placeholder="Filtrar vecinos..."
            className="input-field mb-2"
          />
          <div className="max-h-52 overflow-y-auto rounded-md border border-border">
            {filteredVecinos.map(v => (
              <label
                key={v.id}
                className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-primary-50"
              >
                <input
                  type="checkbox"
                  checked={destinatarios.includes(v.id)}
                  onChange={() => toggleDest(v.id)}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-sm text-primary-700">{v.apellido}, {v.nombre}</span>
                <span className="ml-auto text-xs text-primary-400">{v.telefono}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">Mensaje</label>
          <textarea
            value={mensaje}
            onChange={e => setMensaje(e.target.value)}
            rows={4}
            placeholder="Escribí el mensaje..."
            className="input-field resize-none"
            required
          />
          <p className="mt-1 text-xs text-primary-400">{mensaje.length} caracteres</p>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={!mensaje.trim() || destinatarios.length === 0}
        >
          Enviar a {destinatarios.length} {destinatarios.length === 1 ? 'vecino' : 'vecinos'}
        </Button>
      </form>
    </div>
  )
}
