import { useState } from 'react'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'

// Lista hardcodeada por ahora — cuando se conecte a Supabase real
// sustituir por un fetch a `dependencias` filtrado por municipio.
const DEPENDENCIAS = [
  { value: 'caps',         label: 'CAPS — Sala de Primeros Auxilios' },
  { value: 'intendencia',  label: 'Intendencia' },
  { value: 'juzgado',      label: 'Juzgado de Paz' },
  { value: 'catastro',     label: 'Oficina de Tierras y Catastro' },
  { value: 'bromatologia', label: 'Bromatología' },
]

const CANALES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms',      label: 'SMS' },
]

const EMPTY = {
  dni:         '',
  nombre:      '',
  dependencia: '',
  fecha:       '',
  canal:       'whatsapp',
  telefono:    '',
}

export default function SacarTurnoForm() {
  const [form, setForm]           = useState(EMPTY)
  const [submitted, setSubmitted] = useState(false)
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  function handleSubmit(e) {
    e.preventDefault()
    // TODO: integración real con Plan-B + Twilio para alta del turno
    // y envío de confirmación por SMS / WhatsApp. Por ahora sólo
    // mostramos un mensaje de recibido — la fila no se inserta.
    setSubmitted(true)
  }

  function reset() {
    setForm(EMPTY)
    setSubmitted(false)
  }

  if (submitted) {
    const canalLabel = form.canal === 'whatsapp' ? 'WhatsApp' : 'SMS'
    return (
      <div className="card p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ok-50 text-ok-700">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-primary">Solicitud recibida</h3>
        <p className="mt-2 text-sm text-primary-500">
          Te confirmamos el turno por <strong>{canalLabel}</strong> al{' '}
          <strong>{form.telefono}</strong> en menos de 24 horas.
        </p>
        <Button variant="secondary" onClick={reset} className="mt-5">
          Sacar otro turno
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card grid gap-4 p-5 sm:grid-cols-2">
      <Input
        label="DNI"
        value={form.dni}
        onChange={e => set('dni', e.target.value)}
        required
        inputMode="numeric"
        autoComplete="off"
      />
      <Input
        label="Nombre completo"
        value={form.nombre}
        onChange={e => set('nombre', e.target.value)}
        required
        autoComplete="name"
      />
      <Select
        label="Dependencia"
        value={form.dependencia}
        onChange={v => set('dependencia', v)}
        placeholder="Seleccionar..."
        options={DEPENDENCIAS}
      />
      <Input
        label="Fecha preferida"
        type="date"
        value={form.fecha}
        onChange={e => set('fecha', e.target.value)}
        required
      />
      <Select
        label="Canal de contacto"
        value={form.canal}
        onChange={v => set('canal', v)}
        options={CANALES}
      />
      <Input
        label="Teléfono"
        value={form.telefono}
        onChange={e => set('telefono', e.target.value)}
        required
        inputMode="tel"
        autoComplete="tel"
        placeholder="+54 9 ..."
      />
      <div className="sm:col-span-2">
        <Button
          type="submit"
          className="w-full"
          disabled={!form.dni || !form.nombre || !form.dependencia || !form.fecha || !form.telefono}
        >
          Solicitar turno
        </Button>
        <p className="mt-2 text-center text-xs text-primary-400">
          Te confirmamos por {form.canal === 'whatsapp' ? 'WhatsApp' : 'SMS'} en menos de 24hs.
        </p>
      </div>
    </form>
  )
}
