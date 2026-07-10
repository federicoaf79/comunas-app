import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { createVecino, updateVecino } from '../../hooks/useVecinos'
import { useQueryClient } from '@tanstack/react-query'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import Avatar from '../ui/Avatar'
import HistoriaClinicaForm from '../hc/HistoriaClinicaForm'
import { camposHCFaltantes, hcCompleta } from '../../lib/historiaClinica'
import { todayArgYMD, ARG_OFFSET } from '../../lib/datetime'

// =============================================================
// TurnoPresencialModal — alta rápida de turno presencial desde
// Sala Primeros Auxilios.
//
// Flujo:
//   1) Buscador (DNI o nombre) con resultados live.
//   2a) Vecino encontrado con HC completa → pasa al paso 3.
//   2b) Vecino encontrado con HC INCOMPLETA → banner amarillo
//        "Esta HC está incompleta. Completá los campos requeridos
//         antes de continuar." con CTA que abre HistoriaClinicaForm
//         pre-cargado con los datos existentes.
//   2c) Vecino NO encontrado → CTA "Dar de alta + cargar HC" →
//        abre HistoriaClinicaForm vacío (pre-seedea DNI o nombre
//        con lo que el usuario tipeó). El submit crea el vecino
//        con TODOS los campos obligatorios de la HC en una sola
//        operación atómica desde el punto de vista del usuario.
//   3) Especialidad, hora, motivo → crear turno (estado
//       'confirmado', canal 'presencial').
//
// El botón "Crear turno" queda DESHABILITADO mientras el vecino
// seleccionado no tenga la HC completa — la validación se hace
// en client con hcCompleta() de lib/historiaClinica.
// =============================================================

