import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import { todayArgYMD } from '../../lib/datetime'

// =============================================================
// ExpedienteFormModal — alta de expediente del Juzgado de Paz.
// El vecino (parte solicitante) se identifica por DNI; si no
// existe en CRM Vecinal se permite cargar contraparte/parte
// libre (testigos, terceros). Tipos sugeridos por el área.
// =============================================================

const TIPO_OPTS = [
  { value: 'acta_matrimonio',         label: 'Acta de matrimonio civil' },
  { value: 'certificado_domicilio',   label: 'Certificado de domicilio' },
  { value: 'certificado_convivencia', label: 'Certificado de convivencia' },
  { value: 'notificacion',            label: 'Notificación judicial' },
  { value: 'conciliacion',            label: 'Conciliación / mediación' },
  { value: 'contravencion',           label: 'Contravención' },
  { value: 'auxilio_judicial',        label: 'Auxilio judicial' },
  { value: 'otro',                    label: 'Otro' },
]

const PRIORIDAD_OPTS = [
  { value: 'baja',     label: 'Baja' },
  { value: 'normal',   label: 'Normal' },
  { value: 'alta',     label: 'Alta' },
  { value: 'urgente',  label: 'Urgente' },
]

function emptyForm() {
  return {
    numero:            '',
    tipo:              'certificado_domicilio',
    caratula:          '',
    prioridad:         'normal',
    dni:               '',
    contraparte:       '',
    fecha_apertura:    todayArgYMD(),
    proxima_audiencia: '',
    observaciones:     '',
  }
}

export default function ExpedienteFormModal({
  open, onClose, onSave, saving = false,
}) {
  const [form, setForm]   = useState(emptyForm)
  const [vecino, setVec]  = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  async function buscarVecino() {
    setError(''); setVec(null)
    if (!form.dni.trim()) return
    setSearching(true)
    try {
      const { data, error } = await supabase
        .from('vecinos')
        .select('id, dni, nombre, apellido, nombre_completo, telefono')
        .eq('dni', form.dni.trim())
        .limit(1)
      if (error) throw error
      const v = data?.[0]
      if (!v) {
        setError('No encontramos un vecino con ese DNI. Podés dejar el campo vacío y cargar la parte solicitante como contraparte libre.')
        return
      }
      setVec(v)
    } catch (e) {
      setError(e?.message ?? 'No pudimos buscar el vecino.')
    } finally {
      setSearching(false)
    }
  }

  async function handleSave() {
    setError('')
    if (!form.numero.trim())   { setError('Cargá un número de expediente.'); return }
    if (!form.caratula.trim()) { setError('Cargá la carátula del expediente.'); return }
    try {
      await onSave({
        numero:            form.numero.trim(),
        tipo:              form.tipo,
        caratula:          form.caratula.trim(),
        prioridad:         form.prioridad,
        vecino_id:         vecino?.id ?? null,
        contraparte:       form.contraparte.trim() || null,
        fecha_apertura:    form.fecha_apertura,
        proxima_audiencia: form.proxima_audiencia || null,
        observaciones:     form.observaciones.trim() || null,
      })
      setForm(emptyForm())
      setVec(null)
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar el expediente.')
    }
  }

  function vecinoLabel(v) {
    if (!v) return ''
    if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
    return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
  }

  const canSubmit = form.numero.trim() && form.caratula.trim()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo expediente"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>Crear</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Número de expediente"
            value={form.numero}
            onChange={e => set('numero', e.target.value)}
            placeholder="JP-2026-0001"
            required
          />
          <Input
            label="Fecha de apertura"
            type="date"
            value={form.fecha_apertura}
            onChange={e => set('fecha_apertura', e.target.value)}
            required
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Tipo"
            value={form.tipo}
            onChange={v => set('tipo', v)}
            options={TIPO_OPTS}
          />
          <Select
            label="Prioridad"
            value={form.prioridad}
            onChange={v => set('prioridad', v)}
            options={PRIORIDAD_OPTS}
          />
        </div>

        <Input
          label="Carátula"
          value={form.caratula}
          onChange={e => set('caratula', e.target.value)}
          placeholder="Pérez, Juan s/ Certificado de Domicilio"
          required
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="DNI del solicitante (opcional)"
            value={form.dni}
            onChange={e => { set('dni', e.target.value); setVec(null) }}
            inputMode="numeric"
            type="text"
            autoComplete="off"
            className="flex-1"
          />
          <Button
            variant="secondary"
            onClick={buscarVecino}
            loading={searching}
            disabled={!form.dni.trim()}
            type="button"
          >
            Buscar
          </Button>
        </div>

        {vecino && (
          <div className="rounded-md border border-ok-100 bg-ok-50 p-3 text-sm text-ok-700">
            <p className="font-semibold">{vecinoLabel(vecino)}</p>
            <p className="text-xs text-ok-700/80">DNI {vecino.dni}{vecino.telefono ? ` · ${vecino.telefono}` : ''}</p>
          </div>
        )}

        <Input
          label="Contraparte / otra parte (opcional)"
          value={form.contraparte}
          onChange={e => set('contraparte', e.target.value)}
          placeholder="Ej.: García, María (testigo) — o nombre completo si no es vecino registrado"
        />

        <Input
          label="Próxima audiencia (opcional)"
          type="datetime-local"
          value={form.proxima_audiencia}
          onChange={e => set('proxima_audiencia', e.target.value)}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Observaciones <span className="font-normal text-primary-400">(opcional)</span>
          </label>
          <textarea
            value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)}
            rows={3}
            className="input-field resize-none"
            placeholder="Antecedentes, contexto, instrucciones para el equipo del juzgado…"
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
            {error}
          </div>
        )}
        <p className="text-xs text-primary-400">
          Se crea con estado <strong>abierto</strong>. Después podés moverlo a "en proceso", "cerrado" o "derivado" desde la lista.
        </p>
      </div>
    </Modal>
  )
}
