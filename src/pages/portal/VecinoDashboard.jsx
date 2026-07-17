import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'
import { useTurnosVecino, useAtencionesVecino, useDocumentosAtencion, useReclamosVecino } from '../../hooks/useVecinoData'
import { useReservasVecino } from '../../hooks/useReservasDeportivas'
import { supabase } from '../../lib/supabase'
import DashboardHeader from '../../components/portal/DashboardHeader'
import Spinner from '../../components/ui/Spinner'
import Modal   from '../../components/ui/Modal'
import { dateOf, dateTimeOf, timeOf } from '../../lib/datetime'

const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'

const ESTADO_LABEL = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  en_curso:   'En curso',
  completado: 'Completado',
  cancelado:  'Cancelado',
  reservado:  'Pendiente',
  atendido:   'Atendido',
}
const ESTADO_CLASS = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
  reservado:  'estado-pendiente',
  atendido:   'estado-atendido',
}

const VINCULO_LABEL = {
  hijo:    'Hijo / Hija',
  conyuge: 'Cónyuge / Pareja',
  padre:   'Padre / Madre',
  hermano: 'Hermano / Hermana',
  abuelo:  'Abuelo / Abuela',
  nieto:   'Nieto / Nieta',
  otro:    'Otro familiar',
}

const TABS = [
  { key: 'turnos',   label: 'Mis turnos',   short: 'Turnos' },
  { key: 'salud',    label: 'Mi salud',     short: 'Salud' },
  { key: 'datos',    label: 'Mis datos',    short: 'Datos' },
  { key: 'reclamos', label: 'Mis reclamos', short: 'Reclamos' },
  { key: 'reservas', label: 'Polideportivo', short: 'Polideportivo' },
  { key: 'familia',  label: 'Mi familia',   short: 'Familia' },
]

function nombreVecino(v) {
  if (!v) return 'Vecino'
  if (v.nombre_completo) return v.nombre_completo
  if (v.nombre && v.apellido) return `${v.nombre} ${v.apellido}`
  return v.nombre || v.apellido || 'Vecino'
}

