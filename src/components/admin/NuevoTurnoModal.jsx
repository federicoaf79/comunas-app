import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import { todayArgYMD, ARG_OFFSET } from '../../lib/datetime'

// =============================================================
// Modal "Nuevo turno" para staff (admin) — busca el vecino por
// DNI en la tabla vecinos. Si no existe, devuelve un error claro
// pidiendo que se registre primero en el CRM (no auto-crea desde
// acá, ese flujo lo hace el form público del portal).
//
// Uso: el padre pasa la dependencia destino (Juzgado, etc.) y
// recibe el turno creado vía onCreated.
// =============================================================

function emptyForm() {
  return {
    dni:    '',
    fecha:  todayArgYMD(),
    hora:   '09:00',
    motivo: '',
  }
}

export default function NuevoTurnoModal({
  open,
  onClose,
  dependencia,        // { id, municipio_id, nombre }
  onCreated,
  saving = false,
}) {
  const [form, setForm]   = useState(emptyForm)
  const [vecino, setVec]  = useState(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  async function buscarVecino() {
    setError('')
    setVec(null)
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
        setError(
          'No encontramos un vecino con ese DNI. Registralo primero en CRM Vecinal.'
        )
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
    if (!dependencia?.id) {
      setError('No hay dependencia destino configurada.')
      return
    }
    try {
      const fecha_hora = `${form.fecha}T${form.hora}:00${ARG_OFFSET}`
      // Descomponer fecha_hora en fecha + hora_inicio + hora_fin
      const dt = new Date(fecha_hora)
      const fecha = dt.toISOString().split('T')[0]
      const hora_inicio = dt.toTimeString().slice(0, 5) // HH:MM
      const dtFin = new Date(dt.getTime() + 30 * 60 * 1000) // +30 min
      const hora_fin = dtFin.toTimeString().slice(0, 5)

      const payload = {
        municipio_id:   dependencia.municipio_id,
        dependencia_id: dependencia.id,
        vecino_id:      vecino.id,
        fecha,
        hora_inicio,
        hora_fin,
        estado:         'pendiente',
        canal:          'presencial',
        motivo:         form.motivo.trim() || null,
      }
      const { data: turno, error: tErr } = await supabase
        .from('turnos_agenda')
        .insert(payload)
        .select('id')
        .single()
      if (tErr) throw tErr

      onCreated?.(turno)
      // Reseteo de estado para próxima apertura.
      setForm(emptyForm())
      setVec(null)
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos crear el turno.')
    }
  }

  function vecinoLabel(v) {
    if (!v) return ''
    if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
    return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
  }

  const canSubmit = !!vecino && !!form.fecha && !!form.hora

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo turno"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>Crear turno</Button>
        </>
      }
    >
      <div className="space-y-4">
        {dependencia && (
          <p className="rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-xs text-primary-700">
            Dependencia destino: <strong>{dependencia.nombre}</strong>
          </p>
        )}

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

        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Fecha"
            type="date"
            value={form.fecha}
            onChange={e => set('fecha', e.target.value)}
            required
          />
          <Input
            label="Hora"
            type="time"
            value={form.hora}
            onChange={e => set('hora', e.target.value)}
            required
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Motivo <span className="font-normal text-primary-400">(opcional)</span>
          </label>
          <textarea
            value={form.motivo}
            onChange={e => set('motivo', e.target.value)}
            rows={3}
            className="input-field resize-none"
            placeholder="Detalle del trámite o consulta"
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