const HORA_AHORA = () => {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const ESPECIALIDAD_OPTS = [
  { value: 'general',     label: 'Medicina General' },
  { value: 'obstetra',    label: 'Obstetra' },
  { value: 'ecografia',   label: 'Ecografía' },
  { value: 'posta_rural', label: 'Posta Sanitaria Rural' },
]

// Columnas necesarias para evaluar hcCompleta() — agregamos todos
// los campos clínicos al SELECT del buscador. Si la migration
// 20260514_vecinos_hc_obligatorios no se aplicó, Postgres devuelve
// 42703 y caemos al SELECT mínimo del fallback.
const VECINO_HC_COLS = `
  id, municipio_id, dni, nombre, apellido, nombre_completo, telefono,
  fecha_nac, sexo, barrio, localidad, zona,
  grupo_sanguineo, alergias, sin_alergias_conocidas,
  contacto_emergencia_nombre, contacto_emergencia_telefono
`
const VECINO_BASIC_COLS =
  'id, municipio_id, dni, nombre, apellido, nombre_completo, telefono, barrio, zona'

function vecinoLabel(v) {
  if (!v) return ''
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

function emptyTurnoForm() {
  return { query: '', motivo: '', hora: HORA_AHORA(), especialidad: 'general' }
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

  // HC mode: 'closed' | 'alta' (vecino nuevo) | 'completar' (existente con HC incompleta).
  const [hcMode, setHcMode] = useState('closed')
  const [hcSeed, setHcSeed] = useState({})

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  // Reset al abrir/cerrar para que cada alta arranque limpia.
  useEffect(() => {
    if (!open) return
    setForm(emptyTurnoForm())
    setVec(null)
    setCandidatos([])
    setSearched(false)
    setHcMode('closed')
    setHcSeed({})
    setError('')
  }, [open])

  // Búsqueda con debounce — se dispara cuando hay 2+ chars y no
  // estamos en pantalla de HC. Al elegir un vecino dejamos de buscar.
  useEffect(() => {
    if (!open || hcMode !== 'closed' || vecino) return
    const term = form.query.trim()
    if (term.length < 2) { setCandidatos([]); setSearched(false); return }
    let cancel = false
    setSearching(true)
    setSearched(false)
    const id = setTimeout(async () => {
      try {
        const esNumerico = /^\d{6,}$/.test(term)
        const pattern = `%${term.replace(/[%_]/g, '\\$&')}%`

        // Retry pattern FULL → BASIC si las columnas HC nuevas no
        // están aplicadas en la DB.
        const buildQuery = (cols) => {
          let q = supabase.from('vecinos').select(cols).limit(8)
          if (esNumerico) {
            q = q.or(`dni.eq.${term},dni.ilike.${pattern}`)
          } else {
            q = q.or(`apellido.ilike.${pattern},nombre.ilike.${pattern},nombre_completo.ilike.${pattern},dni.ilike.${pattern}`)
          }
          if (municipioId) q = q.eq('municipio_id', municipioId)
          return q
        }

        let { data, error: err } = await buildQuery(VECINO_HC_COLS)
        if (err && /column .* does not exist|42703/i.test(err.message ?? '')) {
          ;({ data, error: err } = await buildQuery(VECINO_BASIC_COLS))
        }
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
  }, [form.query, open, hcMode, vecino, municipioId])

  const hcFaltantes = useMemo(
    () => vecino ? camposHCFaltantes(vecino) : [],
    [vecino],
  )
  const hcOK = !!vecino && hcCompleta(vecino)
  const canSubmit = !!vecino?.id && !!form.hora && hcOK

  // Al pedir "Dar de alta" pre-cargamos el form con lo que el
  // usuario ya tipeó: DNI si es numérico, apellido/nombre si no.
  function abrirAltaHC() {
    const term = form.query.trim()
    const seed = {}
    if (/^\d{6,}$/.test(term)) {
      seed.dni = term
    } else if (term) {
      seed.apellidoNombre = term
    }
    setHcSeed(seed)
    setHcMode('alta')
    setError('')
  }

  function abrirCompletarHC() {
    if (!vecino) return
    setHcSeed(vecino)
    setHcMode('completar')
    setError('')
  }

  function cancelarHC() {
    setHcMode('closed')
    setHcSeed({})
  }

  // El payload viene normalizado desde HistoriaClinicaForm (telefono
  // en E.164, dni solo dígitos, alergias array, etc.). Acá solo
  // agregamos el municipio_id y persistimos.
  async function handleSubmitHC(payload) {
    if (hcMode === 'alta') {
      const nuevo = await createVecino({
        ...(municipioId ? { municipio_id: municipioId } : {}),
        zona: hcSeed.zona ?? 'urbano',
        ...payload,
      })
      setVec(nuevo)
      setHcMode('closed')
      setHcSeed({})
      qc.invalidateQueries({ queryKey: ['vecinos'] })
    } else if (hcMode === 'completar') {
      if (!vecino?.id) return
      const actualizado = await updateVecino(vecino.id, payload)
      setVec({ ...vecino, ...actualizado })
      setHcMode('closed')
      setHcSeed({})
      qc.invalidateQueries({ queryKey: ['vecinos'] })
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
    if (!hcOK) {
      setError('La HC del vecino está incompleta. Completala antes de crear el turno.')
      return
    }
    setSaving(true)
    try {
      const fechaHoy = todayArgYMD()
      const fecha_hora = `${fechaHoy}T${form.hora}:00${ARG_OFFSET}`
      // Descomponer fecha_hora en fecha + hora_inicio + hora_fin
      const dt = new Date(fecha_hora)
      const fecha = dt.toISOString().split('T')[0]
      const hora_inicio = dt.toTimeString().slice(0, 5) // HH:MM
      const dtFin = new Date(dt.getTime() + 30 * 60 * 1000) // +30 min
      const hora_fin = dtFin.toTimeString().slice(0, 5)

      const payload = {
        municipio_id:   dependencia.municipio_id ?? municipioId ?? null,
        dependencia_id: dependencia.id,
        vecino_id:      vecino.id,
        profesional_id: profesionalId ?? null,
        fecha,
        hora_inicio,
        hora_fin,
        estado:         'confirmado',
        canal:          'presencial',
        especialidad:   form.especialidad || 'general',
        motivo:         form.motivo.trim() || null,
      }
      const { data: row, error: tErr } = await supabase
        .from('turnos_agenda')
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

  // Cuando estamos en el form de HC, escondemos el resto del modal
  // para no confundir al médico. El submit del form lleva de vuelta
  // a la vista principal con el vecino seleccionado.
  if (hcMode !== 'closed') {
    return (
      <Modal
        open={open}
        onClose={onClose}
        title={hcMode === 'alta' ? 'Nueva historia clínica' : `Completar HC · ${vecinoLabel(vecino)}`}
        size="xl"
      >
        <HistoriaClinicaForm
          initial={hcSeed}
          onSubmit={handleSubmitHC}
          onCancel={cancelarHC}
          submitLabel={hcMode === 'alta' ? 'Crear vecino con HC' : 'Guardar HC'}
          intro={
            <div className="rounded-md border border-accent-100 bg-accent-50/60 p-3 text-xs text-primary-700">
              {hcMode === 'alta' ? (
                <>
                  <strong className="text-accent-700">Primera consulta:</strong>{' '}
                  cargá los datos clínicos obligatorios. Una vez guardado, el vecino queda
                  registrado en CRM Vecinal y volvés al turno presencial.
                </>
              ) : (
                <>
                  <strong className="text-accent-700">HC incompleta:</strong>{' '}
                  faltan {hcFaltantes.length} {hcFaltantes.length === 1 ? 'campo' : 'campos'}{' '}
                  obligatorios. No vas a poder crear el turno hasta completarlos.
                </>
              )}
            </div>
          }
        />
      </Modal>
    )
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
      {/* min-h-[600px] mantiene el modal estable durante la búsqueda
          y al alternar empty state / vecino seleccionado. */}
      <div className="flex min-h-[600px] flex-col gap-4">
        {dependencia?.nombre && (
          <p className="rounded-md border border-primary-100 bg-primary-50 px-3 py-2 text-xs text-primary-700">
            Dependencia: <strong>{dependencia.nombre}</strong> · Fecha de hoy ({todayArgYMD()})
          </p>
        )}

        {/* ── Paso 1 · Buscador de vecino ───────────────────────────── */}
        <Input
          label="Buscar vecino"
          value={form.query}
          onChange={e => { set('query', e.target.value); setVec(null) }}
          placeholder="DNI o nombre…"
          autoComplete="off"
        />

        {vecino && hcOK && (
          <div className="flex items-center gap-3 rounded-md border border-ok-100 bg-ok-50 p-3 text-sm">
            <Avatar name={vecinoLabel(vecino)} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ok-700">
                ✓ Vecino seleccionado · HC completa
              </p>
              <p className="text-xs text-ok-700/80">
                {vecinoLabel(vecino)} · DNI {vecino.dni}
                {vecino.telefono ? ` · ${vecino.telefono}` : ''}
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

        {vecino && !hcOK && (
          <div className="rounded-md border border-accent-200 bg-accent-50 p-4 text-sm">
            <div className="flex items-start gap-2">
              <span aria-hidden="true" className="text-base">⚠️</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-accent-700">
                  Esta HC está incompleta.
                </p>
                <p className="mt-1 text-xs text-primary-700">
                  Completá los campos requeridos antes de continuar. Faltan:{' '}
                  <strong>{hcFaltantes.join(', ')}</strong>.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={abrirCompletarHC}>
                    Completar HC ahora →
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setVec(null); set('query', '') }}
                    className="text-xs font-medium text-primary-500 hover:text-primary"
                  >
                    Cambiar vecino
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!vecino && form.query.trim().length >= 2 && (
          searching ? (
            <div className="flex items-center justify-center rounded-md border border-border bg-white py-6">
              <Spinner size="sm" />
            </div>
          ) : candidatos.length > 0 ? (
            <ul className="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border bg-white">
              {candidatos.map(v => {
                const completa = hcCompleta(v)
                return (
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
                      {!completa && (
                        <span className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-700 ring-1 ring-inset ring-accent-100">
                          HC incompleta
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : searched ? (
            <div className="rounded-md border border-dashed border-accent-200 bg-accent-50/50 p-5 text-center">
              <p className="text-sm font-medium text-primary">
                No se encontró ningún vecino con ese dato.
              </p>
              <p className="mt-1 text-xs text-primary-500">
                Dalo de alta cargando la historia clínica. Es obligatoria para la primera consulta.
              </p>
              <button
                type="button"
                onClick={abrirAltaHC}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
              >
                Dar de alta + cargar HC →
              </button>
            </div>
          ) : null
        )}

        {/* ── Paso 3 · Especialidad, hora y motivo (siempre visibles) ── */}
        <Select
          label="Especialidad"
          value={form.especialidad}
          onChange={v => set('especialidad', v || 'general')}
          options={ESPECIALIDAD_OPTS}
        />

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
