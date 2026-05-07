import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'

// Opciones simples para el ciudadano. El mapeo a `dependencias.tipo`
// permite caer a una alternativa si el municipio no tiene SUM o
// administración cargada (cae a Intendencia).
const DEP_OPTIONS = [
  { value: 'caps',           label: 'Sala de Primeros Auxilios',    tipos: ['caps'] },
  { value: 'juzgado',        label: 'Juzgado de Paz',               tipos: ['juzgado'] },
  { value: 'sum',            label: 'SUM (Salón de Usos Múltiples)', tipos: ['sum', 'intendencia'] },
  { value: 'administracion', label: 'Administración / Intendencia', tipos: ['intendencia'] },
]

const CANALES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms',      label: 'SMS' },
]

const EMPTY = {
  dni: '', nombre: '', telefono: '', dependencia: '',
  fecha: '', canal: 'whatsapp', motivo: '',
}

// Busca el vecino por DNI; si no existe, lo crea con el municipio
// que sale de la dependencia elegida.
async function findOrCreateVecino({ dni, nombre, telefono, municipio_id }) {
  const { data: existing, error: selErr } = await supabase
    .from('vecinos')
    .select('id, telefono')
    .eq('dni', dni)
    .limit(1)
  if (selErr) throw selErr
  if (existing && existing[0]) return existing[0]

  // Split simple del nombre completo: primer token = nombre, resto = apellido.
  const partes      = nombre.trim().split(/\s+/)
  const nombreSolo  = partes.shift() ?? ''
  const apellido    = partes.join(' ') || nombreSolo

  const { data: created, error: insErr } = await supabase
    .from('vecinos')
    .insert({
      municipio_id,
      dni,
      nombre:          nombreSolo,
      apellido,
      nombre_completo: nombre,
      telefono,
    })
    .select('id, telefono')
    .single()
  if (insErr) throw insErr
  return created
}

export default function SacarTurnoFormPortal() {
  const [form, setForm]           = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [resultado, setResultado] = useState(null)
  const [deps, setDeps]           = useState([]) // catálogo real para resolver el id
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  useEffect(() => {
    let cancelled = false
    supabase
      .from('dependencias')
      .select('id, municipio_id, tipo, nombre')
      .then(({ data }) => { if (!cancelled) setDeps(data ?? []) })
    return () => { cancelled = true }
  }, [])

  function resolveDep(tipoUI) {
    const opt = DEP_OPTIONS.find(o => o.value === tipoUI)
    if (!opt) return null
    for (const tipo of opt.tipos) {
      const found = deps.find(d => d.tipo === tipo)
      if (found) return found
    }
    return deps[0] ?? null   // último fallback
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const dep = resolveDep(form.dependencia)
      if (!dep) throw new Error('No se encontró la dependencia seleccionada.')

      const v = await findOrCreateVecino({
        dni:          form.dni.trim(),
        nombre:       form.nombre.trim(),
        telefono:     form.telefono.trim(),
        municipio_id: dep.municipio_id,
      })

      // fecha_hora: usamos la fecha elegida + 09:00 hora Argentina
      // como horario tentativo. El operador la ajusta al confirmar.
      const fecha_hora = `${form.fecha}T09:00:00-03:00`

      const { data: turno, error: tErr } = await supabase
        .from('turnos')
        .insert({
          municipio_id:   dep.municipio_id,
          dependencia_id: dep.id,
          vecino_id:      v.id,
          fecha_hora,
          estado:         'pendiente',
          canal:          form.canal,
          motivo:         form.motivo || null,
        })
        .select('id, numero_turno, fecha_hora, estado')
        .single()
      if (tErr) throw tErr

      setResultado({
        numero:   turno?.numero_turno ?? turno?.id?.slice(0, 8),
        canal:    form.canal,
        telefono: form.telefono,
      })
    } catch (e) {
      setError(e?.message ?? 'No pudimos registrar tu turno. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (resultado) {
    const canalLabel = resultado.canal === 'whatsapp' ? 'WhatsApp' : 'SMS'
    return (
      <div className="card p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ok-50 text-ok-700">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-primary">Turno solicitado</h3>
        {resultado.numero && (
          <p className="mt-2 text-sm text-primary-700">
            Tu número de turno: <strong className="text-base">#{resultado.numero}</strong>
          </p>
        )}
        <p className="mt-2 text-sm text-primary-500">
          Te confirmamos por <strong>{canalLabel}</strong> al{' '}
          <strong>{resultado.telefono}</strong> en menos de 24 horas.
        </p>
        <Button
          variant="secondary"
          onClick={() => { setForm(EMPTY); setResultado(null) }}
          className="mt-5"
        >
          Sacar otro turno
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card grid gap-4 p-5 sm:grid-cols-2">
      <Input label="DNI" value={form.dni} onChange={e => set('dni', e.target.value)} required inputMode="numeric" autoComplete="off" />
      <Input label="Nombre completo" value={form.nombre} onChange={e => set('nombre', e.target.value)} required autoComplete="name" />
      <Input label="Teléfono celular" value={form.telefono} onChange={e => set('telefono', e.target.value)} required inputMode="tel" autoComplete="tel" placeholder="+54 9 ..." />
      <Select label="Dependencia" value={form.dependencia} onChange={v => set('dependencia', v)} placeholder="Seleccionar..."
              options={DEP_OPTIONS.map(o => ({ value: o.value, label: o.label }))} />
      <Input label="Fecha preferida" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required />
      <Select label="Canal de contacto" value={form.canal} onChange={v => set('canal', v)} options={CANALES} />
      <div className="sm:col-span-2">
        <label className="mb-1.5 block text-sm font-medium text-primary-700">
          Motivo <span className="font-normal text-primary-400">(opcional)</span>
        </label>
        <textarea
          value={form.motivo}
          onChange={e => set('motivo', e.target.value)}
          rows={3}
          className="input-field resize-none"
          placeholder="Contanos brevemente para qué pedís el turno"
        />
      </div>
      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">
          {error}
        </div>
      )}
      <div className="sm:col-span-2">
        <Button
          type="submit"
          loading={submitting}
          disabled={
            !form.dni || !form.nombre || !form.telefono ||
            !form.dependencia || !form.fecha
          }
          className="w-full"
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
