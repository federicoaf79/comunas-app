import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { createVecino } from '../../hooks/useVecinos'
import { useQueryClient } from '@tanstack/react-query'
import { barrios } from '../../lib/mockData'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import Avatar from '../ui/Avatar'
import { todayArgYMD, ARG_OFFSET } from '../../lib/datetime'

// =============================================================
// TurnoPresencialModal — alta rápida de turno presencial desde
// Sala PA.
//
// Flujo:
//   1) Buscador (DNI o nombre) con resultados live.
//   2) Si encuentra vecinos → cards seleccionables.
//   3) Si NO encuentra → empty state con CTA "Dar de alta como
//      vecino nuevo" → formulario inline de creación. Al guardar
//      el vecino queda preseleccionado para el turno (no hay
//      flujo "sin registro" — todo turno presencial deja vecino
//      en CRM Vecinal).
//   4) Hora + motivo + crear turno (estado='confirmado',
//      canal='presencial').
// =============================================================

const HORA_AHORA = () => {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const ZONA_OPTS = [
  { value: 'urbano', label: 'Urbano' },
  { value: 'rural',  label: 'Rural' },
]

function emptyTurnoForm() {
  return { query: '', motivo: '', hora: HORA_AHORA() }
}

function emptyAltaForm() {
  return {
    apellidoNombre: '',
    dni:            '',
    telefono:       '',
    zona:           'urbano',
    barrio:         '',
  }
}

function vecinoLabel(v) {
  if (!v) return ''
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

// "Pérez, Juan" → { apellido: 'Pérez', nombre: 'Juan' }
// "Pérez Juan"  → { apellido: 'Pérez', nombre: 'Juan' }
// "Juan"        → { apellido: '',      nombre: 'Juan' }
function splitApellidoNombre(s) {
  const t = (s ?? '').trim()
  if (!t) return { apellido: '', nombre: '' }
  if (t.includes(',')) {
    const [ap, ...resto] = t.split(',')
    return { apellido: ap.trim(), nombre: resto.join(',').trim() }
  }
  const parts = t.split(/\s+/)
  if (parts.length === 1) return { apellido: '', nombre: parts[0] }
  return { apellido: parts[0], nombre: parts.slice(1).join(' ') }
}

export default function TurnoPresencialModal({
  open, onClose, onCreated,
  dependencia,        // { id, municipio_id, nombre }
  profesionalId = null,
  municipioId   = null,
}) {
  const qc = useQueryClient()

  const [form, setForm]     = useState(emptyTurnoForm)
  const [vecino, setVec]    = useState(null)
  const [candidatos, setCandidatos] = useState([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched]   = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // Form de alta de vecino — colapsado por default. Se monta cuando
  // el usuario apreta "Dar de alta como vecino nuevo".
  const [altaOpen, setAltaOpen] = useState(false)
  const [alta, setAlta]         = useState(emptyAltaForm)
  const [creandoVecino, setCreandoVecino] = useState(false)

  const set     = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const setA    = (k, v) => setAlta(s => ({ ...s, [k]: v }))

  // Reset al abrir/cerrar para que cada alta arranque limpia.
  useEffect(() => {
    if (!open) return
    setForm(emptyTurnoForm())
    setVec(null)
    setCandidatos([])
    setSearched(false)
    setAltaOpen(false)
    setAlta(emptyAltaForm())
    setError('')
  }, [open])

  // Búsqueda con debounce — se dispara cuando hay 2+ chars y no se
  // está mostrando el form de alta. Al elegir un vecino o abrir el
  // alta, dejamos de buscar para no pisar el estado.
  useEffect(() => {
    if (!open || altaOpen || vecino) { return }
    const term = form.query.trim()
    if (term.length < 2) { setCandidatos([]); setSearched(false); return }
    let cancel = false
    setSearching(true)
    setSearched(false)
    const id = setTimeout(async () => {
      try {
        const esNumerico = /^\d{6,}$/.test(term)
        const pattern = `%${term.replace(/[%_]/g, '\\$&')}%`
        let q = supabase
          .from('vecinos')
          .select('id, dni, nombre, apellido, nombre_completo, telefono, municipio_id, zona, barrio')
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
        setSearched(true)
      } catch (e) {
        if (!cancel) setError(e?.message ?? 'No pudimos buscar el vecino.')
      } finally {
        if (!cancel) setSearching(false)
      }
    }, 250)
    return () => { cancel = true; clearTimeout(id) }
  }, [form.query, open, altaOpen, vecino, municipioId])

  const canSubmit = useMemo(() => !!vecino?.id && !!form.hora, [vecino, form.hora])

  // Al apretar "Dar de alta", precargamos el form con lo que el
  // usuario ya tipeó: si parece DNI lo seteamos en dni; si parece
  // nombre lo dividimos en apellido + nombre.
  function abrirAlta() {
    const term = form.query.trim()
    const base = emptyAltaForm()
    if (/^\d{6,}$/.test(term)) {
      base.dni = term
    } else if (term) {
      base.apellidoNombre = term
    }
    setAlta(base)
    setAltaOpen(true)
    setError('')
  }

  function cancelarAlta() {
    setAltaOpen(false)
    setAlta(emptyAltaForm())
  }

  async function handleCrearVecino() {
    setError('')
    const { apellido, nombre } = splitApellidoNombre(alta.apellidoNombre)
    if (!apellido && !nombre) {
      setError('Cargá al menos el nombre y apellido del vecino.')
      return
    }
    if (!alta.dni.trim()) {
      setError('El DNI es obligatorio para dar de alta al vecino.')
      return
    }
    setCreandoVecino(true)
    try {
      const nuevo = await createVecino({
        ...(municipioId ? { municipio_id: municipioId } : {}),
        apellido:         apellido || null,
        nombre:           nombre   || apellido,
        nombre_completo:  [nombre, apellido].filter(Boolean).join(' ') || apellido,
        dni:              alta.dni.trim(),
        telefono:         alta.telefono.trim() || null,
        zona:             alta.zona || 'urbano',
        barrio:           alta.barrio || null,
      })
      // Pre-selecciono el recién creado y colapso el form de alta.
      setVec(nuevo)
      setAltaOpen(false)
      setAlta(emptyAltaForm())
      // El listado del CRM también se recarga.
      qc.invalidateQueries({ queryKey: ['vecinos'] })
    } catch (e) {
      setError(e?.message ?? 'No pudimos dar de alta al vecino.')
    } finally {
      setCreandoVecino(false)
    }
  }

  async function handleSave() {
    setError('')
    if (!dependencia?.id) {
      setError('No hay dependencia destino configurada.')
      return
    }
    if (!vecino?.id) {
      setError('Seleccioná o creá el vecino antes de guardar el turno.')
      return
    }
    setSaving(true)
    try {
      const fecha = todayArgYMD()
      const fecha_hora = `${fecha}T${form.hora}:00${ARG_OFFSET}`
      const payload = {
        municipio_id:   dependencia.municipio_id ?? municipioId ?? null,
        dependencia_id: dependencia.id,
        vecino_id:      vecino.id,
        profesional_id: profesionalId ?? null,
        fecha_hora,
        estado:         'confirmado',
        canal:          'presencial',
        motivo:         form.motivo.trim() || null,
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
      {/* min-h-[600px] mantiene el modal estable cuando alterna entre
          la búsqueda, el empty state y el form de alta. */}
      <div className="flex min-h-[600px] flex-col gap-4">
        {dependencia?.nombre && (
          <p className="rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-xs text-primary-700">
            Dependencia: <strong>{dependencia.nombre}</strong> · Fecha de hoy ({todayArgYMD()})
          </p>
        )}

        {/* ── Paso 1 · Buscador de vecino ───────────────────────────── */}
        {!altaOpen && (
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
                  <p className="truncate font-semibold text-ok-700">
                    ✓ Vecino seleccionado: {vecinoLabel(vecino)}
                  </p>
                  <p className="text-xs text-ok-700/80">
                    DNI {vecino.dni}{vecino.telefono ? ` · ${vecino.telefono}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { setVec(null); set('query', '') }}
                  className="text-xs font-medium text-primary-500 hover:text-primary"
                >
                  Cambiar
                </button>
              </div>
            )}

            {!vecino && form.query.trim().length >= 2 && (
              searching ? (
                <div className="flex items-center justify-center rounded-md border border-border bg-white py-6">
                  <Spinner size="sm" />
                </div>
              ) : candidatos.length > 0 ? (
                <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border bg-white">
                  {candidatos.map(v => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => { setVec(v); set('query', '') }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary-50"
                      >
                        <Avatar name={vecinoLabel(v)} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-primary">{vecinoLabel(v)}</p>
                          <p className="truncate text-xs text-primary-400">
                            DNI {v.dni || '—'}{v.telefono ? ` · ${v.telefono}` : ''}
                            {v.barrio ? ` · ${v.barrio}` : ''}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : searched ? (
                <div className="rounded-md border border-dashed border-accent-200 bg-accent-50/50 p-5 text-center">
                  <p className="text-sm font-medium text-primary">
                    No se encontró ningún vecino con ese dato.
                  </p>
                  <p className="mt-1 text-xs text-primary-500">
                    Podés darlo de alta en CRM Vecinal y continuar el turno.
                  </p>
                  <button
                    type="button"
                    onClick={abrirAlta}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                  >
                    Dar de alta como vecino nuevo →
                  </button>
                </div>
              ) : null
            )}
          </>
        )}

        {/* ── Paso 2 (alternativo) · Alta inline de vecino ───────────── */}
        {altaOpen && (
          <div className="rounded-lg border border-accent-200 bg-primary-50/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-700">
                Nuevo vecino
              </p>
              <button
                type="button"
                onClick={cancelarAlta}
                className="text-xs font-medium text-primary-500 hover:text-primary"
                disabled={creandoVecino}
              >
                Cancelar
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Input
                  label="Apellido y nombre"
                  value={alta.apellidoNombre}
                  onChange={e => setA('apellidoNombre', e.target.value)}
                  placeholder="Pérez, Juan"
                  required
                  autoComplete="off"
                />
              </div>
              <Input
                label="DNI"
                value={alta.dni}
                onChange={e => setA('dni', e.target.value)}
                inputMode="numeric"
                required
                autoComplete="off"
              />
              <Input
                label="Teléfono"
                value={alta.telefono}
                onChange={e => setA('telefono', e.target.value)}
                placeholder="+54 9…"
                autoComplete="off"
              />
              <Select
                label="Zona"
                value={alta.zona}
                onChange={v => setA('zona', v || 'urbano')}
                options={ZONA_OPTS}
              />
              <Select
                label="Barrio"
                value={alta.barrio}
                onChange={v => setA('barrio', v)}
                placeholder="Seleccionar…"
                options={barrios.map(b => ({ value: b, label: b }))}
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={cancelarAlta} disabled={creandoVecino}>
                Cancelar
              </Button>
              <Button size="sm" onClick={handleCrearVecino} loading={creandoVecino}>
                Registrar y continuar
              </Button>
            </div>
          </div>
        )}

        {/* ── Paso 3 · Hora y motivo (siempre visibles) ───────────────── */}
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
