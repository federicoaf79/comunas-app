import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import { todayArgYMD } from '../../lib/datetime'

// =============================================================
// Modal "Nueva reserva del SUM" — el operador carga los datos
// del solicitante (nombre + DNI) y la reserva. Si el DNI ya
// existe en `vecinos`, lo reusamos; si no, lo creamos al vuelo
// (registro mínimo: nombre, dni, municipio).
// =============================================================

const HORARIO_OPTS = [
  { value: 'manana',       label: 'Mañana (8:00 – 13:00)',  hi: '08:00', hf: '13:00' },
  { value: 'tarde',        label: 'Tarde (14:00 – 18:00)',  hi: '14:00', hf: '18:00' },
  { value: 'noche',        label: 'Noche (19:00 – 23:00)',  hi: '19:00', hf: '23:00' },
  { value: 'dia_completo', label: 'Día completo (8:00 – 23:00)', hi: '08:00', hf: '23:00' },
]

function emptyForm() {
  return {
    nombre:   '',
    dni:      '',
    fecha:    todayArgYMD(),
    horario:  'manana',
    motivo:   '',
    costo:    '',
    cant_personas: '',
  }
}

async function findOrCreateVecino({ dni, nombre, municipio_id }) {
  const { data: existing, error: selErr } = await supabase
    .from('vecinos')
    .select('id')
    .eq('dni', dni)
    .limit(1)
  if (selErr) throw selErr
  if (existing && existing[0]) return existing[0]

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
    })
    .select('id')
    .single()
  if (insErr) throw insErr
  return created
}

export default function SumReservaFormModal({
  open,
  onClose,
  onSave,
  dependencia,   // { id, municipio_id, nombre } — la dep "SUM"
  saving = false,
}) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const horarioObj = HORARIO_OPTS.find(h => h.value === form.horario) ?? HORARIO_OPTS[0]

  const canSubmit =
    !!form.nombre.trim() &&
    !!form.dni.trim() &&
    !!form.fecha &&
    !!form.horario &&
    !!form.motivo.trim()

  async function handleSave() {
    setError('')
    if (!dependencia?.municipio_id) {
      setError('No hay municipio asignado a la dependencia SUM.')
      return
    }
    try {
      const vecino = await findOrCreateVecino({
        dni:          form.dni.trim(),
        nombre:       form.nombre.trim(),
        municipio_id: dependencia.municipio_id,
      })
      const payload = {
        municipio_id:   dependencia.municipio_id,
        dependencia_id: dependencia.id ?? null,
        vecino_id:      vecino.id,
        fecha:          form.fecha,
        hora_inicio:    horarioObj.hi,
        hora_fin:       horarioObj.hf,
        motivo:         form.motivo.trim(),
        cant_personas:  form.cant_personas ? Number(form.cant_personas) : null,
        costo:          form.costo === '' ? 0 : Number(form.costo),
        estado:         'pendiente',
      }
      await onSave(payload)
      setForm(emptyForm())
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar la reserva.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva reserva del SUM"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>Guardar reserva</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nombre del solicitante"
          value={form.nombre}
          onChange={e => set('nombre', e.target.value)}
          required
          autoComplete="name"
        />
        <Input
          label="DNI del solicitante"
          value={form.dni}
          onChange={e => set('dni', e.target.value)}
          required
          inputMode="numeric"
          type="text"
        />
        <Input
          label="Fecha"
          type="date"
          value={form.fecha}
          onChange={e => set('fecha', e.target.value)}
          required
        />
        <Select
          label="Horario"
          value={form.horario}
          onChange={v => set('horario', v)}
          options={HORARIO_OPTS.map(h => ({ value: h.value, label: h.label }))}
        />
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-primary-700">Motivo</label>
          <textarea
            value={form.motivo}
            onChange={e => set('motivo', e.target.value)}
            rows={3}
            className="input-field resize-none"
            placeholder="Cumpleaños, evento deportivo, capacitación, etc."
            required
          />
        </div>
        <Input
          label="Costo (ARS)"
          type="number"
          inputMode="decimal"
          min="0"
          step="100"
          value={form.costo}
          onChange={e => set('costo', e.target.value)}
          placeholder="0 si es sin cargo"
        />
        <Input
          label="Cantidad de personas (opcional)"
          type="number"
          inputMode="numeric"
          min="1"
          max="150"
          value={form.cant_personas}
          onChange={e => set('cant_personas', e.target.value)}
          placeholder="Capacidad máxima: 150"
        />
        <p className="text-xs text-primary-400 sm:col-span-2">
          Se crea como <strong>pendiente</strong>. Un administrador de comuna puede aprobarla o rechazarla después.
        </p>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
