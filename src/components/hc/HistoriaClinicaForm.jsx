import { useMemo, useState } from 'react'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import { barrios } from '../../lib/mockData'
import {
  GRUPOS_SANGUINEOS_OPTS, SEXO_OPTS,
  validateDniArg, normalizePhoneE164, validateFechaNac,
  splitApellidoNombre,
} from '../../lib/historiaClinica'

// =============================================================
// HistoriaClinicaForm — form reusable con los campos obligatorios
// de la primera HC del vecino.
//
// Props:
//   initial      → datos iniciales (vecino existente con HC incompleta,
//                  o el seed que viene del buscador: nombre/dni preset).
//   onSubmit     → handler async que recibe el payload normalizado.
//                  Debe lanzar para que el form muestre el error.
//   onCancel     → opcional. Si no se pasa, no se muestra el botón.
//   submitLabel  → texto del botón principal (default "Guardar HC").
//   intro        → bloque opcional arriba del form (banner explicativo).
//
// El form valida en cliente y NO deja submit hasta que todos los
// campos obligatorios estén completos. La validación cruzada de DNI
// único por municipio la hace la DB con su UNIQUE constraint.
// =============================================================

function emptyForm(initial = {}) {
  return {
    apellidoNombre: initial.apellidoNombre ??
                    (initial.apellido && initial.nombre
                      ? `${initial.apellido}, ${initial.nombre}`
                      : (initial.nombre_completo ?? '')),
    dni:                          initial.dni ?? '',
    fecha_nac:                    initial.fecha_nac ?? '',
    telefono:                     initial.telefono ?? '',
    sexo:                         initial.sexo ?? '',
    grupo_sanguineo:              initial.grupo_sanguineo ?? '',
    alergias:                     Array.isArray(initial.alergias) ? initial.alergias : [],
    sin_alergias_conocidas:       !!initial.sin_alergias_conocidas,
    barrio:                       initial.barrio ?? '',
    localidad:                    initial.localidad ?? '',
    contacto_emergencia_nombre:   initial.contacto_emergencia_nombre ?? '',
    contacto_emergencia_telefono: initial.contacto_emergencia_telefono ?? '',
  }
}

