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

// Vínculos comunes — el último ('otro') desbloquea un input texto
// libre para que el ciudadano lo escriba como prefiera.
const VINCULOS = [
  { value: 'hijo',     label: 'Hijo / Hija' },
  { value: 'conyuge',  label: 'Cónyuge / Pareja' },
  { value: 'padre',    label: 'Padre / Madre' },
  { value: 'hermano',  label: 'Hermano / Hermana' },
  { value: 'abuelo',   label: 'Abuelo / Abuela' },
  { value: 'nieto',    label: 'Nieto / Nieta' },
  { value: 'otro',     label: 'Otro familiar' },
]

const EMPTY = {
  // Datos del solicitante (siempre van al vecino_id del turno)
  dni: '', nombre: '', telefono: '',
  // Datos del turno
  dependencia: '', fecha: '', canal: 'whatsapp', motivo: '',
  // ¿Para quién es?
  paraQuien: 'mi',
  // Datos del familiar — solo se usan si paraQuien === 'familiar'
  familiar_nombre: '',
  familiar_dni:    '',
  vinculo:         '',
  vinculo_otro:    '',
  familiar_edad:   '',
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

// Construye el objeto metadata jsonb a guardar en el turno cuando
// el ciudadano sacó turno para un familiar. El vecino_id sigue
// siendo el del solicitante (la persona que llenó el formulario)
// — quién va a atenderse queda registrado acá.
function buildFamiliarMetadata(form) {
  const vinculoFinal =
    form.vinculo === 'otro'
      ? (form.vinculo_otro.trim() || 'otro')
      : form.vinculo
  const edadNum = form.familiar_edad ? Number(form.familiar_edad) : null
  return {
    para_familiar:      true,
    familiar_nombre:    form.familiar_nombre.trim(),
    familiar_dni:       form.familiar_dni.trim(),
    vinculo:            vinculoFinal,
    familiar_edad:      Number.isFinite(edadNum) ? edadNum : null,
    solicitante_nombre: form.nombre.trim(),
    solicitante_dni:    form.dni.trim(),
    solicitante_tel:    form.telefono.trim(),
  }
}

// ─────────────────────────────────────────────────────────────────
// Selector grande tipo "card de radio". Mobile-friendly: cada opción
// tiene 56px de alto mínimo y feedback visual claro de selección.
// ─────────────────────────────────────────────────────────────────
function ParaQuienSelector({ value, onChange }) {
  const options = [
    {
      v:       'mi',
      label:   'Para mí',
      desc:    'El turno es para mí mismo/a.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path strokeLinecap="round" d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      ),
    },
    {
      v:       'familiar',
      label:   'Para un familiar',
      desc:    'Saco el turno por otra persona.',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7" aria-hidden="true">
          <circle cx="9"  cy="8" r="3.2" />
          <circle cx="17" cy="9" r="2.6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 20c.8-3 3.3-5 6-5s5.2 2 6 5M14 20c.6-2 2-3 3.5-3s2.9 1 3.5 3" />
        </svg>
      ),
    },
  ]
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-semibold text-primary-700">
        ¿Para quién es el turno?
      </legend>
      <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
        {options.map(o => {
          const active = value === o.v
          return (
            <label
              key={o.v}
              className={
                'flex min-h-[56px] cursor-pointer items-start gap-3 rounded-lg border-2 p-3 transition-colors ' +
                (active
                  ? 'border-primary bg-primary-50 text-primary'
                  : 'border-border bg-white text-primary-700 hover:border-primary-200 hover:bg-primary-50')
              }
            >
              <input
                type="radio"
                name="para-quien"
                value={o.v}
                checked={active}
                onChange={() => onChange(o.v)}
                className="sr-only"
              />
              <span
                className={
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ' +
                  (active ? 'border-primary bg-primary' : 'border-primary-300 bg-white')
                }
                aria-hidden="true"
              >
                {active && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="h-3 w-3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className={'shrink-0 ' + (active ? 'text-primary' : 'text-primary-500')}>
                {o.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{o.label}</span>
                <span className="mt-0.5 block text-xs text-primary-500">{o.desc}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

// ─────────────────────────────────────────────────────────────────
// Panel "Datos del familiar" — fondo levemente diferente (#F0F4F8)
// para distinguir visualmente que esos datos pertenecen a otra
// persona, no al solicitante.
// ─────────────────────────────────────────────────────────────────
function FamiliarPanel({ form, set }) {
  const showOtroVinculo = form.vinculo === 'otro'
  return (
    <div
      className="rounded-lg border border-primary-100 p-4 sm:p-5"
      style={{ backgroundColor: '#F0F4F8' }}
    >
      <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
        Datos del familiar
      </h3>
      <p className="mt-1 text-xs text-primary-500 sm:text-sm">
        Completá los datos de la persona que va a atenderse.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Nombre completo del familiar"
          value={form.familiar_nombre}
          onChange={e => set('familiar_nombre', e.target.value)}
          required
          autoComplete="off"
        />
        <Input
          label="DNI del familiar"
          value={form.familiar_dni}
          onChange={e => set('familiar_dni', e.target.value)}
          required
          inputMode="numeric"
          type="text"
          autoComplete="off"
        />
        <Select
          label="Vínculo familiar"
          value={form.vinculo}
          onChange={v => set('vinculo', v)}
          placeholder="Seleccionar..."
          options={VINCULOS}
        />
        <Input
          label="Edad (opcional)"
          value={form.familiar_edad}
          onChange={e => set('familiar_edad', e.target.value.replace(/[^\d]/g, ''))}
          inputMode="numeric"
          type="text"
          autoComplete="off"
          placeholder="Ej: 8"
        />
        {showOtroVinculo && (
          <div className="sm:col-span-2">
            <Input
              label="Especificá el vínculo"
              value={form.vinculo_otro}
              onChange={e => set('vinculo_otro', e.target.value)}
              placeholder="Ej: Tío/a, primo/a, suegro/a..."
              required
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────
export default function SacarTurnoFormPortal() {
  const [form, setForm]           = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [resultado, setResultado] = useState(null)
  const [deps, setDeps]           = useState([])
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
    return deps[0] ?? null
  }

  const isFamiliar = form.paraQuien === 'familiar'

  // Validación: para enviar necesitamos los datos básicos del
  // solicitante + dependencia + fecha. Si es para un familiar,
  // además requerimos nombre/DNI/vínculo del familiar (y el texto
  // libre cuando vínculo === 'otro').
  const canSubmit =
    !!form.dni && !!form.nombre && !!form.telefono &&
    !!form.dependencia && !!form.fecha &&
    (!isFamiliar || (
      !!form.familiar_nombre.trim() &&
      !!form.familiar_dni.trim() &&
      !!form.vinculo &&
      (form.vinculo !== 'otro' || !!form.vinculo_otro.trim())
    ))

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

      const payload = {
        municipio_id:   dep.municipio_id,
        dependencia_id: dep.id,
        vecino_id:      v.id,
        fecha_hora,
        estado:         'pendiente',
        canal:          form.canal,
        motivo:         form.motivo || null,
      }
      if (isFamiliar) {
        payload.metadata = buildFamiliarMetadata(form)
      }

      const { data: turno, error: tErr } = await supabase
        .from('turnos')
        .insert(payload)
        .select('id, numero_turno, fecha_hora, estado')
        .single()
      if (tErr) throw tErr

      setResultado({
        numero:          turno?.numero_turno ?? turno?.id?.slice(0, 8),
        canal:           form.canal,
        telefono:        form.telefono,
        para_familiar:   isFamiliar,
        familiar_nombre: form.familiar_nombre,
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
        {resultado.para_familiar && resultado.familiar_nombre && (
          <p className="mt-2 text-sm text-primary-500">
            El turno fue registrado a nombre de{' '}
            <strong className="text-primary-700">{resultado.familiar_nombre}</strong>.
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
    <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-5">
      {/* ¿Para quién es? */}
      <ParaQuienSelector value={form.paraQuien} onChange={v => set('paraQuien', v)} />

      {/* Datos del solicitante (= persona que llena el formulario) */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-primary">
          {isFamiliar ? 'Tus datos (solicitante)' : 'Tus datos'}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="DNI"
            value={form.dni}
            onChange={e => set('dni', e.target.value)}
            required
            inputMode="numeric"
            type="text"
            autoComplete="off"
          />
          <Input
            label="Nombre completo"
            value={form.nombre}
            onChange={e => set('nombre', e.target.value)}
            required
            autoComplete="name"
          />
          <Input
            label="Teléfono celular"
            value={form.telefono}
            onChange={e => set('telefono', e.target.value)}
            required
            inputMode="tel"
            type="tel"
            autoComplete="tel"
            placeholder="+54 9 ..."
          />
          <Select
            label="Canal de contacto"
            value={form.canal}
            onChange={v => set('canal', v)}
            options={CANALES}
          />
        </div>
      </div>

      {/* Datos del familiar — sólo en modo "para familiar" */}
      {isFamiliar && <FamiliarPanel form={form} set={set} />}

      {/* Datos del turno */}
      <div>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-primary">
          Datos del turno
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Dependencia"
            value={form.dependencia}
            onChange={v => set('dependencia', v)}
            placeholder="Seleccionar..."
            options={DEP_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          />
          <Input
            label="Fecha preferida"
            type="date"
            value={form.fecha}
            onChange={e => set('fecha', e.target.value)}
            required
          />
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-primary-700">
              Motivo <span className="font-normal text-primary-400">(opcional)</span>
            </label>
            <textarea
              value={form.motivo}
              onChange={e => set('motivo', e.target.value)}
              rows={3}
              className="input-field resize-none"
              placeholder={
                isFamiliar
                  ? 'Contanos brevemente para qué pedís el turno (síntomas, motivo de consulta, etc.)'
                  : 'Contanos brevemente para qué pedís el turno'
              }
            />
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      <div>
        <Button
          type="submit"
          loading={submitting}
          disabled={!canSubmit}
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
