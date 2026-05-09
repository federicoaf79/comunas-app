import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { todayArgYMD } from '../../lib/datetime'

// =============================================================
// BeneficiarioFormModal — alta de beneficiario de Ayuda Social.
// El staff identifica al vecino por DNI; si no existe, pide
// registrarlo en CRM Vecinal (no se auto-crea).
// =============================================================

function emptyForm() {
  return {
    dni:          '',
    tipo_ayuda:   '',
    descripcion:  '',
    fecha_inicio: todayArgYMD(),
  }
}

export default function BeneficiarioFormModal({
  open, onClose, onSave, municipioId, saving = false,
}) {
  const [form, setForm]     = useState(emptyForm)
  const [vecino, setVec]    = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError]   = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  async function buscarVecino() {
    setError(''); setVec(null)
    if (!form.dni.trim()) return
    setSearching(true)
    try {
      const { data, error } = await supabase
        .from('vecinos')
        .select('id, dni, nombre, apellido, nombre_completo, telefono, municipio_id')
        .eq('dni', form.dni.trim())
        .limit(1)
      if (error) throw error
      const v = data?.[0]
      if (!v) {
        setError('No encontramos un vecino con ese DNI. Registralo primero en CRM Vecinal.')
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
    if (!vecino) {
      setError('Buscá primero el vecino por DNI antes de guardar.')
      return
    }
    if (!municipioId) {
      setError('Tu usuario no tiene un municipio asignado.')
      return
    }
    try {
      await onSave({
        municipio_id: municipioId,
        vecino_id:    vecino.id,
        tipo_ayuda:   form.tipo_ayuda.trim() || null,
        descripcion:  form.descripcion.trim() || null,
        fecha_inicio: form.fecha_inicio,
      })
      setForm(emptyForm())
      setVec(null)
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar el beneficiario.')
    }
  }

  function vecinoLabel(v) {
    if (!v) return ''
    if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
    return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
  }

  const canSubmit = !!vecino && !!form.fecha_inicio && !!form.tipo_ayuda.trim()

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo beneficiario"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>Crear</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="DNI del vecino"
            value={form.dni}
            onChange={e => { set('dni', e.target.value); setVec(null); setError('') }}
            inputMode="numeric"
            type="text"
            autoComplete="off"
            className="flex-1"
            required
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
          label="Tipo de ayuda"
          value={form.tipo_ayuda}
          onChange={e => set('tipo_ayuda', e.target.value)}
          placeholder="Bolsón alimentario, leña, materiales, etc."
          required
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Descripción <span className="font-normal text-primary-400">(opcional)</span>
          </label>
          <textarea
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            rows={3}
            className="input-field resize-none"
            placeholder="Detalle del programa o situación del beneficiario"
          />
        </div>
        <Input
          label="Fecha de inicio"
          type="date"
          value={form.fecha_inicio}
          onChange={e => set('fecha_inicio', e.target.value)}
          required
        />

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
            {error}
          </div>
        )}
        <p className="text-xs text-primary-400">
          Se crea como <strong>activo</strong>. Después podés suspenderlo o darlo de baja desde la lista.
        </p>
      </div>
    </Modal>
  )
}
