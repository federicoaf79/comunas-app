import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { usePortalMunicipioId } from '../../hooks/useConfigPortal'
import { validateDniArg, normalizePhoneE164 } from '../../lib/historiaClinica'
import { useOrdenMedicaUpload } from '../../hooks/useOrdenMedicaUpload'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'

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
  // Datos del solicitante (siempre van al vecino_id del turno)
  dni: '', nombre: '', telefono: '',
  // Datos del turno
  dependencia: '', fecha: '', canal: 'whatsapp', motivo: '',
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

// Búsqueda por DNI scoping al municipio del portal. Devuelve la
// primera fila que matchee — si la DB tuviera el mismo DNI en dos
// municipios distintos, prevalece el del portal actual.
async function lookupVecinoPorDni({ dni, municipio_id }) {
  let q = supabase
    .from('vecinos')
    .select('id, dni, nombre, apellido, nombre_completo, telefono')
    .eq('dni', dni)
    .limit(1)
  if (municipio_id) q = q.eq('municipio_id', municipio_id)
  const { data, error } = await q
  if (error) throw error
  return (data && data[0]) || null
}

// Busca el vecino por DNI; si no existe, lo crea con el municipio
// del turno. Devuelve { vecino, created } para que el caller sepa
// si fue alta nueva (y muestre el copy correspondiente en la
// pantalla de confirmación).
//
// Si hay un user logueado en Supabase Auth lo vinculamos al vecino
// nuevo seteando user_id. Si no hay sesión, queda sin link — se
// puede asociar más adelante desde "Mi cuenta".
async function findOrCreateVecino({ dni, nombre, telefono, municipio_id }) {
  // Primero scoped al municipio destino; si no hay match, hacemos
  // un fallback amplio para no duplicar a alguien que ya existe en
  // OTRO municipio (caso superadmin con varios portales).
  const existing = await lookupVecinoPorDni({ dni, municipio_id })
  if (existing) return { vecino: existing, created: false }

  // Split simple del nombre completo: primer token = nombre, resto = apellido.
  const partes      = nombre.trim().split(/\s+/)
  const nombreSolo  = partes.shift() ?? ''
  const apellido    = partes.join(' ') || nombreSolo

  let user_id = null
  try {
    const { data: { user } } = await supabase.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // Anon sin sesión → seguimos sin user_id.
  }

  const payload = {
    municipio_id,
    dni,
    nombre:          nombreSolo,
    apellido,
    nombre_completo: nombre,
    telefono,
    ...(user_id ? { user_id } : {}),
  }

  const { data: created, error: insErr } = await supabase
    .from('vecinos')
    .insert(payload)
    .select('id, telefono')
    .single()
  if (insErr) throw insErr
  return { vecino: created, created: true }
}

