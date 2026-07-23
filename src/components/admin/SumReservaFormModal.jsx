import { useState } from 'react'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import { todayArgYMD } from '../../lib/datetime'

// =============================================================
// Modal "Nueva reserva del SUM" — el operador carga nombre + DNI
// del solicitante como texto libre. `sum_reservas` NO tiene FK a
// vecinos (columna `solicitante` es texto plano) ni columnas
// hora_inicio/hora_fin/cant_personas — solo `horario` (la franja).
// Ver schema real documentado en useSumReservas.js.
// =============================================================

const HORARIO_OPTS = [
  { value: 'manana',       label: 'Mañana (8:00 – 13:00)' },
  { value: 'tarde',        label: 'Tarde (14:00 – 18:00)' },
  { value: 'noche',        label: 'Noche (19:00 – 23:00)' },
  { value: 'dia_completo', label: 'Día completo (8:00 – 23:00)' },
]

function emptyForm() {
  return {
    nombre:   '',
    dni:      '',
    fecha:    todayArgYMD(),
    horario:  'manana',
    motivo:   '',
    costo:    '',
  }
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
      const dni = form.dni.trim()
      const payload = {
        municipio_id:   dependencia.municipio_id,
        dependencia_id: dependencia.id ?? null,
        solicitante:    dni ? `${form.nombre.trim()} (DNI ${dni})` : form.nombre.trim(),
        fecha:          form.fecha,
        horario:        form.horario,
        motivo:         form.motivo.trim(),
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
