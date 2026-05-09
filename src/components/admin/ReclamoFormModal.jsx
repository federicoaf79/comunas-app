import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'

// =============================================================
// ReclamoFormModal — alta de reclamo desde el panel.
// El DNI del vecino es opcional: si está, intenta linkear; si no
// se completa, el reclamo queda anónimo (vecino_id = null).
// =============================================================

const PRIORIDADES = [
  { value: 'baja',     label: 'Baja' },
  { value: 'normal',   label: 'Normal' },
  { value: 'alta',     label: 'Alta' },
  { value: 'urgente',  label: 'Urgente' },
]

const CANALES = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'telefono',   label: 'Teléfono' },
  { value: 'web',        label: 'Web' },
  { value: 'whatsapp',   label: 'WhatsApp' },
]

function emptyForm() {
  return {
    dni:         '',
    tipo:        '',
    descripcion: '',
    ubicacion:   '',
    prioridad:   'normal',
    canal:       'presencial',
  }
}

export default function ReclamoFormModal({
  open, onClose, onSave, municipioId, saving = false,
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
        setError('No encontramos un vecino con ese DNI. Podés guardar el reclamo igual sin asociarlo a un vecino.')
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
    if (!municipioId) {
      setError('Tu usuario no tiene un municipio asignado.')
      return
    }
    if (!form.descripcion.trim()) {
      setError('La descripción es obligatoria.')
      return
    }
    try {
      await onSave({
        municipio_id: municipioId,
        vecino_id:    vecino?.id ?? null,
        tipo:         form.tipo.trim() || null,
        descripcion:  form.descripcion.trim(),
        ubicacion:    form.ubicacion.trim() || null,
        prioridad:    form.prioridad,
        canal:        form.canal,
      })
      setForm(emptyForm())
      setVec(null)
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar el reclamo.')
    }
  }

  function vecinoLabel(v) {
    if (!v) return ''
    if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
    return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
  }

  const canSubmit = !!form.descripcion.trim()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo reclamo"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>Crear reclamo</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="DNI del vecino (opcional)"
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
          label="Tipo (opcional)"
          value={form.tipo}
          onChange={e => set('tipo', e.target.value)}
          placeholder="Alumbrado, calle, basura, agua..."
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">Descripción</label>
          <textarea
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            rows={4}
            className="input-field resize-y"
            placeholder="Detalle del reclamo"
            required
          />
        </div>
        <Input
          label="Ubicación (opcional)"
          value={form.ubicacion}
          onChange={e => set('ubicacion', e.target.value)}
          placeholder="Ej: Av. San Martín 1234, esquina Belgrano"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Prioridad"
            value={form.prioridad}
            onChange={v => set('prioridad', v)}
            options={PRIORIDADES}
          />
          <Select
            label="Canal"
            value={form.canal}
            onChange={v => set('canal', v)}
            options={CANALES}
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
            {error}
          </div>
        )}
        <p className="text-xs text-primary-400">
          Se crea como <strong>abierto</strong>. Cambiá el estado desde la lista a medida que se gestione.
        </p>
      </div>
    </Modal>
  )
}
