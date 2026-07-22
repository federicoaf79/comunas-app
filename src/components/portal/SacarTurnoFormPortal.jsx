import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'
import { supabase } from '../../lib/supabase'
import { usePortalMunicipioId } from '../../hooks/useConfigPortal'
import { normalizePhoneE164 } from '../../lib/historiaClinica'
import { useOrdenMedicaUpload } from '../../hooks/useOrdenMedicaUpload'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'

const CANALES = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms',      label: 'SMS' },
]

// Vínculos comunes — el último ('otro') desbloquea un input texto
// libre para que el ciudadano lo escriba como prefiera.
const VINCULOS = [
  { value: 'hijo',     label: 'Hijo / Hija' },
  { value: 'conyuge',  label: 'Cónyuge / Pareja' },
  { value: 'padre',    label: 'Padre / Madre' },
  { value: 'hermano',  label: 'Hermano / Hermana' },
  { value: 'abuelo',   label: 'Abuelo / Abuela' },
  { value: 'nieto',    label: 'Nieto / Nieta' },
  { value: 'otro',     label: 'Otro familiar' },
]

const EMPTY = {
  // Teléfono del solicitante — prefilleado desde vecinoSession pero
  // editable (puede diferir del registrado, es a dónde se manda la
  // confirmación por WhatsApp/SMS).
  telefono: '',
  // Datos del turno
  dependencia: '', fecha: '', canal: 'whatsapp', motivo: '',
  // Especialidad — solo aplica si la dependencia elegida tiene
  // profesionales con especialidad cargada (ver especialidadesDisponibles).
  especialidad: '',
  // ¿Para quién es?
  paraQuien: 'mi',
  // Datos del familiar — solo se usan si paraQuien === 'familiar'
  familiar_nombre: '',
  familiar_dni:    '',
  vinculo:         '',
  vinculo_otro:    '',
  familiar_edad:   '',
  // Orden médica (solo si requiere_orden=true)
  ordenFile: null,
}

// Construye el objeto metadata jsonb a guardar en el turno cuando
// el ciudadano sacó turno para un familiar. El vecino_id sigue
// siendo el del solicitante (la cuenta logueada) — quién va a
// atenderse queda registrado acá.
function buildFamiliarMetadata(form, vecinoSession) {
  const vinculoFinal =
    form.vinculo === 'otro'
      ? (form.vinculo_otro.trim() || 'otro')
      : form.vinculo
  const edadNum = form.familiar_edad ? Number(form.familiar_edad) : null
  return {
    para_familiar:      true,
    familiar_nombre:    form.familiar_nombre.trim(),
    familiar_dni:       form.familiar_dni.trim(),
    vinculo:            vinculoFinal,
    familiar_edad:      Number.isFinite(edadNum) ? edadNum : null,
    solicitante_nombre: vecinoSession?.nombre_completo || '',
    solicitante_dni:    vecinoSession?.dni || '',
    solicitante_tel:    form.telefono.trim(),
  }
}