// ─────────────────────────────────────────────────────────────────
// Tabs — botones grandes, scroll horizontal en mobile
// ─────────────────────────────────────────────────────────────────
function Tabs({ active, onChange }) {
  return (
    <div
      role="tablist"
      className="-mx-4 flex gap-1 overflow-x-auto border-b border-border bg-white px-4 sm:mx-0 sm:px-0"
      style={{ scrollbarWidth: 'thin' }}
    >
      <div className="mx-auto flex w-full max-w-5xl gap-1">
        {TABS.map(t => {
          const isActive = active === t.key
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.key)}
              className={
                'shrink-0 border-b-2 px-4 py-2 text-sm font-semibold transition-colors ' +
                (isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-primary-400 hover:text-primary-700')
              }
            >
              <span className="hidden sm:inline">{t.label}</span>
              <span className="sm:hidden">{t.short}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// A) Mis turnos
// ─────────────────────────────────────────────────────────────────

function ProximoTurnoCard({ turno }) {
  const dep = turno.dependencia?.nombre ?? '—'
  return (
    <div className="rounded-xl border-2 border-primary bg-gradient-to-br from-primary-50 via-white to-accent-50 p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-accent-700">
            Próximo turno
          </p>
          <p className="mt-2 font-sora text-2xl font-bold text-primary sm:text-3xl">
            {dateOf(turno.fecha_hora)}
          </p>
          <p className="mt-1 text-sm font-medium text-primary-700 sm:text-base">
            {timeOf(turno.fecha_hora)} hs · {dep}
          </p>
        </div>
        {turno.numero_turno && (
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-primary-400">N°</p>
            <p className="font-sora text-2xl font-bold text-primary">#{turno.numero_turno}</p>
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={ESTADO_CLASS[turno.estado] ?? 'estado-pendiente'}>
          {ESTADO_LABEL[turno.estado] ?? turno.estado}
        </span>
        {turno.canal && (
          <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700 ring-1 ring-inset ring-border">
            {turno.canal === 'whatsapp' ? 'WhatsApp' : turno.canal === 'sms' ? 'SMS' : turno.canal}
          </span>
        )}
      </div>
      {turno.motivo && (
        <p className="mt-4 text-sm text-primary-500">
          <span className="font-semibold text-primary-700">Motivo:</span> {turno.motivo}
        </p>
      )}
    </div>
  )
}

function TurnoRow({ turno }) {
  const dep = turno.dependencia?.nombre ?? '—'
  const isFamiliar = !!turno.metadata?.para_familiar
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary sm:text-base">
          {dateTimeOf(turno.fecha_hora)}
        </p>
        <p className="mt-0.5 text-xs text-primary-500 sm:text-sm">{dep}</p>
        {isFamiliar && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-700">
            <span aria-hidden="true">👨‍👩‍👧</span>
            Para {turno.metadata.familiar_nombre || 'familiar'}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
        <span className={ESTADO_CLASS[turno.estado] ?? 'estado-pendiente'}>
          {ESTADO_LABEL[turno.estado] ?? turno.estado}
        </span>
        {turno.numero_turno && (
          <span className="text-primary-400">#{turno.numero_turno}</span>
        )}
      </div>
    </li>
  )
}

function TurnosTab({ turnos, isLoading, error }) {
  // Próximo turno = primer turno con fecha futura y estado activo.
  const ahora = useMemo(() => new Date().toISOString(), [])
  const [proximo, restoTurnos] = useMemo(() => {
    const futuros = turnos
      .filter(t => t.fecha_hora >= ahora && (t.estado === 'pendiente' || t.estado === 'confirmado'))
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora))
    const prox = futuros[0] ?? null
    const rest = prox ? turnos.filter(t => t.id !== prox.id) : turnos
    return [prox, rest]
  }, [turnos, ahora])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-sora text-lg font-bold text-primary sm:text-xl">Mis turnos</h2>
          <p className="text-sm text-primary-500">
            {turnos.length === 0 ? 'Todavía no tenés turnos solicitados.' : `${turnos.length} turno${turnos.length === 1 ? '' : 's'} en total`}
          </p>
        </div>
        <Link to="/portal/turno" className="btn-accent">
          + Sacar nuevo turno
        </Link>
      </div>

      {isLoading && (
        <div className="card flex items-center justify-center p-8">
          <Spinner size="lg" />
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          No pudimos cargar tus turnos. Probá de nuevo.
        </div>
      )}

      {!isLoading && !error && proximo && <ProximoTurnoCard turno={proximo} />}

      {!isLoading && !error && restoTurnos.length > 0 && (
        <div className="card overflow-hidden p-0">
          <header className="border-b border-border bg-primary-50 px-5 py-3">
            <h3 className="text-sm font-semibold text-primary">Historial de turnos</h3>
          </header>
          <ul className="divide-y divide-border">
            {restoTurnos.map(t => <TurnoRow key={t.id} turno={t} />)}
          </ul>
        </div>
      )}

      {!isLoading && !error && turnos.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-primary-500">
            Cuando saques tu primer turno aparecerá acá.
          </p>
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// B) Mi salud — HC completa con datos vitales y carpetas por dependencia
// ─────────────────────────────────────────────────────────────────

function DatosVitalesCard({ vecino }) {
  const grupoSanguineo = vecino.grupo_sanguineo || 'No especificado'

  let alergias = 'No especificado'
  if (vecino.sin_alergias_conocidas) {
    alergias = 'Sin alergias conocidas'
  } else if (vecino.alergias && vecino.alergias.length > 0) {
    alergias = vecino.alergias.join(', ')
  }

  const contactoEmergencia = vecino.contacto_emergencia_nombre && vecino.contacto_emergencia_telefono
    ? `${vecino.contacto_emergencia_nombre} · ${vecino.contacto_emergencia_telefono}`
    : 'No especificado'

  return (
    <div className="rounded-xl bg-primary p-5 text-white shadow-lg">
      <h3 className="font-sora text-sm font-bold uppercase tracking-wide">
        📋 Datos vitales
      </h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">Grupo sanguíneo</p>
          <p className="mt-1 font-semibold">{grupoSanguineo}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">Alergias</p>
          <p className="mt-1 font-semibold">{alergias}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-white/70">Contacto de emergencia</p>
          <p className="mt-1 font-semibold">{contactoEmergencia}</p>
        </div>
      </div>
    </div>
  )
}

function AtencionDocumentos({ atencionId }) {
  const { data: documentos, isLoading } = useDocumentosAtencion(atencionId, supabase)

  if (isLoading) return <Spinner size="sm" />
  if (!documentos || documentos.length === 0) return null

  const TIPOS_ICONO = {
    receta:  '📋',
    estudio: '🔬',
    informe: '🏥',
    otro:    '📄',
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {documentos.map(d => (
        <a
          key={d.id}
          href={d.public_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-100 transition-colors hover:bg-accent-100"
          title={d.nombre || 'Ver documento'}
        >
          <span aria-hidden="true">{TIPOS_ICONO[d.tipo] ?? '📄'}</span>
          {d.nombre_archivo}
        </a>
      ))}
    </div>
  )
}

function SaludTab({ vecino, atenciones, isLoading, error }) {
  const navigate = useNavigate()
  const [carpetaActiva, setCarpetaActiva] = useState(null)

  // Agrupar atenciones por dependencia
  const carpetas = useMemo(() => {
    if (!atenciones || atenciones.length === 0) return []

    const grupos = atenciones.reduce((acc, a) => {
      const depId = a.dependencia_id || '__sin_dep__'
      const depNombre = a.dependencia?.nombre || 'Sin dependencia'
      if (!acc[depId]) {
        acc[depId] = { id: depId, nombre: depNombre, atenciones: [] }
      }
      acc[depId].atenciones.push(a)
      return acc
    }, {})

    return Object.values(grupos).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [atenciones])

  // Abrir la primera carpeta por defecto
  if (carpetas.length > 0 && !carpetaActiva) {
    setCarpetaActiva(carpetas[0].id)
  }

  // Restricción: solo auth_mode === 'supabase' puede ver HC
  if (vecino.auth_mode !== 'supabase') {
    return (
      <section className="space-y-4">
        <div>
          <h2 className="font-sora text-lg font-bold text-primary sm:text-xl">Mi salud</h2>
          <p className="text-sm text-primary-500">
            Información clínica y atenciones médicas.
          </p>
        </div>

        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Cuenta requerida
            </h3>
            <p className="mt-3 text-sm text-primary-700">
              Para acceder a tu Historia Clínica, se requiere que tengas una cuenta registrada.
              Si entraste con acceso rápido, cerrá sesión y registrate o iniciá sesión con tu cuenta.
            </p>
            <button
              onClick={() => navigate('/portal/acceso')}
              className="btn-primary mt-6"
            >
              Ir a iniciar sesión
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-sora text-lg font-bold text-primary sm:text-xl">Mi salud</h2>
        <p className="text-sm text-primary-500">
          Información clínica y atenciones médicas.
        </p>
      </div>

      {/* Datos vitales */}
      <DatosVitalesCard vecino={vecino} />

      {/* Historia clínica */}
      <div>
        <h3 className="font-sora text-base font-bold text-primary">Mi historia clínica</h3>
        <p className="mt-0.5 text-xs text-primary-500">
          Consultas y atenciones organizadas por servicio.
        </p>
      </div>

      {isLoading && (
        <div className="card flex items-center justify-center p-8">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          No pudimos cargar tu historia clínica. Probá de nuevo.
        </div>
      )}

      {!isLoading && !error && carpetas.length === 0 && (
        <div className="card p-8 text-center text-sm text-primary-400">
          No tenés atenciones registradas todavía.
        </div>
      )}

      {!isLoading && !error && carpetas.length > 0 && (
        <div className="space-y-4">
          {/* Tabs de carpetas */}
          <div className="flex flex-wrap gap-2">
            {carpetas.map(c => (
              <button
                key={c.id}
                onClick={() => setCarpetaActiva(c.id)}
                className={
                  'rounded-lg px-4 py-2 text-sm font-semibold transition-colors ' +
                  (carpetaActiva === c.id
                    ? 'bg-primary text-white'
                    : 'bg-primary-50 text-primary hover:bg-primary-100')
                }
              >
                📁 {c.nombre}
                <span className="ml-1.5 rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
                  {c.atenciones.length}
                </span>
              </button>
            ))}
          </div>

          {/* Contenido de la carpeta activa */}
          {carpetas
            .filter(c => c.id === carpetaActiva)
            .map(c => (
              <div key={c.id} className="space-y-3">
                {c.atenciones.map(a => (
                  <div key={a.id} className="card p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-primary sm:text-base">
                          {a.motivo || 'Consulta médica'}
                        </p>
                        <p className="mt-1 text-xs text-primary-500">
                          {dateTimeOf(a.fecha_hora)} · {a.profesional?.nombre || 'Profesional no especificado'}
                        </p>
                      </div>
                    </div>

                    {(a.diagnostico || a.receta) && (
                      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                        {a.diagnostico && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Diagnóstico</p>
                            <p className="mt-1 text-primary-700">{a.diagnostico}</p>
                          </div>
                        )}
                        {a.receta && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Receta</p>
                            <p className="mt-1 text-primary-700">{a.receta}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Documentos adjuntos */}
                    <AtencionDocumentos atencionId={a.id} />
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// C) Mis datos
// ─────────────────────────────────────────────────────────────────

function DatoRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-2 sm:flex-row sm:justify-between sm:gap-4 last:border-b-0">
      <p className="text-xs font-medium uppercase tracking-wide text-primary-400">{label}</p>
      <p className="text-sm font-semibold text-primary">{value || '—'}</p>
    </div>
  )
}

function DatosTab({ vecino }) {
  const [showAviso, setShowAviso] = useState(false)
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-sora text-lg font-bold text-primary sm:text-xl">Mis datos</h2>
        <p className="text-sm text-primary-500">
          Información personal registrada en la Comisión Municipal.
        </p>
      </div>

      <div className="card p-4 sm:p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
          Datos personales
        </h3>
        <div className="mt-2">
          <DatoRow label="Nombre completo" value={nombreVecino(vecino)} />
          <DatoRow label="DNI" value={vecino.dni} />
          <DatoRow
            label="Fecha de nacimiento"
            value={vecino.fecha_nac ? dateOf(vecino.fecha_nac) : null}
          />
          <DatoRow label="Sexo" value={vecino.sexo} />
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
          Datos de contacto
        </h3>
        <div className="mt-2">
          <DatoRow label="Teléfono" value={vecino.telefono} />
          <DatoRow label="Email" value={vecino.email} />
          <DatoRow label="Dirección" value={vecino.direccion} />
          <DatoRow label="Localidad / Barrio" value={vecino.barrio || vecino.localidad} />
        </div>
      </div>

      <div className="card p-4 sm:p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
          Datos de salud
        </h3>
        <p className="mt-1 text-xs text-primary-500">
          Solo lectura — los actualiza el equipo de la Sala Primeros Auxilios.
        </p>
        <div className="mt-2">
          <DatoRow label="Grupo sanguíneo" value={null} />
          <DatoRow label="Alergias" value={null} />
        </div>
        <p className="mt-3 text-xs italic text-primary-400">
          Estos campos se cargan en la primera consulta clínica.
        </p>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowAviso(true)}
          className="btn-secondary"
        >
          Solicitar actualización de datos
        </button>
      </div>

      <Modal
        open={showAviso}
        onClose={() => setShowAviso(false)}
        title="Actualización de datos"
        size="sm"
        footer={
          <button onClick={() => setShowAviso(false)} className="btn-primary">
            Entendido
          </button>
        }
      >
        <p className="text-sm text-primary-700">
          Para corregir o actualizar tus datos personales,{' '}
          <strong className="font-semibold text-primary">presentate en Administración con tu DNI</strong>.
          El equipo de la Comisión va a registrar los cambios en el momento.
        </p>
        <p className="mt-3 text-sm text-primary-500">
          Horario de atención: Lunes a Viernes 7:00 – 13:00.
        </p>
      </Modal>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// D) Mis reclamos — denuncias del vecino
// ─────────────────────────────────────────────────────────────────

const ESTADO_RECLAMO_LABEL = {
  abierto:    'Abierto',
  en_proceso: 'En proceso',
  resuelto:   'Resuelto',
  cerrado:    'Cerrado',
  rechazado:  'Rechazado',
}

// Colores por estado: azul OK / gold / navy / gris (cero verde).
const ESTADO_RECLAMO_CLASS = {
  abierto:    'inline-flex items-center rounded-full bg-ok-50 px-2.5 py-0.5 text-xs font-semibold text-ok-700 ring-1 ring-inset ring-ok-100',
  en_proceso: 'inline-flex items-center rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-100',
  resuelto:   'inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-700 ring-1 ring-inset ring-primary-200',
  cerrado:    'inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200',
  rechazado:  'inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200',
}

const PRIORIDAD_BADGE = {
  alta:    'inline-flex items-center rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-800 ring-1 ring-inset ring-accent-200',
  urgente: 'inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger ring-1 ring-inset ring-red-200',
}

function truncate(text, max = 60) {
  const s = (text ?? '').trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

function ReclamosTab({ vecino, reclamos, isLoading, error }) {
  const navigate = useNavigate()

  // Restricción: solo auth_mode === 'supabase' puede ver reclamos
  if (vecino?.auth_mode !== 'supabase') {
    return (
      <section className="space-y-4">
        <div>
          <h2 className="font-sora text-lg font-bold text-primary sm:text-xl">Mis reclamos</h2>
          <p className="text-sm text-primary-500">
            Denuncias y reclamos que registraste en el municipio.
          </p>
        </div>

        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Cuenta requerida
            </h3>
            <p className="mt-3 text-sm text-primary-700">
              Para acceder a tus reclamos, se requiere que tengas una cuenta registrada.
              Si entraste con acceso rápido, cerrá sesión y registrate o iniciá sesión con tu cuenta.
            </p>
            <button
              onClick={() => navigate('/portal/acceso')}
              className="btn-primary mt-6"
            >
              Ir a iniciar sesión
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sora text-lg font-bold text-primary sm:text-xl">Mis reclamos</h2>
          <p className="text-sm text-primary-500">
            Denuncias y reclamos que registraste en el municipio.
          </p>
        </div>
        <Link to="/portal/reclamos/nuevo" className="btn-accent shrink-0">
          + Nuevo reclamo
        </Link>
      </div>

      {isLoading && (
        <div className="card flex items-center justify-center p-8">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          No pudimos cargar tus reclamos. Probá de nuevo.
        </div>
      )}

      {!isLoading && !error && reclamos.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-primary-500">
            No tenés reclamos registrados.
          </p>
        </div>
      )}

      {!isLoading && !error && reclamos.length > 0 && (
        <div className="card overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {reclamos.map(r => {
              const estadoCls = ESTADO_RECLAMO_CLASS[r.estado]
                ?? ESTADO_RECLAMO_CLASS.abierto
              const prioridadCls = PRIORIDAD_BADGE[r.prioridad] ?? null
              return (
                <li key={r.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-primary-400">
                        {dateOf(r.created_at)}
                      </p>
                      {r.tipo && (
                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-accent-700">
                          {r.tipo}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-primary-700 sm:text-base">
                        {truncate(r.descripcion, 60)}
                      </p>
                      {r.ubicacion && (
                        <p className="mt-0.5 text-xs text-primary-400">📍 {r.ubicacion}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={estadoCls}>
                        {ESTADO_RECLAMO_LABEL[r.estado] ?? r.estado}
                      </span>
                      {prioridadCls && (
                        <span className={prioridadCls}>{r.prioridad}</span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// E) Polideportivo — reservas deportivas del Polideportivo Municipal
// ─────────────────────────────────────────────────────────────────

const ESTADO_RESERVA_CLASS = {
  pendiente:  'inline-flex items-center gap-1 rounded-full bg-accent/20 px-3 py-1 text-xs font-semibold text-accent-800',
  confirmado: 'inline-flex items-center gap-1 rounded-full bg-ok/20 px-3 py-1 text-xs font-semibold text-ok-800',
  cancelado:  'inline-flex items-center gap-1 rounded-full bg-danger/20 px-3 py-1 text-xs font-semibold text-danger-800',
  atendido:   'inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary',
}

const ESTADO_RESERVA_LABEL = {
  pendiente:  '⏳ Pendiente',
  confirmado: '✅ Confirmado',
  cancelado:  '❌ Cancelado',
  atendido:   '✔️ Completado',
}

function ReservasTab({ vecino, reservas, isLoading, error }) {
  const navigate = useNavigate()

  // Guard: requiere cuenta completa (no acceso rápido)
  if (vecino.auth_mode !== 'supabase') {
    return (
      <section className="space-y-4">
        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Cuenta completa requerida
            </h3>
            <p className="mt-3 text-sm text-primary-700">
              El acceso rápido (DNI + teléfono) no permite gestionar reservas.
              Para acceder a tus reservas, cerrá sesión y registrate o iniciá sesión con tu cuenta.
            </p>
            <button
              onClick={() => navigate('/portal/acceso')}
              className="btn-primary mt-6"
            >
              Ir a iniciar sesión
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sora text-lg font-bold text-primary sm:text-xl">Polideportivo</h2>
          <p className="text-sm text-primary-500">
            Historial de reservas del Polideportivo Municipal.
          </p>
        </div>
        <Link to="/portal/polideportivo/reservar" className="btn-accent shrink-0">
          + Nueva reserva
        </Link>
      </div>

      {isLoading && (
        <div className="card flex items-center justify-center p-8">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          No pudimos cargar tus reservas. Probá de nuevo.
        </div>
      )}

      {!isLoading && !error && reservas.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-primary-500">
            No tenés reservas registradas todavía.
          </p>
        </div>
      )}

      {!isLoading && !error && reservas.length > 0 && (
        <div className="space-y-3">
          {reservas.map(r => (
            <div key={r.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-primary sm:text-base">
                      {dateOf(r.fecha)}
                    </p>
                    <span className="text-xs text-primary-500 sm:text-sm">
                      {timeOf(r.hora_inicio)} - {timeOf(r.hora_fin)}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-primary-600 sm:text-sm">
                    {r.espacio?.nombre && (
                      <p>
                        <span className="font-medium">Espacio:</span> {r.espacio.nombre}
                      </p>
                    )}
                    {r.motivo && (
                      <p>
                        <span className="font-medium">Actividad:</span> {r.motivo}
                      </p>
                    )}
                    {r.observaciones && (
                      <p>
                        <span className="font-medium">Observaciones:</span> {r.observaciones}
                      </p>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  <span className={ESTADO_RESERVA_CLASS[r.estado] ?? ESTADO_RESERVA_CLASS.pendiente}>
                    {ESTADO_RESERVA_LABEL[r.estado] ?? r.estado}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// F) Mi familia — turnos sacados para familiares
// ─────────────────────────────────────────────────────────────────

function FamiliaTab({ turnos, isLoading, error }) {
  const familiares = useMemo(
    () => turnos.filter(t => t.metadata?.para_familiar),
    [turnos],
  )

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-sora text-lg font-bold text-primary sm:text-xl">Mi familia</h2>
        <p className="text-sm text-primary-500">
          Turnos que sacaste para otros miembros de tu familia.
        </p>
      </div>

      {isLoading && (
        <div className="card flex items-center justify-center p-8">
          <Spinner size="lg" />
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          No pudimos cargar tu información. Probá de nuevo.
        </div>
      )}

      {!isLoading && !error && familiares.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-primary-500">
            Todavía no sacaste turnos para familiares.
          </p>
          <Link to="/portal/turno" className="btn-accent mt-4 inline-flex">
            + Sacar turno para un familiar
          </Link>
        </div>
      )}

      {!isLoading && !error && familiares.length > 0 && (
        <div className="card overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {familiares.map(t => {
              const meta = t.metadata
              const vinculo = VINCULO_LABEL[meta.vinculo] ?? meta.vinculo ?? 'Familiar'
              const dep = t.dependencia?.nombre ?? '—'
              return (
                <li key={t.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-primary sm:text-base">
                        {meta.familiar_nombre || 'Familiar'}
                      </p>
                      <p className="mt-0.5 text-xs text-primary-500 sm:text-sm">
                        {vinculo}
                        {meta.familiar_edad ? ` · ${meta.familiar_edad} años` : ''}
                        {meta.familiar_dni ? ` · DNI ${meta.familiar_dni}` : ''}
                      </p>
                    </div>
                    <span className={ESTADO_CLASS[t.estado] ?? 'estado-pendiente'}>
                      {ESTADO_LABEL[t.estado] ?? t.estado}
                    </span>
                  </div>
                  <p className="text-xs text-primary-400">
                    {dateTimeOf(t.fecha_hora)} · {dep}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function VecinoDashboard() {
  const navigate = useNavigate()
  const { vecinoSession, clearVecinoSession, authLoading } = useVecino()
  const [tab, setTab] = useState('turnos')

  // DEBUG: Log inicial del componente
  console.log('[VecinoDashboard] RENDER', {
    vecinoSession,
    hasSession: !!vecinoSession,
    vecinoId: vecinoSession?.id,
    authMode: vecinoSession?.auth_mode,
    authLoading,
    tab
  })

  // Los hooks van siempre antes del early return — los queries
  // están enabled solo si hay sesión, así que no disparan red
  // cuando el guard todavía no redirigió.
  //
  // IMPORTANTE: VecinoDashboard es para vecinos con auth_mode='supabase'
  // (cuenta completa, con sesión auth real). Usamos el cliente autenticado
  // `supabase` en vez de `supabaseAnon` para que las RLS con
  // current_vecino_id() funcionen correctamente.
  //
  // El parámetro `ready = !authLoading` evita que las queries se disparen
  // mientras restoreAuthSession() todavía está inicializando la sesión.
  const ready = !authLoading
  const turnosQ = useTurnosVecino(vecinoSession?.id, supabase, ready)
  const atencionesQ = useAtencionesVecino(vecinoSession?.id, supabase, ready)
  const reclamosQ = useReclamosVecino(vecinoSession?.id, supabase, ready)
  const reservasQ = useReservasVecino(vecinoSession?.id)

  // DEBUG: Log estado de queries
  console.log('[VecinoDashboard] QUERIES', {
    turnos: { isLoading: turnosQ.isLoading, error: turnosQ.error, dataLength: turnosQ.data?.length },
    atenciones: { isLoading: atencionesQ.isLoading, error: atencionesQ.error, dataLength: atencionesQ.data?.length },
    reclamos: { isLoading: reclamosQ.isLoading, error: reclamosQ.error, dataLength: reclamosQ.data?.length },
    reservas: { isLoading: reservasQ.isLoading, error: reservasQ.error, dataLength: reservasQ.data?.length }
  })

  function handleSignOut() {
    clearVecinoSession()
    navigate('/portal', { replace: true })
  }

  // El guard ya redirige si no hay sesión, pero por defensiva
  // chequeamos antes de renderizar UI que asume el vecino existe.
  if (!vecinoSession) return null

  return (
    <div className="min-h-svh bg-background">
      <DashboardHeader vecino={vecinoSession} onSignOut={handleSignOut} />

      <Tabs active={tab} onChange={setTab} />

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
        {tab === 'turnos' && (
          <TurnosTab
            turnos={turnosQ.data ?? []}
            isLoading={turnosQ.isLoading}
            error={turnosQ.error}
          />
        )}
        {tab === 'salud' && (
          <SaludTab
            vecino={vecinoSession}
            atenciones={atencionesQ.data ?? []}
            isLoading={atencionesQ.isLoading}
            error={atencionesQ.error}
          />
        )}
        {tab === 'datos'    && <DatosTab vecino={vecinoSession} />}
        {tab === 'reclamos' && (
          <ReclamosTab
            vecino={vecinoSession}
            reclamos={reclamosQ.data ?? []}
            isLoading={reclamosQ.isLoading}
            error={reclamosQ.error}
          />
        )}
        {tab === 'reservas' && (
          <ReservasTab
            vecino={vecinoSession}
            reservas={reservasQ.data ?? []}
            isLoading={reservasQ.isLoading}
            error={reservasQ.error}
          />
        )}
        {tab === 'familia'  && (
          <FamiliaTab
            turnos={turnosQ.data ?? []}
            isLoading={turnosQ.isLoading}
            error={turnosQ.error}
          />
        )}
      </main>
    </div>
  )
}
