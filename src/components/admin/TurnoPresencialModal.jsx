import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import Avatar from '../ui/Avatar'
import { todayArgYMD, ARG_OFFSET } from '../../lib/datetime'

// =============================================================
// TurnoPresencialModal — alta rápida de turno presencial desde
// Sala PA. El recepcionista busca al vecino por DNI o nombre.
// Si no figura en CRM Vecinal, puede cargar el turno como
// "vecino sin registro" tipeando un nombre libre — en ese caso
// vecino_id queda null y la planilla muestra el nombre libre
// en el campo motivo/metadata.
// =============================================================

const HORA_AHORA = () => {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function emptyForm() {
  return {
    query:           '',
    sinRegistro:     false,
    nombreLibre:     '',
    motivo:          '',
    hora:            HORA_AHORA(),
  }
}

function vecinoLabel(v) {
  if (!v) return ''
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

export default function TurnoPresencialModal({
  open, onClose, onCreated,
  dependencia,        // { id, municipio_id, nombre }
  profesionalId = null,
  municipioId   = null,
}) {
  const [form, setForm]   = useState(emptyForm)
  const [vecino, setVec]  = useState(null)
  const [candidatos, setCandidatos] = useState([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  // Reset al cerrar/reabrir para no arrastrar estado entre altas.
  useEffect(() => {
    if (!open) return
    setForm(emptyForm())
    setVec(null)
    setCandidatos([])
    setError('')
  }, [open])

  // Debounce de búsqueda: 250ms desde el último cambio del query.
  // No buscamos si está marcado "sin registro" (UI muestra input
  // de nombre libre en su lugar).
  useEffect(() => {
    if (!open || form.sinRegistro) { setCandidatos([]); return }
    const term = form.query.trim()
    if (term.length < 2) { setCandidatos([]); return }
    let cancel = false
    setSearching(true)
    const id = setTimeout(async () => {
      try {
        // Si el query parece DNI (solo dígitos), priorizo match exacto.
        const esNumerico = /^\d{6,}$/.test(term)
        const pattern = `%${term.replace(/[%_]/g, '\\$&')}%`
        let q = supabase
          .from('vecinos')
          .select('id, dni, nombre, apellido, nombre_completo, telefono, municipio_id')
          .limit(8)
        if (esNumerico) {
          q = q.or(`dni.eq.${term},dni.ilike.${pattern}`)
        } else {
          q = q.or(`apellido.ilike.${pattern},nombre.ilike.${pattern},nombre_completo.ilike.${pattern},dni.ilike.${pattern}`)
        }
        if (municipioId) q = q.eq('municipio_id', municipioId)
        const { data, error: err } = await q
        if (cancel) return
        if (err) throw err
        setCandidatos(data ?? [])
      } catch (e) {
        if (!cancel) setError(e?.message ?? 'No pudimos buscar el vecino.')
      } finally {
        if (!cancel) setSearching(false)
      }
    }, 250)
    return () => { cancel = true; clearTimeout(id) }
  }, [form.query, form.sinRegistro, open, municipioId])

  const canSubmit = useMemo(() => {
    if (!form.hora) return false
    if (form.sinRegistro) return !!form.nombreLibre.trim()
    return !!vecino?.id
  }, [form, vecino])

  async function handleSave() {
    setError('')
    if (!dependencia?.id) {
      setError('No hay dependencia destino configurada.')
      return
    }
    setSaving(true)
    try {
      const fecha = todayArgYMD()
      const fecha_hora = `${fecha}T${form.hora}:00${ARG_OFFSET}`
      const motivoTexto = form.sinRegistro
        ? [form.nombreLibre.trim(), form.motivo.trim()].filter(Boolean).join(' — ')
        : (form.motivo.trim() || null)
      const payload = {
        municipio_id:   dependencia.municipio_id ?? municipioId ?? null,
        dependencia_id: dependencia.id,
        vecino_id:      form.sinRegistro ? null : vecino?.id ?? null,
        profesional_id: profesionalId ?? null,
        fecha_hora,
        estado:         'confirmado',
        canal:          'presencial',
        motivo:         motivoTexto,
        ...(form.sinRegistro
          ? { metadata: { sin_registro: true, nombre_libre: form.nombreLibre.trim() } }
          : {}),
      }
      const { data: row, error: tErr } = await supabase
        .from('turnos')
        .insert(payload)
        .select('id')
        .single()
      if (tErr) throw tErr
      onCreated?.(row)
      onClose?.()
    } catch (e) {
      setError(e?.message ?? 'No pudimos crear el turno.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nuevo turno presencial"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>Crear turno</Button>
        </>
      }
    >
      <div className="space-y-4">
        {dependencia?.nombre && (
          <p className="rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-xs text-primary-700">
            Dependencia: <strong>{dependencia.nombre}</strong> · Fecha de hoy ({todayArgYMD()})
          </p>
        )}

        {!form.sinRegistro && (
          <>
            <Input
              label="Buscar vecino"
              value={form.query}
              onChange={e => { set('query', e.target.value); setVec(null) }}
              placeholder="DNI o nombre…"
              autoComplete="off"
            />

            {vecino && (
              <div className="flex items-center gap-3 rounded-md border border-ok-100 bg-ok-50 p-3 text-sm">
                <Avatar name={vecinoLabel(vecino)} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ok-700">{vecinoLabel(vecino)}</p>
                  <p className="text-xs text-ok-700/80">
                    DNI {vecino.dni}{vecino.telefono ? ` · ${vecino.telefono}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setVec(null)}
                  className="text-xs font-medium text-primary-500 hover:text-primary"
                >
                  Cambiar
                </button>
              </div>
            )}

            {!vecino && form.query.trim().length >= 2 && (
              <div className="rounded-md border border-border bg-white">
                {searching ? (
                  <div className="flex items-center justify-center py-4"><Spinner size="sm" /></div>
                ) : candidatos.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-primary-400">
                    Sin coincidencias en CRM Vecinal.
                  </p>
                ) : (
                  <ul className="max-h-56 divide-y divide-border overflow-y-auto">
                    {candidatos.map(v => (
                      <li key={v.id}>
                        <button
                          type="button"
                          onClick={() => { setVec(v); set('query', '') }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-primary-50"
                        >
                          <Avatar name={vecinoLabel(v)} size="sm" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-primary">{vecinoLabel(v)}</p>
                            <p className="truncate text-xs text-primary-400">
                              DNI {v.dni}{v.telefono ? ` · ${v.telefono}` : ''}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}

        <label className="flex items-start gap-2 rounded-md border border-border bg-primary-50/40 p-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.sinRegistro}
            onChange={e => {
              set('sinRegistro', e.target.checked)
              setVec(null)
              setCandidatos([])
            }}
            className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-primary">Vecino sin registro</p>
            <p className="text-xs text-primary-400">
              Cargar el turno con nombre libre — el vecino no figura en CRM Vecinal.
            </p>
          </div>
        </label>

        {form.sinRegistro && (
          <Input
            label="Nombre del paciente"
            value={form.nombreLibre}
            onChange={e => set('nombreLibre', e.target.value)}
            placeholder="Apellido, Nombre"
            required
            autoComplete="off"
          />
        )}

        <Input
          label="Hora del turno"
          type="time"
          value={form.hora}
          onChange={e => set('hora', e.target.value)}
          required
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Motivo <span className="font-normal text-primary-400">(opcional)</span>
          </label>
          <textarea
            value={form.motivo}
            onChange={e => set('motivo', e.target.value)}
            rows={3}
            className="input-field resize-none"
            placeholder="Síntomas, motivo de consulta…"
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
