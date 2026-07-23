import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  useAtencionPorTurno, useAtencionInsumos, useAtencionesVecino,
  useInsumosDisponibles,
  useCreateAtencion, useUpdateAtencion,
  useCreateAtencionInsumo, useDeleteAtencionInsumo, useCloseAtencion,
  edadDesdeFechaNac,
} from '../../hooks/useAtenciones'
import { useUpdateTurnoEstado } from '../../hooks/useTurnos'
import { useProfesionales } from '../../hooks/useProfesionales'
import { useOrdenesDerivacionVecino } from '../../hooks/useVecinoData'
import { updateVecino } from '../../hooks/useVecinos'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { createAuditLog } from '../../hooks/useAuditLog'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[AtencionDrawer] audit log:', e.message))
}
import { camposHCFaltantes, hcCompleta } from '../../lib/historiaClinica'
import HistoriaClinicaForm from '../hc/HistoriaClinicaForm'
import DerivacionCard from '../hc/DerivacionCard'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { dateOf, dateTimeOf } from '../../lib/datetime'

// Columnas necesarias para evaluar hcCompleta(). El embed que viene
// con el turno trae solo lo básico — hacemos un fetch dedicado del
// vecino para chequear los campos clínicos cuando arranca la atención.
const VECINO_HC_COLS = `
  id, municipio_id, dni, nombre, apellido, nombre_completo, telefono,
  fecha_nac, sexo, barrio, localidad,
  grupo_sanguineo, alergias, sin_alergias_conocidas,
  contacto_emergencia_nombre, contacto_emergencia_telefono
`
const VECINO_BASIC_COLS = 'id, dni, nombre, apellido, nombre_completo, telefono, fecha_nac, sexo, barrio, localidad'

// =============================================================
// AtencionDrawer — panel lateral que abre cuando el operador
// hace click en un turno de la Sala Primeros Auxilios. Concentra el flujo
// clínico completo: form de la atención, gestión de insumos
// usados y vista de historia clínica del vecino.
//
// El layout es un drawer fixed-right que entra con slide-in,
// w-full mobile, max-w-2xl desktop. Cierra con click fuera, ESC
// o botón. El form mantiene su estado mientras el drawer está
// abierto y vuelve a hidratar desde la atención existente cada
// vez que cambia el turno o se persiste un cambio.
// =============================================================

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})

const ESTADO_ATENCION_BADGE = {
  borrador: 'inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-700 ring-1 ring-inset ring-primary-200',
  cerrada:  'inline-flex items-center rounded-full bg-ok-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok-700 ring-1 ring-inset ring-ok-100',
  derivada: 'inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-700 ring-1 ring-inset ring-accent-100',
}

function vecinoNombre(v) {
  if (!v) return '—'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || '—'
}

const TABS = [
  { value: 'atencion', label: 'Atención' },
  { value: 'insumos',  label: 'Insumos utilizados' },
  { value: 'hc',       label: 'Historia clínica' },
]

// Derivación interna — la emite el propio Médico General del CIC hacia
// un especialista de la misma dependencia. Queda validada al crearse
// (nunca pasa por el paso de validación de CicSalud.jsx, que es para
// las órdenes físicas externas). Sin turno_id todavía — se linkea
// cuando el vecino reserve el turno con el especialista.
//
// OJO: profesionalId (FK a `profesionales`, el médico general) y
// validadaPor (FK a `usuarios`, la cuenta de staff logueada) son dos
// ids distintos — mismo patrón que ya usa CicSalud.jsx.validarOrden()
// con validada_por. Pasarle el id equivocado a cada uno tira foreign
// key violation.
async function crearDerivacionInterna({
  municipioId, vecinoId, profesionalId, validadaPor, dependenciaDestinoId,
  especialidadDestino, diagnostico, indicaciones,
}) {
  const nowIso = new Date().toISOString()
  const { data: row, error } = await supabase.from('ordenes_derivacion').insert({
    municipio_id:           municipioId,
    vecino_id:              vecinoId,
    profesional_id:         profesionalId,
    dependencia_destino_id: dependenciaDestinoId,
    especialidad_destino:   especialidadDestino,
    diagnostico:            diagnostico   || null,
    indicaciones:           indicaciones  || null,
    origen:                 'digital',
    estado:                 'validada',
    turno_id:               null,
    validada_por:           validadaPor,
    validada_at:            nowIso,
  }).select('id').single()
  if (error) throw error
  logAudit({
    accion: 'create', entidad: 'ordenes_derivacion', entidadId: row.id,
    descripcion: `Derivación interna creada — vecino ${vecinoId} → ${especialidadDestino ?? 'especialidad no especificada'}`,
  })
}