export default function HistoriaClinicaForm({
  initial, onSubmit, onCancel,
  submitLabel = 'Guardar HC',
  intro,
}) {
  const [form, setForm] = useState(() => emptyForm(initial))
  const [tag, setTag]   = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  function addAlergia() {
    const t = tag.trim()
    if (!t) return
    if (form.alergias.includes(t)) { setTag(''); return }
    set('alergias', [...form.alergias, t])
    // Apenas hay alergias, "sin alergias conocidas" deja de aplicar.
    set('sin_alergias_conocidas', false)
    setTag('')
  }
  function removeAlergia(t) {
    set('alergias', form.alergias.filter(x => x !== t))
  }
  function onTagKey(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addAlergia()
    } else if (e.key === 'Backspace' && !tag && form.alergias.length > 0) {
      // backspace en input vacío borra el último tag.
      removeAlergia(form.alergias[form.alergias.length - 1])
    }
  }

  // Validación campo a campo. Devuelve { errores, payload } donde
  // payload es el objeto normalizado listo para .insert/.update en
  // Supabase (telefono ya en E.164, dni solo dígitos, alergias como
  // array). Si hay errores, payload queda null.
  const { errores, payload } = useMemo(() => {
    const e = {}
    const { apellido, nombre } = splitApellidoNombre(form.apellidoNombre)
    if (!apellido && !nombre) {
      e.apellidoNombre = 'Cargá apellido y nombre.'
    }

    const dniRes = validateDniArg(form.dni)
    if (!dniRes.ok) e.dni = dniRes.error

    const fechaRes = validateFechaNac(form.fecha_nac)
    if (!fechaRes.ok) e.fecha_nac = fechaRes.error

    const telRes = normalizePhoneE164(form.telefono)
    if (!telRes.ok) e.telefono = telRes.error

    if (!form.sexo)             e.sexo = 'Seleccioná un valor.'
    if (!form.grupo_sanguineo)  e.grupo_sanguineo = 'Seleccioná el grupo.'

    if (form.alergias.length === 0 && !form.sin_alergias_conocidas) {
      e.alergias = 'Confirmá "sin alergias conocidas" o agregá alergias.'
    }

    if (!form.barrio?.trim() && !form.localidad?.trim()) {
      e.barrio = 'Cargá al menos barrio o localidad.'
    }

    if (!form.contacto_emergencia_nombre?.trim()) {
      e.contacto_emergencia_nombre = 'Obligatorio.'
    }
    const cEmTel = normalizePhoneE164(form.contacto_emergencia_telefono)
    if (!cEmTel.ok) e.contacto_emergencia_telefono = cEmTel.error

    if (Object.keys(e).length > 0) {
      return { errores: e, payload: null }
    }

    return {
      errores: e,
      payload: {
        apellido:                     apellido || null,
        nombre:                       nombre   || apellido,
        nombre_completo:              [nombre, apellido].filter(Boolean).join(' ') || apellido,
        dni:                          dniRes.value,
        fecha_nac:                    fechaRes.value,
        telefono:                     telRes.value,
        sexo:                         form.sexo,
        grupo_sanguineo:              form.grupo_sanguineo,
        alergias:                     form.alergias,
        sin_alergias_conocidas:       form.alergias.length === 0
                                        ? !!form.sin_alergias_conocidas
                                        : false,
        barrio:                       form.barrio?.trim() || null,
        localidad:                    form.localidad?.trim() || null,
        contacto_emergencia_nombre:   form.contacto_emergencia_nombre.trim(),
        contacto_emergencia_telefono: cEmTel.value,
      },
    }
  }, [form])

  const formInvalido = Object.keys(errores).length > 0

  async function handleSubmit(e) {
    e?.preventDefault?.()
    if (formInvalido || !payload) return
    setError('')
    setSaving(true)
    try {
      await onSubmit(payload)
    } catch (err) {
      setError(err?.message ?? 'No se pudo guardar la historia clínica.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {intro}

      {/* ── Datos personales ───────────────────────────── */}
      <section>
        <h4 className="font-sora text-sm font-semibold text-primary">Datos personales</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Input
              label="Apellido y nombre *"
              value={form.apellidoNombre}
              onChange={e => set('apellidoNombre', e.target.value)}
              placeholder="Pérez, Juan"
              error={errores.apellidoNombre}
              autoComplete="off"
            />
          </div>
          <Input
            label="DNI *"
            value={form.dni}
            onChange={e => set('dni', e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            placeholder="12345678"
            error={errores.dni}
            autoComplete="off"
          />
          <Input
            label="Fecha de nacimiento *"
            type="date"
            value={form.fecha_nac}
            onChange={e => set('fecha_nac', e.target.value)}
            error={errores.fecha_nac}
          />
          <Input
            label="Teléfono *"
            value={form.telefono}
            onChange={e => set('telefono', e.target.value)}
            placeholder="+54 9 3854 110001"
            error={errores.telefono}
            autoComplete="off"
          />
          <Select
            label="Sexo *"
            value={form.sexo}
            onChange={v => set('sexo', v)}
            placeholder="Seleccionar"
            options={SEXO_OPTS}
          />
          {errores.sexo && <p className="-mt-2 text-xs text-danger sm:col-start-2">{errores.sexo}</p>}
        </div>
      </section>

      {/* ── Datos clínicos ─────────────────────────────── */}
      <section>
        <h4 className="font-sora text-sm font-semibold text-primary">Datos clínicos</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Select
            label="Grupo sanguíneo *"
            value={form.grupo_sanguineo}
            onChange={v => set('grupo_sanguineo', v)}
            placeholder="Seleccionar"
            options={GRUPOS_SANGUINEOS_OPTS}
          />
          {errores.grupo_sanguineo && (
            <p className="-mt-2 text-xs text-danger">{errores.grupo_sanguineo}</p>
          )}
          <div className="sm:col-span-2">
            <label className="text-sm font-medium text-primary-700">Alergias *</label>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-white px-2 py-2">
              {form.alergias.map(a => (
                <span
                  key={a}
                  className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-danger ring-1 ring-inset ring-red-100"
                >
                  {a}
                  <button
                    type="button"
                    onClick={() => removeAlergia(a)}
                    className="text-danger/70 hover:text-danger"
                    aria-label={`Quitar alergia ${a}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                value={tag}
                onChange={e => setTag(e.target.value)}
                onKeyDown={onTagKey}
                onBlur={addAlergia}
                placeholder={form.alergias.length === 0 ? 'Penicilina, polen, mariscos…' : 'Agregar otra y Enter'}
                className="min-w-[120px] flex-1 border-0 bg-transparent text-sm text-primary-700 placeholder-primary-300 focus:outline-none focus:ring-0"
              />
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-primary-700">
              <input
                type="checkbox"
                checked={form.sin_alergias_conocidas}
                onChange={e => {
                  set('sin_alergias_conocidas', e.target.checked)
                  if (e.target.checked) set('alergias', [])
                }}
                className="h-4 w-4 rounded border-border accent-primary"
              />
              Confirmo que el paciente declara <strong>sin alergias conocidas</strong>.
            </label>
            {errores.alergias && (
              <p className="mt-1 text-xs text-danger">{errores.alergias}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Domicilio ──────────────────────────────────── */}
      <section>
        <h4 className="font-sora text-sm font-semibold text-primary">Domicilio</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Select
            label="Barrio"
            value={form.barrio}
            onChange={v => set('barrio', v)}
            placeholder="Seleccionar…"
            options={barrios.map(b => ({ value: b, label: b }))}
          />
          <Input
            label="Localidad"
            value={form.localidad}
            onChange={e => set('localidad', e.target.value)}
            placeholder="Real Sayana"
            error={errores.barrio /* el cross-error muestra acá si ninguno está */}
          />
        </div>
      </section>

      {/* ── Contacto de emergencia ─────────────────────── */}
      <section>
        <h4 className="font-sora text-sm font-semibold text-primary">Contacto de emergencia</h4>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input
            label="Nombre *"
            value={form.contacto_emergencia_nombre}
            onChange={e => set('contacto_emergencia_nombre', e.target.value)}
            placeholder="Madre, hijo/a, cónyuge…"
            error={errores.contacto_emergencia_nombre}
          />
          <Input
            label="Teléfono *"
            value={form.contacto_emergencia_telefono}
            onChange={e => set('contacto_emergencia_telefono', e.target.value)}
            placeholder="+54 9 3854 110001"
            error={errores.contacto_emergencia_telefono}
          />
        </div>
      </section>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
          {error}
        </div>
      )}

      {/* Acciones */}
      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="secondary" type="button" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={saving} disabled={formInvalido || saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