// Construye el objeto metadata jsonb a guardar en el turno cuando
// el ciudadano sacó turno para un familiar. El vecino_id sigue
// siendo el del solicitante (la persona que llenó el formulario)
// — quién va a atenderse queda registrado acá.
function buildFamiliarMetadata(form) {
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
    solicitante_nombre: form.nombre.trim(),
    solicitante_dni:    form.dni.trim(),
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

  const [form, setForm]           = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [resultado, setResultado] = useState(null)
  const [deps, setDeps]           = useState([])
  // dniStatus: 'idle' | 'searching' | 'found' | 'notfound'
  //   idle      → todavía no se intentó buscar (o DNI cambió y resetea)
  //   searching → fetch en vuelo
  //   found     → existe; auto-completamos nombre/teléfono
  //   notfound  → no existe; mostramos bloque gold + checkbox "Soy vecino"
  const [dniStatus, setDniStatus] = useState('idle')
  // Checkbox del bloque gold — obligatorio cuando dniStatus === 'notfound'.
  const [esVecino, setEsVecino]   = useState(false)
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  // Track del último DNI buscado para no re-disparar la query si el
  // usuario blurea sin cambiar nada.
  const lastDniLookup = useRef('')

  const portalMunicipioQ = usePortalMunicipioId()
  const portalMunicipioId = portalMunicipioQ.data ?? null
  const { uploadOrden, uploading: uploadingOrden } = useOrdenMedicaUpload()

  useEffect(() => {
    let cancelled = false
    if (!portalMunicipioId) return
    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
    fetch(
      `${SUPABASE_URL}/rest/v1/dependencias?municipio_id=eq.${portalMunicipioId}&activa=eq.true&modulo_turnos=eq.true&select=id,municipio_id,tipo,nombre&order=nombre.asc`,
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

  // Si el usuario edita el DNI después de buscar, reseteamos el
  // estado de lookup — el bloque gold/banner desaparece hasta que
  // vuelva a bluerar.
  useEffect(() => {
    if (dniStatus !== 'idle' && form.dni !== lastDniLookup.current) {
      setDniStatus('idle')
    }
  }, [form.dni, dniStatus])

  // Lookup en blur del DNI. Validamos formato local antes de
  // pegarle a Supabase — sin DNI válido no buscamos. El scope por
  // municipio_id es soft: si todavía no se cargó el portalMunicipioId,
  // hacemos un lookup global (caso muy raro: el hook usePortalMunicipioId
  // se resuelve casi instantáneamente).
  async function handleDniBlur() {
    const dni = form.dni.trim()
    if (!dni || dni === lastDniLookup.current) return
    const { ok } = validateDniArg(dni)
    if (!ok) {
      // No buscamos con formato inválido. El error de validación
      // se mostrará al intentar enviar; acá solo silenciamos.
      return
    }
    lastDniLookup.current = dni
    setDniStatus('searching')
    try {
      const vecino = await lookupVecinoPorDni({ dni, municipio_id: portalMunicipioId })
      if (vecino) {
        // Solo prefill si los campos están vacíos — no piso lo que
        // el usuario ya escribió manualmente.
        setForm(s => ({
          ...s,
          nombre:   s.nombre   || vecino.nombre_completo || [vecino.nombre, vecino.apellido].filter(Boolean).join(' ') || '',
          telefono: s.telefono || vecino.telefono || '',
        }))
        setDniStatus('found')
      } else {
        setDniStatus('notfound')
      }
    } catch (e) {
      console.warn('[SacarTurno] lookup vecino:', e?.message ?? e)
      // En caso de error de red, dejamos al usuario completar
      // manualmente. NO bloqueamos: status vuelve a idle.
      setDniStatus('idle')
      lastDniLookup.current = ''
    }
  }

  function resolveDep(depId) {
    return deps.find(d => d.id === depId) ?? null
  }

  const isFamiliar = form.paraQuien === 'familiar'

  // Validación: para enviar necesitamos los datos básicos del
  // solicitante + dependencia + fecha. Si es para un familiar,
  // además requerimos nombre/DNI/vínculo del familiar (y el texto
  // libre cuando vínculo === 'otro'). Si el DNI no existe en la DB
  // (alta nueva), además exigimos el checkbox "Soy vecino".
  // Si requiere orden médica, exigimos que hayan subido el archivo.
  const canSubmit =
    !!form.dni && !!form.nombre && !!form.telefono &&
    !!form.dependencia && !!form.fecha &&
    (dniStatus !== 'notfound' || esVecino) &&
    (!requiereOrden || !!form.ordenFile) &&
    (!isFamiliar || (
      !!form.familiar_nombre.trim() &&
      !!form.familiar_dni.trim() &&
      !!form.vinculo &&
      (form.vinculo !== 'otro' || !!form.vinculo_otro.trim())
    ))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    // Validación de DNI antes de pegarle a la DB.
    const dniRes = validateDniArg(form.dni)
    if (!dniRes.ok) {
      setError(dniRes.error)
      return
    }
    // Normalizamos teléfono a E.164 (+549…) — el campo de DB lo
    // guarda como string libre, pero el sistema de SMS/WhatsApp
    // necesita el formato canónico.
    const telRes = normalizePhoneE164(form.telefono)
    if (!telRes.ok) {
      setError(telRes.error)
      return
    }
    if (dniStatus === 'notfound' && !esVecino) {
      setError('Confirmá que sos vecino de Real Sayana para registrarte.')
      return
    }

    setSubmitting(true)
    try {
      const dep = resolveDep(form.dependencia)
      if (!dep) throw new Error('No se encontró la dependencia seleccionada.')

      const { vecino: v, created } = await findOrCreateVecino({
        dni:          dniRes.value,
        nombre:       form.nombre.trim(),
        telefono:     telRes.value,
        municipio_id: dep.municipio_id,
      })

      // fecha_hora: usamos la fecha elegida + 09:00 hora Argentina
      // como horario tentativo. El operador la ajusta al confirmar.
      const fecha_hora = `${form.fecha}T09:00:00-03:00`

      const payload = {
        municipio_id:   dep.municipio_id,
        dependencia_id: dep.id,
        vecino_id:      v.id,
        fecha_hora,
        estado:         requiereOrden ? 'pendiente_validacion' : 'pendiente',
        canal:          form.canal,
        motivo:         form.motivo || null,
      }
      if (isFamiliar) {
        payload.metadata = buildFamiliarMetadata(form)
      }
      // Si hay especialidad en URL, guardarla en metadata
      if (especialidadURL) {
        payload.metadata = { ...(payload.metadata || {}), especialidad: especialidadURL }
      }

      const { data: turno, error: tErr } = await supabase
        .from('turnos')
        .insert(payload)
        .select('id, numero_turno, fecha_hora, estado')
        .single()
      if (tErr) throw tErr

      // Si requiere orden y hay archivo, subirlo
      if (requiereOrden && form.ordenFile) {
        const uploadResult = await uploadOrden(form.ordenFile, turno.id, v.id)
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
        // Distingue alta nueva de match con vecino existente — la
        // pantalla de confirmación lo usa para mostrar el copy de
        // "También creamos tu perfil…".
        fue_alta_nueva:  created,
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
        {resultado.fue_alta_nueva && (
          <p
            className="mx-auto mt-4 max-w-sm rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-xs leading-relaxed text-primary-700"
            style={{ backgroundColor: 'rgba(201, 168, 76, 0.10)', borderColor: '#C9A84C' }}
          >
            También creamos tu perfil en el sistema. Podés completar tus datos
            desde <strong>Mi cuenta</strong> cuando quieras.
          </p>
        )}
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

      {/* Sección "Tus datos" — header full width, luego DNI | Nombre */}
      <h3 className="col-span-2 mt-2 text-xs font-bold uppercase tracking-widest text-primary">
        {isFamiliar ? 'Tus datos (solicitante)' : 'Tus datos'}
      </h3>
      <Input
        label="DNI"
        value={form.dni}
        onChange={e => set('dni', e.target.value.replace(/[^\d]/g, ''))}
        onBlur={handleDniBlur}
        required
        inputMode="numeric"
        type="text"
        autoComplete="off"
      />
      <Input
        label="Nombre completo"
        value={form.nombre}
        onChange={e => set('nombre', e.target.value)}
        required
        autoComplete="name"
      />

      {/* Status del lookup por DNI — full width */}
      {dniStatus === 'searching' && (
        <div className="col-span-2 flex items-center gap-2 rounded-md border border-border bg-white px-3 py-1.5 text-xs text-primary-500">
          <Spinner size="sm" />
          Buscando tu DNI…
        </div>
      )}
      {dniStatus === 'found' && (
        <div className="col-span-2 flex items-center gap-2 rounded-md border border-ok-100 bg-ok-50 px-3 py-1.5 text-xs text-ok-700">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4 shrink-0" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span>
            <strong>DNI encontrado.</strong> Cargamos tus datos — verificá nombre y teléfono.
          </span>
        </div>
      )}
      {dniStatus === 'notfound' && (
        <div
          className="col-span-2 rounded-md border-2 px-3 py-2"
          style={{
            backgroundColor: 'rgba(201, 168, 76, 0.10)',
            borderColor: '#C9A84C',
          }}
        >
          <p className="text-xs font-semibold text-primary">
            No encontramos tu DNI en el sistema. Completá estos datos para registrarte:
          </p>
          <p className="mt-0.5 text-[11px] text-primary-700">
            · Nombre completo y teléfono celular (formato +54 9…) en los campos del form.
          </p>
          <label className="mt-1.5 flex cursor-pointer items-center gap-2 text-xs text-primary-700">
            <input
              type="checkbox"
              checked={esVecino}
              onChange={e => setEsVecino(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <span>Soy vecino de <strong>Real Sayana</strong>.</span>
          </label>
        </div>
      )}

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
        onChange={v => set('dependencia', v)}
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

      {/* Campo de upload de orden médica — solo si requiere_orden=true */}
      {requiereOrden && (
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
              required={requiereOrden}
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
        <p className="mt-1.5 text-center text-[11px] text-primary-400">
          Te confirmamos por {form.canal === 'whatsapp' ? 'WhatsApp' : 'SMS'} en menos de 24hs.
        </p>
      </div>
    </form>
  )
}