export default function AtencionDrawer({ turno, dependenciaSaludId, municipioId, onClose }) {
  const { perfil } = useAuth()
  const [tab, setTab] = useState('atencion')

  // ESC para cerrar — solo activo cuando el drawer está montado.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const atencionQ = useAtencionPorTurno(turno?.id)
  const atencion  = atencionQ.data ?? null

  if (!turno) return null

  const vecino = turno.vecino ?? null
  const edad   = edadDesdeFechaNac(vecino?.fecha_nac)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-primary-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Atención clínica"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-card animate-slide-up"
      >
        {/* Header sticky */}
        <header className="shrink-0 border-b border-border bg-primary text-white">
          <div className="flex items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-sora text-base font-bold leading-tight sm:text-lg">
                  {vecinoNombre(vecino)}
                </h2>
                {atencion?.estado && (
                  <span className={ESTADO_ATENCION_BADGE[atencion.estado] ?? ESTADO_ATENCION_BADGE.borrador}>
                    {atencion.estado}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/70">
                {vecino?.dni && <span>DNI {vecino.dni}</span>}
                {edad != null && <span>· {edad} años</span>}
                {turno.fecha_hora && <span>· Turno: {dateTimeOf(turno.fecha_hora)}</span>}
              </div>

              {/* Alergias — alerta visual prominente en contexto médico */}
              {vecino?.alergias?.length > 0 && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-danger">
                    <circle cx="12" cy="12" r="10" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4M12 16h.01" />
                  </svg>
                  <span className="text-sm font-semibold text-danger">
                    ALERGIAS: {vecino.alergias.join(', ')}
                  </span>
                </div>
              )}

              {vecino?.sin_alergias_conocidas && !vecino?.alergias?.length && (
                <div className="mt-2 text-xs text-white/60">
                  Sin alergias conocidas (confirmado)
                </div>
              )}

              {!vecino?.alergias?.length && !vecino?.sin_alergias_conocidas && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-300">
                  <span>⚠️</span>
                  <span>Alergias no registradas</span>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
          <nav className="flex border-t border-white/10">
            {TABS.map(t => {
              const active = tab === t.value
              return (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={
                    'flex-1 border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors sm:text-sm ' +
                    (active
                      ? 'border-accent text-white'
                      : 'border-transparent text-white/60 hover:text-white')
                  }
                >
                  {t.label}
                </button>
              )
            })}
          </nav>
        </header>

        {/* Body scrolleable */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-background">
          {atencionQ.isLoading ? (
            <div className="flex items-center justify-center p-12"><Spinner /></div>
          ) : tab === 'atencion' ? (
            <AtencionForm
              turno={turno}
              atencion={atencion}
              municipioId={municipioId}
              profesionalId={perfil?.id ?? null}
            />
          ) : tab === 'insumos' ? (
            <InsumosTab
              atencion={atencion}
              municipioId={municipioId}
              dependenciaSaludId={dependenciaSaludId}
              onSwitchToAtencion={() => setTab('atencion')}
            />
          ) : (
            <HCTab vecinoId={vecino?.id} atencionActualId={atencion?.id} />
          )}
        </div>
      </aside>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 1 — Form de atención
// ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  motivo:             '',
  anamnesis:          '',
  examen_fisico:      '',
  diagnostico:        '',
  tratamiento:        '',
  indicaciones:       '',
  proxima_consulta:   '',
  derivacion_destino: '',
}

// Exportada — reusable desde AtencionDetalle (página full) además
// del drawer. `extraSlot` renderiza contenido entre Indicaciones y
// Próxima consulta (lo usa la página para meter Documentos).
export function AtencionForm({ turno, atencion, municipioId, profesionalId, extraSlot = null }) {
  // derivarEspecialidad vive acá arriba (no en AtencionFormInner) porque
  // no es un campo de `atenciones` — no tiene de dónde repoblarse
  // cuando el key-remount de abajo desmonta/remonta el form al pasar
  // de "sin atención" a "atención recién guardada".
  const [derivarEspecialidad, setDerivarEspecialidad] = useState('')

  // Key remount: si cambia la atención persistida, el form se
  // re-monta con los valores correctos sin useEffect→setState.
  return (
    <AtencionFormInner
      key={atencion?.id ?? `nuevo-${turno.id}`}
      turno={turno}
      atencion={atencion}
      municipioId={municipioId}
      profesionalId={profesionalId}
      extraSlot={extraSlot}
      derivarEspecialidad={derivarEspecialidad}
      setDerivarEspecialidad={setDerivarEspecialidad}
    />
  )
}

// Trae los campos clínicos del vecino para evaluar hcCompleta(). Si
// la migration HC no se aplicó (42703), cae a las columnas básicas y
// el banner desaparece — hcCompleta() devolverá false sobre datos
// parciales y bloqueará la consulta, que es el comportamiento esperado.
function useVecinoHCStatus(vecinoId) {
  return useQuery({
    queryKey: ['vecino-hc-status', vecinoId ?? '__NONE__'],
    enabled:  !!vecinoId,
    queryFn:  async () => {
      const tryFetch = async (cols) => {
        return supabase.from('vecinos').select(cols).eq('id', vecinoId).maybeSingle()
      }
      let { data, error } = await tryFetch(VECINO_HC_COLS)
      if (error && /column .* does not exist|42703/i.test(error.message ?? '')) {
        ;({ data, error } = await tryFetch(VECINO_BASIC_COLS))
      }
      if (error) {
        console.warn('[AtencionDrawer] useVecinoHCStatus error:', error.message)
        return null
      }
      return data
    },
  })
}

function AtencionFormInner({
  turno, atencion, municipioId, profesionalId, extraSlot,
  derivarEspecialidad, setDerivarEspecialidad,
}) {
  const [form, setForm] = useState(() => atencion ? {
    motivo:             atencion.motivo             ?? '',
    anamnesis:          atencion.anamnesis          ?? '',
    examen_fisico:      atencion.examen_fisico      ?? '',
    diagnostico:        atencion.diagnostico        ?? '',
    tratamiento:        atencion.tratamiento        ?? '',
    indicaciones:       atencion.indicaciones       ?? '',
    proxima_consulta:   atencion.proxima_consulta   ?? '',
    derivacion_destino: atencion.derivacion_destino ?? '',
  } : { ...EMPTY_FORM, motivo: turno.motivo ?? '' })
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [confirmCerrar, setConfirmCerrar] = useState(false)
  const [hcModalOpen, setHcModalOpen] = useState(false)
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const qc           = useQueryClient()
  const createMut    = useCreateAtencion()
  const updateMut    = useUpdateAtencion()
  const closeMut     = useCloseAtencion()
  const updateTurnoM = useUpdateTurnoEstado()

  // Derivación interna — solo tiene sentido si el turno tiene un
  // profesional asignado y ese profesional es el Médico General del
  // CIC. El selector de especialidad destino sale de los demás
  // profesionales activos de la misma dependencia.
  const dependenciaIdTurno   = turno.dependencia_id ?? turno.dependencia?.id ?? null
  const profesionalAtencion  = turno.profesional ?? null
  const esMedicoGeneral      = profesionalAtencion?.es_medico_general === true
  const { data: profesionalesDep = [] } = useProfesionales(municipioId, dependenciaIdTurno)
  const especialidadesDestino = useMemo(() => {
    const vistos = new Set()
    const opts = []
    for (const p of profesionalesDep) {
      if (!p.especialidad || p.activo === false || p.es_medico_general) continue
      if (vistos.has(p.especialidad)) continue
      vistos.add(p.especialidad)
      opts.push({ value: p.especialidad, label: p.especialidad })
    }
    return opts.sort((a, b) => a.label.localeCompare(b.label))
  }, [profesionalesDep])

  const yaCerrada = atencion?.estado === 'cerrada' || atencion?.estado === 'derivada'

  // HC del vecino — bloqueamos la atención si está incompleta.
  // Una atención existente (yaCerrada o ya guardada) deja pasar la
  // restricción: la HC pudo no exigirse al momento de crear ese
  // registro y queremos seguir mostrándolo en read-mode sin trabar.
  const vecinoId = turno.vecino_id ?? turno.vecino?.id ?? null
  const hcStatusQ = useVecinoHCStatus(vecinoId)
  const vecinoCompleto = hcStatusQ.data ?? null
  const faltantes = useMemo(
    () => vecinoCompleto ? camposHCFaltantes(vecinoCompleto) : [],
    [vecinoCompleto],
  )
  const hcOK = !!vecinoCompleto && hcCompleta(vecinoCompleto)
  // Solo bloquea cuando es atención NUEVA (no hay registro guardado
  // todavía). Una atención en borrador o cerrada se sigue mostrando
  // aunque la HC quede sin completar — el bloqueo entra el día que
  // alguien quiera abrir la consulta.
  const bloquearPorHC = !atencion && !hcOK && !hcStatusQ.isLoading

  async function handleCompletarHC(payload) {
    if (!vecinoId) return
    await updateVecino(vecinoId, payload)
    qc.invalidateQueries({ queryKey: ['vecino-hc-status', vecinoId] })
    qc.invalidateQueries({ queryKey: ['vecinos'] })
    setHcModalOpen(false)
  }

  // Toast de éxito autoclearea a los 2.5s — feedback no intrusivo
  // que confirma cada acción sin pisar la pantalla.
  useEffect(() => {
    if (!ok) return
    const t = setTimeout(() => setOk(''), 2500)
    return () => clearTimeout(t)
  }, [ok])

  // Si el médico llena "Derivar a" (texto libre) o elige una
  // especialidad interna, el cierre marca la atención como 'derivada'
  // y el botón se relabel a "Cerrar y derivar".
  const esDerivacion = !!form.derivacion_destino?.trim() || !!derivarEspecialidad
  const labelCerrar  = esDerivacion ? 'Cerrar y derivar' : 'Cerrar atención'

  function payloadForm(estado = 'borrador') {
    return {
      ...form,
      proxima_consulta:   form.proxima_consulta   || null,
      derivacion_destino: form.derivacion_destino?.trim() || null,
      estado,
    }
  }

  async function handleGuardar() {
    setError(''); setOk('')
    try {
      if (atencion) {
        await updateMut.mutateAsync({ id: atencion.id, ...payloadForm('borrador') })
      } else {
        await createMut.mutateAsync({
          municipio_id:   municipioId,
          turno_id:       turno.id,
          vecino_id:      turno.vecino_id ?? turno.vecino?.id,
          profesional_id: profesionalId,
          ...payloadForm('borrador'),
        })
      }
      setOk('✓ Guardado')
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar la atención.')
    }
  }

  async function handleNoSePresento() {
    setError(''); setOk('')
    try {
      await updateTurnoM.mutateAsync({ id: turno.id, estado: 'ausente' })
      setOk('Turno marcado como ausente')
    } catch (e) {
      setError(e?.message ?? 'No pudimos marcar el turno como ausente.')
    }
  }

  async function ejecutarCerrar() {
    setError(''); setOk('')
    setConfirmCerrar(false)
    const targetEstado = esDerivacion ? 'derivada' : 'cerrada'
    try {
      // 1) Persistir cambios pendientes del form como borrador (el
      //    estado final lo aplica useCloseAtencion).
      await updateMut.mutateAsync({ id: atencion.id, ...payloadForm('borrador') })
      // 2) Cerrar: descuenta insumos + marca turno atendido + estado final.
      const { errores } = await closeMut.mutateAsync({
        atencionId: atencion.id,
        estado:     targetEstado,
      })

      // 3) Derivación interna (opcional) — se registra recién acá,
      //    al cerrar, para no crear filas duplicadas en cada "Guardar"
      //    intermedio mientras el médico todavía está escribiendo.
      let derivacionAviso = ''
      if (derivarEspecialidad && esMedicoGeneral) {
        try {
          await crearDerivacionInterna({
            municipioId,
            vecinoId:              turno.vecino_id ?? turno.vecino?.id,
            profesionalId:         profesionalAtencion.id,
            validadaPor:           profesionalId,
            dependenciaDestinoId:  dependenciaIdTurno,
            especialidadDestino:   derivarEspecialidad,
            diagnostico:           form.diagnostico,
            indicaciones:          form.indicaciones,
          })
        } catch (e) {
          console.error('[AtencionDrawer] crearDerivacionInterna error:', e)
          derivacionAviso = ' — no pudimos registrar la derivación interna.'
        }
      }

      setOk(errores.length === 0
        ? (targetEstado === 'derivada' ? `✓ Atención derivada${derivacionAviso}` : '✓ Atención cerrada')
        : `Cerrada con ${errores.length} insumo${errores.length === 1 ? '' : 's'} sin descontar — revisá stock.${derivacionAviso}`)
    } catch (e) {
      setError(e?.message ?? 'No pudimos cerrar la atención.')
    }
  }

  const saving = createMut.isPending || updateMut.isPending ||
                 closeMut.isPending  || updateTurnoM.isPending

  const inputsDisabled = yaCerrada || bloquearPorHC

  return (
    <div className="space-y-4 p-5">
      {yaCerrada && (
        <div className="rounded-md border border-ok-100 bg-ok-50 p-3 text-xs text-ok-700">
          Esta atención está <b>{atencion.estado}</b>. El form queda en solo lectura.
        </div>
      )}

      {/* HC incompleta — banner amarillo gold + bloqueo de la consulta.
          Solo se muestra para atenciones NUEVAS (no hay borrador
          previo): si el médico ya empezó, no le cerramos el form. */}
      {bloquearPorHC && (
        <div className="rounded-md border border-accent-200 bg-accent-50 p-4 text-sm">
          <div className="flex items-start gap-2">
            <span aria-hidden="true" className="text-base">⚠️</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-accent-700">
                Esta HC está incompleta.
              </p>
              <p className="mt-1 text-xs text-primary-700">
                Completá los campos requeridos antes de continuar. Faltan:{' '}
                <strong>{faltantes.join(', ')}</strong>.
              </p>
              <div className="mt-3">
                <Button size="sm" onClick={() => setHcModalOpen(true)}>
                  Completar HC ahora →
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Textarea
        label="Motivo de consulta"
        value={form.motivo}
        onChange={v => set('motivo', v)}
        disabled={inputsDisabled}
      />
      <Textarea
        label="Anamnesis / síntomas referidos"
        value={form.anamnesis}
        onChange={v => set('anamnesis', v)}
        disabled={inputsDisabled}
      />
      <Textarea
        label="Examen físico"
        value={form.examen_fisico}
        onChange={v => set('examen_fisico', v)}
        disabled={inputsDisabled}
      />
      <Textarea
        label="Diagnóstico"
        value={form.diagnostico}
        onChange={v => set('diagnostico', v)}
        disabled={inputsDisabled}
      />
      <Textarea
        label="Tratamiento indicado"
        value={form.tratamiento}
        onChange={v => set('tratamiento', v)}
        disabled={inputsDisabled}
      />
      <Textarea
        label="Indicaciones al paciente"
        value={form.indicaciones}
        onChange={v => set('indicaciones', v)}
        disabled={inputsDisabled}
      />

      {/* Slot opcional — el page-version pasa <DocumentosAtencion />
          acá para que aparezca entre Indicaciones y Próxima consulta. */}
      {extraSlot}

      <Input
        label="Próxima consulta (opcional)"
        type="date"
        value={form.proxima_consulta}
        onChange={e => set('proxima_consulta', e.target.value)}
        disabled={inputsDisabled}
      />

      {/* Derivar a especialista del CIC — solo visible para el Médico
          General. Genera una derivación interna estructurada
          (ordenes_derivacion, origen='digital', validada automática)
          al cerrar la atención. Convive con el campo de texto libre
          de abajo, no lo reemplaza. */}
      {esMedicoGeneral && (
        <div className="space-y-1.5 rounded-md border border-accent-100 bg-accent-50/40 p-3">
          <Select
            label="Derivar a especialista del CIC (opcional)"
            value={derivarEspecialidad}
            onChange={v => setDerivarEspecialidad(v)}
            options={especialidadesDestino}
            placeholder={especialidadesDestino.length > 0
              ? 'Seleccionar especialidad…'
              : 'No hay especialistas cargados en esta dependencia'}
            disabled={inputsDisabled}
          />
          <p className="text-xs text-primary-500">
            Queda validada automáticamente — el vecino podrá sacar turno
            directo con el especialista sin subir orden médica.
          </p>
        </div>
      )}

      {/* Derivar a — textarea siempre visible. Si tiene contenido,
          el botón "Cerrar atención" se relabel a "Cerrar y derivar"
          y el cierre marca la atención como `derivada` en vez de
          `cerrada`. */}
      <Input
        label="Derivar a (opcional)"
        value={form.derivacion_destino}
        onChange={e => set('derivacion_destino', e.target.value)}
        placeholder="Hospital, especialista, etc."
        disabled={inputsDisabled}
      />

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">{error}</div>
      )}
      {ok && (
        <div className="rounded-md border border-ok-100 bg-ok-50 p-3 text-xs font-medium text-ok-700">
          {ok}
        </div>
      )}

      {/* Tres acciones simples — sin selector de estado intermedio.
          Cada botón hace exactamente una cosa: guardar borrador,
          marcar ausente, o cerrar (con confirmación).
          Bloqueadas si la HC del vecino está incompleta. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button
          variant="secondary"
          onClick={handleGuardar}
          loading={saving}
          disabled={yaCerrada || bloquearPorHC}
        >
          Guardar
        </Button>
        <button
          type="button"
          onClick={handleNoSePresento}
          disabled={saving || turno?.estado === 'ausente' || bloquearPorHC}
          className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-accent bg-white px-4 py-2.5 text-sm font-semibold text-accent-700 transition-colors hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          No se presentó
        </button>
        {atencion && !yaCerrada && (
          <Button
            onClick={() => setConfirmCerrar(true)}
            loading={saving}
          >
            {labelCerrar}
          </Button>
        )}
      </div>

      {/* Confirmación de cierre — modal mínimo en lugar del botón
          inline. Si la atención lleva derivacion_destino, el copy
          se ajusta para no confundir. */}
      {confirmCerrar && (
        <Modal
          open
          onClose={() => setConfirmCerrar(false)}
          title={esDerivacion ? 'Cerrar y derivar' : 'Cerrar atención'}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmCerrar(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button onClick={ejecutarCerrar} loading={saving}>
                {esDerivacion ? 'Confirmar y derivar' : 'Confirmar y cerrar'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-primary-700">
            {esDerivacion
              ? '¿Cerrar esta atención y derivarla? Se descontarán los insumos del stock y el turno quedará marcado como atendido.'
              : '¿Cerrar esta atención? Se descontarán los insumos del stock y el turno quedará marcado como atendido.'}
          </p>
        </Modal>
      )}

      {/* Modal de completar HC — abre HistoriaClinicaForm pre-cargado
          con los datos parciales del vecino. Al guardar invalida
          la query de status y el banner desaparece. */}
      {hcModalOpen && (
        <Modal
          open
          onClose={() => setHcModalOpen(false)}
          title="Completar historia clínica"
          size="xl"
        >
          <HistoriaClinicaForm
            initial={vecinoCompleto ?? {}}
            onSubmit={handleCompletarHC}
            onCancel={() => setHcModalOpen(false)}
            submitLabel="Guardar HC"
            intro={
              <div className="rounded-md border border-accent-100 bg-accent-50/60 p-3 text-xs text-primary-700">
                <strong className="text-accent-700">HC incompleta:</strong>{' '}
                faltan {faltantes.length} {faltantes.length === 1 ? 'campo' : 'campos'}{' '}
                obligatorios. Completalos para habilitar la atención.
              </div>
            }
          />
        </Modal>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 2 — Insumos utilizados
// ─────────────────────────────────────────────────────────────────

// Normaliza texto para búsqueda: minúsculas + sin acentos. Así
// "ibuprofeno" matchea "Ibuprofeno" e "ibuprófeno".
function normalizar(s) {
  return (s ?? '').toString()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

// Texto de stock con conversión opcional, espejo de stockDisplayLabel
// en Inventario.jsx (lo replicamos acá para no acoplar el drawer a
// una página). Formato:
//   - Con conversión activa: "800 pares (≈ 8 cajas)"
//   - Sin conversión:        "80 unidades"
function stockTextoDe(item) {
  const stock = Number(item?.stock_actual ?? 0)
  const ucon  = item?.unidad_consumo || item?.unidad || ''
  const ucom  = item?.unidad_compra ?? null
  const ratio = Number(item?.cantidad_por_unidad_compra ?? 0)
  if (ucon && ucom && ucon !== ucom && ratio > 0) {
    const enCompra = Math.floor(stock / ratio)
    return `${stock} ${ucon} (≈ ${enCompra} ${ucom})`
  }
  return `${stock}${ucon ? ` ${ucon}` : ''}`
}

// Unidad efectiva de consumo del insumo — la usa la atención para
// cantidad y unidad del INSERT en atencion_insumos.
function unidadConsumoDe(item) {
  return item?.unidad_consumo || item?.unidad || 'unidad'
}

export function InsumosTab({ atencion, municipioId, dependenciaSaludId, onSwitchToAtencion }) {
  const qc         = useQueryClient()
  const insumosQ   = useAtencionInsumos(atencion?.id)
  const catalogoQ  = useInsumosDisponibles({ municipioId, dependenciaId: dependenciaSaludId })
  const createMut  = useCreateAtencionInsumo()
  const deleteMut  = useDeleteAtencionInsumo()
  // Estado del combobox: `insumoSeleccionado` es el objeto completo
  // (el chip lo necesita para mostrar nombre/stock/unidad), no solo
  // el id. La búsqueda se limpia tras elegir y el chip persiste.
  const [insumoSeleccionado, setInsumoSeleccionado] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [error, setError]       = useState('')
  const [ok, setOk]             = useState('')

  // Feedback de éxito visible por 2.5s tras agregar un insumo —
  // confirma al médico que la fila se persistió, sin tener que
  // mirar la lista de arriba para validarlo.
  useEffect(() => {
    if (!ok) return
    const t = setTimeout(() => setOk(''), 2500)
    return () => clearTimeout(t)
  }, [ok])

  const yaCerrada = atencion?.estado === 'cerrada' || atencion?.estado === 'derivada'

  // Mantenemos las deps del useMemo apuntando a las refs raw de
  // .data — sino el array nuevo de `?? []` cambia identity en cada
  // render y el memo no sirve para nada.
  const totalEstimado = useMemo(() => {
    const items   = insumosQ.data   ?? []
    const catalog = catalogoQ.data  ?? []
    const byId = new Map(catalog.map(c => [c.id, c]))
    return items.reduce((acc, it) => {
      const pref = Number(byId.get(it.inventario_id)?.precio_referencia ?? 0)
      return acc + pref * Number(it.cantidad ?? 0)
    }, 0)
  }, [insumosQ.data, catalogoQ.data])

  const items = insumosQ.data ?? []

  // Filtrado por nombre / categoría, normalizando acentos. Si el
  // término está vacío devolvemos lista vacía — el dropdown solo
  // aparece cuando el usuario escribió algo.
  const catalogFiltrado = useMemo(() => {
    const q = normalizar(busqueda.trim())
    const base = catalogoQ.data ?? []
    if (!q) return []
    return base.filter(c =>
      normalizar(c.nombre).includes(q) || normalizar(c.categoria).includes(q),
    )
  }, [catalogoQ.data, busqueda])

  function seleccionarInsumo(insumo) {
    setInsumoSeleccionado(insumo)
    setBusqueda('')      // cierra el dropdown
    setError('')
    setOk('')
  }
  function limpiarSeleccion() {
    setInsumoSeleccionado(null)
    setBusqueda('')
    setCantidad('')
    setError('')
  }

  async function handleAgregar() {
    setError(''); setOk('')
    if (!atencion) {
      setError('Primero guardá la atención como borrador desde la tab "Atención".')
      return
    }
    if (!insumoSeleccionado || !(Number(cantidad) > 0)) {
      setError('Elegí un insumo y una cantidad > 0.')
      return
    }
    // Trace de input — sirve para debuggear casos donde el botón
    // parece "no hacer nada": en realidad sale por validación o
    // por error del INSERT contra RLS.
    const payload = {
      atencion_id:   atencion.id,
      inventario_id: insumoSeleccionado.id,
      cantidad:      Number(cantidad),
      // Persistimos la unidad de consumo — es la que el stock va a
      // descontar al cerrar la atención. Si el item no tiene
      // unidad_consumo (legacy), caemos a `unidad`.
      unidad:        unidadConsumoDe(insumoSeleccionado),
    }
    console.log('[InsumosTab] handleAgregar payload:', payload)
    try {
      const row = await createMut.mutateAsync(payload)
      console.log('[InsumosTab] mutation success:', row)
      // Reset completo del formulario + nombre del insumo recién
      // agregado en el toast para que el médico confirme visualmente
      // qué fue lo que entró.
      const nombre = insumoSeleccionado.nombre
      limpiarSeleccion()
      setOk(`✓ ${nombre} agregado`)
      // Invalidación belt-and-suspenders: el hook ya invalida con
      // queryKey ['atencion-insumos', row.atencion_id]. Re-invalidar
      // por seguridad si row viene sin atencion_id en algún edge case.
      qc.invalidateQueries({ queryKey: ['atencion-insumos', atencion.id] })
    } catch (e) {
      console.error('[InsumosTab] mutation error:', e)
      setError(e?.message ?? 'No pudimos agregar el insumo.')
    }
  }

  async function handleEliminar(insumoFila) {
    setError(''); setOk('')
    try {
      await deleteMut.mutateAsync({ id: insumoFila.id, atencionId: atencion.id })
      qc.invalidateQueries({ queryKey: ['atencion-insumos', atencion.id] })
    } catch (e) {
      console.error('[InsumosTab] delete error:', e)
      setError(e?.message ?? 'No pudimos eliminar el insumo.')
    }
  }

  // Hint sobre por qué el botón está deshabilitado, para que el
  // médico no se quede mirando un botón gris sin contexto.
  const disabledHint = !atencion
    ? 'Guardá la atención como borrador antes de cargar insumos.'
    : !insumoSeleccionado
      ? 'Elegí un insumo de la lista de arriba.'
      : !(Number(cantidad) > 0)
        ? 'Ingresá una cantidad mayor a 0.'
        : null

  // Layout: en mobile arriba va el form, abajo la lista. En desktop
  // dos columnas (form 40% / lista 60%). Cuando no hay atencion, un
  // banner navy bloquea visualmente el área e invita a tab Atención.
  return (
    <div className="space-y-4 p-5">
      {!atencion && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl bg-primary p-4 text-white shadow-card sm:p-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/20 text-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0z" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-sora text-sm font-bold sm:text-base">
              Guardá la atención como borrador antes de registrar insumos
            </p>
            <p className="mt-0.5 text-xs text-white/70 sm:text-sm">
              Volvé al tab <b>Atención</b> y apretá <b>Guardar</b> — los insumos se
              vinculan al asiento clínico.
            </p>
          </div>
          {onSwitchToAtencion && (
            <button
              type="button"
              onClick={onSwitchToAtencion}
              className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-xs font-bold text-primary shadow-sm transition-colors hover:bg-accent-400"
            >
              Ir a Atención →
            </button>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
        {/* ── Columna izquierda: AGREGAR INSUMO ── */}
        {!yaCerrada && (
          <section className="rounded-lg border border-border bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-primary-500">
              Agregar insumo
            </h3>

            {/* Combobox custom — input + dropdown absoluto. */}
            <div className="relative mt-3">
              <input
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar insumo... (ej: gasas, alcohol)"
                role="combobox"
                aria-expanded={busqueda.length > 0}
                aria-autocomplete="list"
                disabled={!atencion}
                className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm placeholder:text-primary-300 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-primary-50 disabled:opacity-60"
              />

              {busqueda && (
                <ul
                  role="listbox"
                  className="absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-white shadow-card"
                >
                  {catalogoQ.isLoading ? (
                    <li className="px-3 py-2 text-sm text-primary-400">Cargando catálogo...</li>
                  ) : catalogFiltrado.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-primary-400">Sin coincidencias</li>
                  ) : (
                    catalogFiltrado.map(insumo => {
                      const critico = Number(insumo.stock_actual ?? 0) <= Number(insumo.stock_minimo ?? 0)
                      return (
                        <li
                          key={insumo.id}
                          role="option"
                          // mousedown antes del blur del input para que
                          // no se cierre el dropdown antes del click.
                          onMouseDown={(e) => { e.preventDefault(); seleccionarInsumo(insumo) }}
                          className="flex cursor-pointer items-start justify-between gap-3 px-3 py-2 text-sm hover:bg-background"
                        >
                          <span className="min-w-0 flex-1">
                            {critico && <span aria-label="stock crítico">⚠️ </span>}
                            <span className="font-medium text-primary">{insumo.nombre}</span>
                            {insumo.categoria && (
                              <span className="ml-1 text-[11px] uppercase tracking-wide text-primary-400">
                                · {insumo.categoria}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-xs text-primary-500">
                            Stock: {stockTextoDe(insumo)}
                          </span>
                        </li>
                      )
                    })
                  )}
                </ul>
              )}
            </div>

            {/* Chip compacto del insumo elegido — una sola línea. */}
            {insumoSeleccionado && (
              <div className="mt-2 flex items-center gap-2 truncate rounded-lg bg-primary/5 px-2.5 py-1 text-xs ring-1 ring-inset ring-primary/10">
                <span className="truncate font-medium text-primary" title={insumoSeleccionado.nombre}>
                  {insumoSeleccionado.nombre}
                </span>
                <span className="shrink-0 text-primary-400">
                  — Stock: {stockTextoDe(insumoSeleccionado)}
                </span>
                <button
                  type="button"
                  onClick={limpiarSeleccion}
                  aria-label="Quitar selección"
                  className="ml-auto shrink-0 rounded p-0.5 text-primary-400 hover:bg-primary/10 hover:text-danger"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
                  </svg>
                </button>
              </div>
            )}

            {/* Cantidad + unidad + botón en una sola fila horizontal.
                La cantidad se ingresa siempre en unidad_consumo (al
                cerrar la atención se descuenta de stock_actual directo). */}
            {insumoSeleccionado && (() => {
              const ucon = unidadConsumoDe(insumoSeleccionado)
              return (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="flex w-32 flex-col gap-1">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-primary-500">
                      Cantidad
                    </label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={cantidad}
                      onChange={e => setCantidad(e.target.value)}
                      placeholder={`Cantidad en ${ucon}`}
                      autoFocus
                      className="input-field min-w-0"
                    />
                    <p className="text-[11px] text-primary-400">Unidad: {ucon}</p>
                  </div>
                  <span className="pb-6 text-sm text-primary-500">{ucon}</span>
                  <Button
                    onClick={handleAgregar}
                    loading={createMut.isPending}
                    disabled={!!disabledHint}
                    className="ml-auto"
                  >
                    + Agregar
                  </Button>
                </div>
              )
            })()}

            {disabledHint && insumoSeleccionado && (
              <p className="mt-2 text-[11px] text-primary-400">{disabledHint}</p>
            )}

            {error && (
              <div className="mt-3 rounded-md border border-red-100 bg-red-50 p-2 text-xs text-danger">{error}</div>
            )}
            {ok && (
              <div className="mt-3 rounded-md border border-ok-100 bg-ok-50 p-2 text-xs font-medium text-ok-700">
                {ok}
              </div>
            )}
          </section>
        )}

        {/* ── Columna derecha: INSUMOS CARGADOS ── */}
        <section>
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary-500">
            Insumos cargados {items.length > 0 && <span className="ml-1 text-primary-400">({items.length})</span>}
          </h3>
          {insumosQ.isLoading ? (
            <div className="mt-2 flex justify-center p-6"><Spinner /></div>
          ) : items.length === 0 ? (
            <p className="mt-2 text-sm text-primary-400">Sin insumos aún.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-white">
              {items.map(it => {
                const unidad = it.unidad || it.inventario?.unidad || ''
                return (
                  <li
                    key={it.id}
                    className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate font-medium text-primary" title={it.inventario?.nombre ?? '—'}>
                      {it.inventario?.nombre ?? '—'}
                    </span>
                    <span className="whitespace-nowrap font-bold tabular-nums text-primary">
                      {it.cantidad}
                    </span>
                    <span className="whitespace-nowrap text-xs text-primary-500">
                      {unidad || '—'}
                    </span>
                    {!yaCerrada ? (
                      <button
                        onClick={() => handleEliminar(it)}
                        aria-label={`Eliminar ${it.inventario?.nombre ?? 'insumo'}`}
                        title="Eliminar"
                        className="rounded p-1 text-primary-400 transition-colors hover:bg-red-50 hover:text-danger"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    ) : <span />}
                  </li>
                )
              })}
            </ul>
          )}
          {items.length > 0 && totalEstimado > 0 && (
            <p className="mt-2 text-right text-xs text-primary-500">
              Total estimado: <b className="text-primary">{fmtMoney.format(totalEstimado)}</b>
            </p>
          )}
        </section>
      </div>

      <p className="text-xs text-primary-400">
        Al cerrar la atención, estos insumos se descontarán automáticamente del stock
        de la dependencia.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 3 — Historia Clínica
// ─────────────────────────────────────────────────────────────────

export function HCTab({ vecinoId, atencionActualId }) {
  const hcQ = useAtencionesVecino(vecinoId, { limit: 50 })
  // Cliente autenticado siempre — este tab vive del lado admin.
  const derivQ = useOrdenesDerivacionVecino(vecinoId, supabase)
  const [expandedId, setExpandedId] = useState(null)

  // Excluimos la atención que se está editando ahora para no
  // duplicarla en la HC. Dep en hcQ.data (ref estable) en vez del
  // array nuevo con `?? []`.
  const filas = useMemo(() => {
    const items = hcQ.data ?? []
    return items.filter(a => a.id !== atencionActualId)
  }, [hcQ.data, atencionActualId])

  return (
    <div className="space-y-4 p-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-primary-500">
        Atenciones previas
      </h3>
      {hcQ.isLoading ? (
        <div className="flex justify-center p-6"><Spinner /></div>
      ) : filas.length === 0 ? (
        <p className="text-sm text-primary-400">Primera consulta de este paciente.</p>
      ) : (
        <ul className="space-y-2">
          {filas.map(a => {
            const expanded = expandedId === a.id
            return (
              <li
                key={a.id}
                className="overflow-hidden rounded-lg border border-border bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-primary-50/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-primary-400">{dateOf(a.fecha_hora)}</p>
                    <p className="truncate text-sm font-semibold text-primary">
                      {a.diagnostico || a.motivo || '(sin diagnóstico)'}
                    </p>
                    <p className="text-xs text-primary-500">
                      {a.profesional?.nombre ?? 'Profesional —'}
                    </p>
                  </div>
                  <span className={ESTADO_ATENCION_BADGE[a.estado] ?? ESTADO_ATENCION_BADGE.borrador}>
                    {a.estado}
                  </span>
                </button>
                {expanded && (
                  <div className="space-y-2 border-t border-border bg-primary-50/30 px-3 py-3 text-sm">
                    <HCDetalle label="Motivo"        value={a.motivo} />
                    <HCDetalle label="Anamnesis"     value={a.anamnesis} />
                    <HCDetalle label="Examen físico" value={a.examen_fisico} />
                    <HCDetalle label="Diagnóstico"   value={a.diagnostico} />
                    <HCDetalle label="Tratamiento"   value={a.tratamiento} />
                    <HCDetalle label="Indicaciones"  value={a.indicaciones} />
                    {a.proxima_consulta && (
                      <HCDetalle label="Próxima consulta" value={dateOf(a.proxima_consulta)} />
                    )}
                    {a.derivacion_destino && (
                      <HCDetalle label="Derivado a" value={a.derivacion_destino} />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Derivaciones estructuradas (ordenes_derivacion) — conviven con
          el "Derivado a" de texto libre de cada atención, mostrado
          arriba al expandir cada fila. */}
      <h3 className="text-xs font-bold uppercase tracking-wider text-primary-500">
        Derivaciones
      </h3>
      {derivQ.isLoading ? (
        <div className="flex justify-center p-6"><Spinner /></div>
      ) : (derivQ.data ?? []).length === 0 ? (
        <p className="text-sm text-primary-400">Sin derivaciones registradas.</p>
      ) : (
        <div className="space-y-2">
          {(derivQ.data ?? []).map(d => (
            <DerivacionCard key={d.id} derivacion={d}>
              <p className="mt-2 text-xs text-primary-500">
                {d.turno_id
                  ? '✓ Ya usada — vinculada a un turno reservado.'
                  : 'Sin usar todavía.'}
              </p>
            </DerivacionCard>
          ))}
        </div>
      )}
    </div>
  )
}

function HCDetalle({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-primary-700">{value}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Helpers de UI
// ─────────────────────────────────────────────────────────────────

function Textarea({ label, value, onChange, disabled, rows = 3 }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-primary-700">{label}</label>
      <textarea
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        className="input-field min-h-[64px] resize-y disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  )
}
