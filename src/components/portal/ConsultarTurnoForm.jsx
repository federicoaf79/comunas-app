import { useState } from 'react'
import Input from '../ui/Input'
import Button from '../ui/Button'

export default function ConsultarTurnoForm() {
  const [busqueda, setBusqueda] = useState('')
  const [resultado, setResultado] = useState(null)

  function handleSubmit(e) {
    e.preventDefault()
    if (!busqueda.trim()) return
    // TODO: implementar como RPC SECURITY DEFINER que reciba dni o
    // numero_turno y devuelva sólo los turnos del consultante. La
    // SELECT directa no se puede abrir a anon sin filtrar por id.
    setResultado({
      tipo:    'info',
      mensaje:
        'Si tu DNI o número de turno está registrado, te enviamos los detalles por SMS o WhatsApp en breve.',
    })
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Input
          label="DNI o número de turno"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Ej: 32145678"
          className="flex-1"
          inputMode="numeric"
          autoComplete="off"
        />
        <Button type="submit" disabled={!busqueda.trim()}>
          Consultar
        </Button>
      </div>
      {resultado && (
        <div className="mt-4 rounded-md border border-ok-100 bg-ok-50 p-3 text-sm text-ok-700">
          {resultado.mensaje}
        </div>
      )}
    </form>
  )
}