// ─────────────────────────────────────────────────────────────────
// Selector grande tipo "card de radio". Mobile-friendly: cada opción
// tiene 56px de alto mínimo y feedback visual claro de selección.
// ─────────────────────────────────────────────────────────────────
function ParaQuienSelector({ value, onChange }) {
  const options = [
    {
      v:       'mi',
      label:   'Para mí',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path strokeLinecap="round" d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      ),
    },
    {
      v:       'familiar',
      label:   'Para un familiar',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4" aria-hidden="true">
          <circle cx="9"  cy="8" r="3.2" />
          <circle cx="17" cy="9" r="2.6" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 20c.8-3 3.3-5 6-5s5.2 2 6 5M14 20c.6-2 2-3 3.5-3s2.9 1 3.5 3" />
        </svg>
      ),
    },
  ]
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-bold uppercase tracking-widest text-primary">
        ¿Para quién es el turno?
      </legend>
      <div role="radiogroup" className="grid grid-cols-2 gap-2">
        {options.map(o => {
          const active = value === o.v
          return (
            <label
              key={o.v}
              className={
                'flex cursor-pointer items-center gap-2 rounded-md border-2 p-2 text-xs transition-colors ' +
                (active
                  ? 'border-primary bg-primary-50 text-primary'
                  : 'border-border bg-white text-primary-700 hover:border-primary-200 hover:bg-primary-50')
              }
            >
              <input
                type="radio"
                name="para-quien"
                value={o.v}
                checked={active}
                onChange={() => onChange(o.v)}
                className="sr-only"
              />
              <span
                className={
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ' +
                  (active ? 'border-primary bg-primary' : 'border-primary-300 bg-white')
                }
                aria-hidden="true"
              >
                {active && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="h-2.5 w-2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span className={'shrink-0 ' + (active ? 'text-primary' : 'text-primary-500')}>
                {o.icon}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">{o.label}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

// ─────────────────────────────────────────────────────────────────
// Panel "Datos del familiar" — fondo levemente diferente (#F0F4F8)
// para distinguir visualmente que esos datos pertenecen a otra
// persona, no al solicitante.
// ─────────────────────────────────────────────────────────────────
function FamiliarPanel({ form, set }) {
  const showOtroVinculo = form.vinculo === 'otro'
  return (
    <div
      className="rounded-lg border border-primary-100 p-4 sm:p-5"
      style={{ backgroundColor: '#F0F4F8' }}
    >
      <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
        Datos del familiar
      </h3>
      <p className="mt-1 text-xs text-primary-500 sm:text-sm">
        Completá los datos de la persona que va a atenderse.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input
          label="Nombre completo del familiar"
          value={form.familiar_nombre}
          onChange={e => set('familiar_nombre', e.target.value)}
          required
          autoComplete="off"
        />
        <Input
          label="DNI del familiar"
          value={form.familiar_dni}
          onChange={e => set('familiar_dni', e.target.value)}
          required
          inputMode="numeric"
          type="text"
          autoComplete="off"
        />
        <Select
          label="Vínculo familiar"
          value={form.vinculo}
          onChange={v => set('vinculo', v)}
          placeholder="Seleccionar..."
          options={VINCULOS}
        />
        <Input
          label="Edad (opcional)"
          value={form.familiar_edad}
          onChange={e => set('familiar_edad', e.target.value.replace(/[^\d]/g, ''))}
          inputMode="numeric"
          type="text"
          autoComplete="off"
          placeholder="Ej: 8"
        />
        {showOtroVinculo && (
          <div className="sm:col-span-2">
            <Input
              label="Especificá el vínculo"
              value={form.vinculo_otro}
              onChange={e => set('vinculo_otro', e.target.value)}
              placeholder="Ej: Tío/a, primo/a, suegro/a..."
              required
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────
export default function SacarTurnoFormPortal() {
  const [searchParams] = useSearchParams()
  const requiereOrden = searchParams.get('requiere_orden') === 'true'
  const especialidadURL = searchParams.get('esp') || ''
  const depParam = searchParams.get('dep') || ''  // dep desde URL (slug/tipo)

  // Ruta detrás de VecinoGuard(requireCuentaCompleta) — vecinoSession
  // siempre existe acá, con auth_mode === 'supabase'.
  const { vecinoSession } = useVecino()

  const [form, setForm] = useState(() => ({
    ...EMPTY,
    telefono: vecinoSession?.telefono ?? '',
    especialidad: especialidadURL,
  }))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [resultado, setResultado] = useState(null)
  const [deps, setDeps]           = useState([])
  const [profesionalesDep, setProfesionalesDep] = useState([])
  // Derivación digital del médico general (ordenes_derivacion,
  // origen='digital') que cubre la especialidad elegida — si existe,
  // se salta el paso de subir orden médica.
  const [derivacionDigital, setDerivacionDigital]   = useState(null)
  const [checkingDerivacion, setCheckingDerivacion] = useState(false)
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const depPreselectado = useRef(false)  // flag para solo preseleccionar una vez

  const portalMunicipioQ = usePortalMunicipioId()
  const portalMunicipioId = portalMunicipioQ.data ?? null
  const { uploadOrden, uploading: uploadingOrden } = useOrdenMedicaUpload()

  useEffect(() => {
    let cancelled = false
    if (!portalMunicipioId) return
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
    fetch(
      `${SUPABASE_URL}/rest/v1/dependencias?municipio_id=eq.${portalMunicipioId}&activa=eq.true&modulo_turnos=eq.true&tipo=not.in.(polideportivo,deporte)&select=id,municipio_id,tipo,nombre,slug&order=nombre.asc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    )
      .then(res => res.json())
      .then(data => { if (!cancelled) setDeps(data ?? []) })
      .catch(err => console.warn('[SacarTurno] fetch deps:', err))
    return () => { cancelled = true }
  }, [portalMunicipioId])

  // Profesionales de la dependencia elegida — vista pública
  // (sin telefono/email), usada solo para armar el selector de
  // especialidad cuando la dependencia tiene ≥1 profesional con
  // especialidad cargada. Genérico: no hardcodeado a CIC.
  useEffect(() => {
    let cancelled = false
    if (!form.dependencia) { setProfesionalesDep([]); return }
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
    fetch(
      `${SUPABASE_URL}/rest/v1/profesionales_publico?dependencia_id=eq.${form.dependencia}&activo=eq.true&select=especialidad,requiere_orden`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    )
      .then(res => res.json())
      .then(data => { if (!cancelled) setProfesionalesDep(data ?? []) })
      .catch(err => console.warn('[SacarTurno] fetch profesionales:', err))
    return () => { cancelled = true }
  }, [form.dependencia])

  // Preselección de dependencia desde ?dep= en la URL
  useEffect(() => {
    if (!depParam || depPreselectado.current || deps.length === 0) return

    // Normalizar para matching flexible (lowercase, sin acentos, sin guiones)
    const normalizar = s => (s ?? '')
      .toString()
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[\s_\-/]+/g, '')

    const targetNorm = normalizar(depParam)

    // Buscar por slug exacto → tipo exacto → nombre parcial
    const match = deps.find(d => normalizar(d.slug) === targetNorm)
               ?? deps.find(d => normalizar(d.tipo) === targetNorm)
               ?? deps.find(d => normalizar(d.nombre).includes(targetNorm))

    if (match) {
      set('dependencia', match.id)
      depPreselectado.current = true
    }
  }, [depParam, deps])

  function resolveDep(depId) {
    return deps.find(d => d.id === depId) ?? null
  }

  // Valores únicos de especialidad entre los profesionales activos de
  // la dependencia elegida. Si no hay ninguno, el selector no se muestra.
  const especialidadesDisponibles = Array.from(
    new Set(profesionalesDep.map(p => p.especialidad).filter(Boolean))
  )

  // Si requiere orden — dato real de profesionales_publico para la
  // especialidad ELEGIDA en el form, no solo el flag estático de la
  // URL (que puede quedar desactualizado si el vecino cambia de
  // especialidad en el selector).
  const especialidadRequiereOrden =
    requiereOrden ||
    profesionalesDep.some(p => p.especialidad === form.especialidad && p.requiere_orden)

  // Derivación digital ya validada por el Médico General del CIC que
  // cubre esta especialidad — si existe, se salta el upload de
  // archivo. Usa el cliente autenticado (no el anon de los fetch de
  // arriba) porque esta ruta vive detrás de VecinoGuard(requireCuentaCompleta)
  // y ordenes_derivacion no es de lectura pública.
  useEffect(() => {
    let cancelled = false
    setDerivacionDigital(null)
    if (!especialidadRequiereOrden || !form.especialidad || !vecinoSession?.id) return
    setCheckingDerivacion(true)
    supabase
      .from('ordenes_derivacion')
      .select('id, especialidad_destino')
      .eq('vecino_id', vecinoSession.id)
      .eq('origen', 'digital')
      .eq('estado', 'validada')
      .eq('especialidad_destino', form.especialidad)
      .is('turno_id', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.warn('[SacarTurno] fetch derivacion digital:', error.message); return }
        setDerivacionDigital(data ?? null)
      })
      .finally(() => { if (!cancelled) setCheckingDerivacion(false) })
    return () => { cancelled = true }
  }, [especialidadRequiereOrden, form.especialidad, vecinoSession?.id])

  const isFamiliar = form.paraQuien === 'familiar'

  // Validación: solicitante ya está identificado por la sesión — acá
  // solo faltan teléfono, dependencia y fecha. Si es para un
  // familiar, además requerimos nombre/DNI/vínculo del familiar (y
  // el texto libre cuando vínculo === 'otro'). Si requiere orden
  // médica, la cubre una derivación digital ya validada o, si no hay,
  // exigimos que hayan subido el archivo.
  const canSubmit =
    !!form.telefono &&
    !!form.dependencia && !!form.fecha &&
    (!especialidadRequiereOrden || !!derivacionDigital || !!form.ordenFile) &&
    (!isFamiliar || (
      !!form.familiar_nombre.trim() &&
      !!form.familiar_dni.trim() &&
      !!form.vinculo &&
      (form.vinculo !== 'otro' || !!form.vinculo_otro.trim())
    ))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Normalizamos teléfono a E.164 (+549…) — el campo de DB lo
    // guarda como string libre, pero el sistema de SMS/WhatsApp
    // necesita el formato canónico.
    const telRes = normalizePhoneE164(form.telefono)
    if (!telRes.ok) {
      setError(telRes.error)
      return
    }

    setSubmitting(true)
    try {
      const dep = resolveDep(form.dependencia)
      if (!dep) throw new Error('No se encontró la dependencia seleccionada.')

      // fecha_hora: usamos la fecha elegida + 09:00 hora Argentina
      // como horario tentativo. El operador la ajusta al confirmar.
      const fecha_hora = `${form.fecha}T09:00:00-03:00`

      // Descomponer fecha_hora en fecha + hora_inicio + hora_fin
      const dt = new Date(fecha_hora)
      // Helper: Date → YYYY-MM-DD en TZ Argentina (evita corrimiento de día)
      const fmtDate = (d) => new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d)
      const fecha = fmtDate(dt)
      const hora_inicio = dt.toTimeString().slice(0, 5) // HH:MM
      const dtFin = new Date(dt.getTime() + 30 * 60 * 1000) // +30 min
      const hora_fin = dtFin.toTimeString().slice(0, 5)

      const payload = {
        municipio_id:   dep.municipio_id,
        dependencia_id: dep.id,
        vecino_id:      vecinoSession.id,
        fecha,
        hora_inicio,
        hora_fin,
        // Si una derivación digital ya validada cubre la especialidad,
        // el turno no necesita el paso de validación de staff — va
        // directo a 'pendiente' igual que cualquier turno sin orden.
        estado:         (especialidadRequiereOrden && !derivacionDigital) ? 'pendiente_validacion' : 'pendiente',
        canal:          form.canal,
        motivo:         form.motivo || null,
      }
      if (isFamiliar) {
        payload.metadata = buildFamiliarMetadata(form, vecinoSession)
      }
      // Especialidad — precargada desde ?esp= o elegida a mano en el selector
      if (form.especialidad) {
        payload.metadata = { ...(payload.metadata || {}), especialidad: form.especialidad }
      }

      const { data: turno, error: tErr } = await supabase
        .from('turnos_agenda')
        .insert(payload)
        .select('id, numero_turno, fecha, hora_inicio, estado')
        .single()
      if (tErr) throw tErr

      // Si hay una derivación digital cubriendo esta especialidad, la
      // linkeamos al turno recién creado (así no se puede reusar en
      // otra reserva) y saltamos el upload de archivo por completo.
      if (derivacionDigital) {
        // .select() para poder distinguir "0 filas afectadas por RLS"
        // (data=[], sin error) de un update real — sin esto, un UPDATE
        // bloqueado en silencio por falta de policy se ve idéntico a
        // uno exitoso.
        const { data: derivRows, error: derivErr } = await supabase
          .from('ordenes_derivacion')
          .update({ turno_id: turno.id })
          .eq('id', derivacionDigital.id)
          .select('id')
        if (derivErr) {
          throw new Error('No pudimos vincular tu derivación: ' + derivErr.message)
        }
        if (!derivRows || derivRows.length === 0) {
          throw new Error('No pudimos vincular tu derivación digital al turno. Contactanos para resolverlo.')
        }
      } else if (especialidadRequiereOrden && form.ordenFile) {
        const uploadResult = await uploadOrden(form.ordenFile, turno.id, vecinoSession.id)
        if (!uploadResult.success) {
          throw new Error('Error al subir orden médica: ' + uploadResult.error)
        }
      }

      setResultado({
        numero:          turno?.numero_turno ?? turno?.id?.slice(0, 8),
        canal:           form.canal,
        telefono:        telRes.value,
        para_familiar:   isFamiliar,
        familiar_nombre: form.familiar_nombre,
      })
    } catch (e) {
      setError(e?.message ?? 'No pudimos registrar tu turno. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  if (resultado) {
    const canalLabel = resultado.canal === 'whatsapp' ? 'WhatsApp' : 'SMS'
    return (
      <div className="card p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ok-50 text-ok-700">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-primary">¡Turno solicitado!</h3>
        {resultado.numero && (
          <p className="mt-2 text-sm text-primary-700">
            Tu número de turno: <strong className="text-base">#{resultado.numero}</strong>
          </p>
        )}
        {resultado.para_familiar && resultado.familiar_nombre && (
          <p className="mt-2 text-sm text-primary-500">
            El turno fue registrado a nombre de{' '}
            <strong className="text-primary-700">{resultado.familiar_nombre}</strong>.
          </p>
        )}
        <p className="mt-2 text-sm text-primary-500">
          Te confirmamos por <strong>{canalLabel}</strong> en menos de 24 hs.
        </p>
        <Link
          to="/portal"
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
        >
          ← Volver al portal
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="card form-tight grid grid-cols-2 gap-3 p-4">
      {/* ¿Para quién es? — full width */}
      <div className="col-span-2">
        <ParaQuienSelector value={form.paraQuien} onChange={v => set('paraQuien', v)} />
      </div>

      {/* Sección "Tus datos" — header full width, luego resumen de la
          cuenta (solo lectura) | Teléfono editable. */}
      <h3 className="col-span-2 mt-2 text-xs font-bold uppercase tracking-widest text-primary">
        {isFamiliar ? 'Tus datos (solicitante)' : 'Tus datos'}
      </h3>
      <div className="col-span-2 rounded-md border border-border bg-primary-50 px-3 py-2 text-sm text-primary-700">
        Reservando como <strong>{vecinoSession?.nombre_completo || 'vos'}</strong>
        {vecinoSession?.dni && <> · DNI {vecinoSession.dni}</>}
      </div>
      <Input
        label="Teléfono celular"
        value={form.telefono}
        onChange={e => set('telefono', e.target.value)}
        required
        inputMode="tel"
        type="tel"
        autoComplete="tel"
        placeholder="+54 9 ..."
      />
      <Select
        label="Canal de contacto"
        value={form.canal}
        onChange={v => set('canal', v)}
        options={CANALES}
      />

      {/* Datos del familiar — full width, sólo si "para un familiar" */}
      {isFamiliar && (
        <div className="col-span-2">
          <FamiliarPanel form={form} set={set} />
        </div>
      )}

      {/* Sección "Datos del turno" — header full width, luego Dep | Fecha,
          y Motivo span completo. */}
      <h3 className="col-span-2 mt-2 text-xs font-bold uppercase tracking-widest text-primary">
        Datos del turno
      </h3>
      <Select
        label="Dependencia"
        value={form.dependencia}
        onChange={v => setForm(s => ({ ...s, dependencia: v, especialidad: '' }))}
        placeholder="Seleccionar..."
        options={deps.map(d => ({ value: d.id, label: d.nombre }))}
      />
      <Input
        label="Fecha preferida"
        type="date"
        value={form.fecha}
        onChange={e => set('fecha', e.target.value)}
        required
      />
      {especialidadesDisponibles.length > 0 && (
        <div className="col-span-2">
          <Select
            label="Servicio / Especialidad"
            value={form.especialidad}
            onChange={v => set('especialidad', v)}
            placeholder="Seleccionar..."
            options={especialidadesDisponibles.map(e => ({
              value: e,
              label: e.charAt(0).toUpperCase() + e.slice(1),
            }))}
          />
        </div>
      )}
      <div className="col-span-2">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-700">
          Motivo <span className="font-normal normal-case tracking-normal text-primary-400">(opcional)</span>
        </label>
        <textarea
          value={form.motivo}
          onChange={e => set('motivo', e.target.value)}
          rows={2}
          className="input-field resize-none"
          placeholder={
            isFamiliar
              ? 'Síntomas, motivo de consulta, etc.'
              : 'Contanos brevemente para qué pedís el turno'
          }
        />
      </div>

      {/* Campo de upload de orden médica — solo si la especialidad
          elegida requiere orden Y no hay ya una derivación digital
          validada que la cubra. */}
      {especialidadRequiereOrden && checkingDerivacion && (
        <div className="col-span-2 rounded-md border border-border bg-primary-50 px-3 py-2 text-xs text-primary-500">
          Buscando si ya tenés una derivación digital para esta especialidad…
        </div>
      )}

      {especialidadRequiereOrden && !checkingDerivacion && derivacionDigital && (
        <div className="col-span-2 rounded-md border border-ok-100 bg-ok-50 px-3 py-2 text-sm text-ok-700">
          ✓ Ya tenés una derivación digital validada para <strong>{derivacionDigital.especialidad_destino}</strong> —
          no hace falta subir orden médica.
        </div>
      )}

      {especialidadRequiereOrden && !checkingDerivacion && !derivacionDigital && (
        <div className="col-span-2">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-700">
            Orden médica <span className="font-normal normal-case tracking-normal text-red-500">*</span>
          </label>
          <div
            className="relative rounded-md border-2 border-dashed border-[#C9A84C] bg-[#C9A84C]/5 p-4 text-center transition-colors hover:border-[#C9A84C]/70 hover:bg-[#C9A84C]/10"
          >
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) {
                  // Validar tamaño (max 5MB)
                  if (file.size > 5 * 1024 * 1024) {
                    setError('El archivo es muy grande. Máximo 5MB.')
                    e.target.value = ''
                    return
                  }
                  set('ordenFile', file)
                  setError('')
                }
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
              required={especialidadRequiereOrden}
            />
            <div className="pointer-events-none flex flex-col items-center gap-2">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#C9A84C"
                strokeWidth="2"
                className="h-8 w-8"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {form.ordenFile ? (
                <div className="text-sm">
                  <p className="font-semibold text-primary">📄 {form.ordenFile.name}</p>
                  <p className="text-xs text-primary-500">
                    {(form.ordenFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              ) : (
                <div className="text-sm text-primary-700">
                  <p className="font-semibold">Adjuntá tu orden médica</p>
                  <p className="text-xs text-primary-500">Foto o PDF · Máximo 5MB</p>
                </div>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-primary-500">
            Subí una foto clara de tu orden de derivación médica. Formatos aceptados: JPG, PNG, PDF
          </p>
        </div>
      )}

      {error && (
        <div className="col-span-2 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="col-span-2">
        <Button
          type="submit"
          loading={submitting}
          disabled={!canSubmit}
          className="w-full"
        >
          Solicitar turno
        </Button>
        {!canSubmit && (
          <p className="mt-1.5 text-center text-xs text-primary-400">Completá todos los campos obligatorios para continuar</p>
        )}
        <p className="mt-1.5 text-center text-[11px] text-primary-400">
          Te confirmamos por {form.canal === 'whatsapp' ? 'WhatsApp' : 'SMS'} en menos de 24hs.
        </p>
      </div>
    </form>
  )
}
