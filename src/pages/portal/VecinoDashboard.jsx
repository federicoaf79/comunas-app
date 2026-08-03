import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'
import { useTurnosVecino, useAtencionesVecino, useDocumentosAtencion, useReclamosVecino, useOrdenesDerivacionVecino, fetchDocumentoSignedUrl } from '../../hooks/useVecinoData'
import { useAccesosProveedorVecino } from '../../hooks/useProveedorVecino'
import { useReservasVecino } from '../../hooks/useReservasDeportivas'
import { useSolicitudesVecino } from '../../hooks/useSolicitudesDesarrollo'
import { supabase } from '../../lib/supabase'
import DashboardHeader from '../../components/portal/DashboardHeader'
import Spinner from '../../components/ui/Spinner'
import Modal   from '../../components/ui/Modal'
import FotoFirmada from '../../components/ui/FotoFirmada'
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

export const TABS = [
  { key: 'turnos',     label: 'Mis turnos',              short: 'Turnos' },
  { key: 'salud',      label: 'Mi salud',                short: 'Salud' },
  { key: 'datos',      label: 'Mis datos',               short: 'Datos' },
  { key: 'reclamos',   label: 'Mis reclamos',            short: 'Reclamos' },
  { key: 'vales',      label: 'Mis vales',               short: 'Vales' },
  { key: 'reservas',   label: 'Poli',                    short: 'Poli' },
  { key: 'familia',    label: 'Mi familia',              short: 'Familia' },
  { key: 'desarrollo', label: 'Agencia de Desarrollo',   short: 'Agencia' },
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
  const [openingId, setOpeningId] = useState(null)

  if (isLoading) return <Spinner size="sm" />
  if (!documentos || documentos.length === 0) return null

  const TIPOS_ICONO = {
    receta:       '📋',
    estudio:      '🔬',
    orden_medica: '🏥',
    otro:         '📄',
  }

  async function handleAbrir(d) {
    setOpeningId(d.id)
    // Pestaña abierta YA, dentro del gesto de click — esperar la firma
    // async antes de abrir pierde el "user activation" y Chrome bloquea
    // el window.open() como popup en silencio. Sin `noopener`: con
    // noopener window.open() devuelve null y no hay nada que navegar.
    const tab = window.open('', '_blank')
    try {
      const url = await fetchDocumentoSignedUrl(d.storage_path, supabase)
      if (url && tab) tab.location.href = url
      else tab?.close()
    } catch (e) {
      tab?.close()
      console.error('[AtencionDocumentos] signed url error:', e)
    } finally {
      setOpeningId(null)
    }
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {documentos.map(d => (
        <button
          key={d.id}
          type="button"
          onClick={() => handleAbrir(d)}
          disabled={openingId === d.id}
          className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-100 transition-colors hover:bg-accent-100 disabled:opacity-50"
          title={d.nombre || 'Ver documento'}
        >
          <span aria-hidden="true">{TIPOS_ICONO[d.tipo] ?? '📄'}</span>
          {openingId === d.id ? 'Abriendo…' : d.nombre_archivo}
        </button>
      ))}
    </div>
  )
}

function SaludTab({ vecino, atenciones, isLoading, error, derivaciones, derivacionesLoading }) {
  const navigate = useNavigate()
  const [carpetaActiva, setCarpetaActiva] = useState(null)

  // Agrupar atenciones por dependencia
  const carpetas = useMemo(() => {
    if (!atenciones || atenciones.length === 0) return []

    const grupos = atenciones.reduce((acc, a) => {
      const depId = a.dependencia_id || '__sin_dep__'
      const depNombre = a.dependencia_nombre || 'Sin dependencia'
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

      {/* Derivaciones — internas (Médico General del CIC) y físicas.
          Las pendientes de usar (turno_id null) tienen CTA directo a
          sacar el turno con el especialista. */}
      {!derivacionesLoading && derivaciones?.length > 0 && (
        <div>
          <h3 className="font-sora text-base font-bold text-primary">Mis derivaciones</h3>
          <p className="mt-0.5 text-xs text-primary-500">
            Derivaciones a especialistas — usá las que todavía no reservaste.
          </p>
          <div className="mt-2 space-y-3">
            {derivaciones.map(d => {
              const yaUsada = !!d.turno_id
              const depNombre = d.dependencia_destino?.nombre || ''
              return (
                <div key={d.id} className={'card p-4' + (yaUsada ? '' : ' border-accent-200')}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      {d.especialidad_destino && (
                        <p className="text-sm font-semibold text-primary">
                          {d.especialidad_destino}
                        </p>
                      )}
                      {depNombre && <p className="mt-0.5 text-xs text-primary-400">{depNombre}</p>}
                    </div>
                    <span
                      className={
                        'inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ' +
                        (yaUsada
                          ? 'bg-primary-50 text-primary-600 ring-primary-200'
                          : 'bg-ok-50 text-ok-700 ring-ok-100')
                      }
                    >
                      {yaUsada ? 'Ya reservada' : 'Disponible'}
                    </span>
                  </div>
                  {yaUsada ? (
                    <p className="mt-2 text-xs text-primary-500">
                      Ya usaste esta derivación para reservar un turno.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate(
                        `/portal/turno?dep=${encodeURIComponent(depNombre)}&esp=${encodeURIComponent(d.especialidad_destino ?? '')}&requiere_orden=true`
                      )}
                      className="btn-primary mt-3 px-3 py-1.5 text-xs"
                    >
                      Reservar turno con el especialista →
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

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
                          {dateTimeOf(a.fecha_hora)}
                          {a.profesional_nombre ? ` · ${a.profesional_nombre}` : ''}
                          {a.profesional_especialidad?.trim() ? ` (${a.profesional_especialidad.trim()})` : ''}
                        </p>
                      </div>
                    </div>

                    {(a.diagnostico?.trim() || a.tratamiento?.trim() || a.indicaciones?.trim()) && (
                      <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                        {a.diagnostico?.trim() && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Diagnóstico</p>
                            <p className="mt-1 text-primary-700">{a.diagnostico}</p>
                          </div>
                        )}
                        {a.tratamiento?.trim() && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Tratamiento</p>
                            <p className="mt-1 text-primary-700">{a.tratamiento}</p>
                          </div>
                        )}
                        {a.indicaciones?.trim() && (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-primary-400">Indicaciones</p>
                            <p className="mt-1 text-primary-700">{a.indicaciones}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {a.proxima_consulta && (
                      <p className="mt-2 text-xs text-primary-500">
                        Próxima consulta sugerida: {dateOf(a.proxima_consulta)}
                      </p>
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

// Colores por estado: azul OK / gold / navy / gris (cero verde).
const ESTADO_BADGES = {
  pendiente:   { bg: 'bg-[#0F1C35]', text: 'text-white', ring: 'ring-[#0F1C35]/20', label: 'Pendiente' },
  en_proceso:  { bg: 'bg-[#1D4ED8]', text: 'text-white', ring: 'ring-blue-200', label: 'En proceso' },
  resuelto:    { bg: 'bg-[#1e40af]', text: 'text-white', ring: 'ring-blue-300', label: 'Resuelto' },
  abierto:     { bg: 'bg-[#0F1C35]', text: 'text-white', ring: 'ring-[#0F1C35]/20', label: 'Abierto' },
  cerrado:     { bg: 'bg-slate-500', text: 'text-white', ring: 'ring-slate-200', label: 'Cerrado' },
  rechazado:   { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-200', label: 'Rechazado' },
}

const TIPO_LABELS_RECLAMO = {
  escombros:    'Escombros',
  ramas:        'Ramas y poda',
  restos_poda:  'Residuo de gran tamaño',
  otro:         'Otro',
}

function truncate(text, max = 60) {
  const s = (text ?? '').trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

// ReclamoCard/ReclamoDetalleModal — traídos de MisReclamosPortal.jsx
// (la vista que sí mostraba fotos, pero a la que nada en la UI
// enlazaba: los 3 navigate() de NuevoReclamoPortal.jsx y el tab bar
// de este dashboard apuntaban siempre acá, a la versión sin fotos).
// /portal/reclamos quedó como redirect a este tab (ver App.jsx).
function ReclamoCard({ reclamo, onClick }) {
  const badge = ESTADO_BADGES[reclamo.estado] || ESTADO_BADGES.pendiente
  const tipoLabel = TIPO_LABELS_RECLAMO[reclamo.tipo] || reclamo.tipo

  const fechaFormateada = new Date(reclamo.created_at).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const primeraFoto = reclamo.fotos_urls?.[0]

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl border border-border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md"
    >
      <div className="flex gap-4">
        {primeraFoto ? (
          <FotoFirmada
            bucket="reclamos"
            path={primeraFoto}
            alt="Foto del reclamo"
            wrapperClassName="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border"
            imgClassName="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-border bg-primary-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8 text-primary-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ring-1 ring-inset ${badge.bg} ${badge.text} ${badge.ring}`}>
              {badge.label}
            </span>
            <span className="text-xs text-primary-500">{fechaFormateada}</span>
          </div>
          <p className="mb-1 text-sm font-semibold text-primary">{tipoLabel}</p>
          <p className="mb-2 text-xs text-primary-600">{reclamo.ubicacion}</p>
          <p className="line-clamp-2 text-xs text-primary-500">{truncate(reclamo.descripcion, 120)}</p>
        </div>
      </div>
    </button>
  )
}

function ReclamoDetalleModal({ reclamo, onClose }) {
  if (!reclamo) return null

  const badge = ESTADO_BADGES[reclamo.estado] || ESTADO_BADGES.pendiente
  const tipoLabel = TIPO_LABELS_RECLAMO[reclamo.tipo] || reclamo.tipo

  const fechaFormateada = new Date(reclamo.created_at).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/50 px-4 py-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-sora text-lg font-bold text-primary">Detalle del reclamo</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-primary-400 transition-colors hover:bg-primary-50 hover:text-primary"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide ring-1 ring-inset ${badge.bg} ${badge.text} ${badge.ring}`}>
              {badge.label}
            </span>
            <span className="text-sm text-primary-600 capitalize">{fechaFormateada}</span>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Tipo</p>
            <p className="mt-1 text-base font-semibold text-primary">{tipoLabel}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Dirección</p>
            <p className="mt-1 text-base text-primary-700">{reclamo.ubicacion}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Descripción</p>
            <p className="mt-1 text-sm text-primary-700 whitespace-pre-wrap">{reclamo.descripcion}</p>
          </div>

          {reclamo.fotos_urls && reclamo.fotos_urls.length > 0 && (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary-500">Fotos</p>
              <div className="grid grid-cols-2 gap-3">
                {reclamo.fotos_urls.map((path, idx) => (
                  <FotoFirmada
                    key={idx}
                    bucket="reclamos"
                    path={path}
                    alt={`Foto ${idx + 1}`}
                    linkify
                    wrapperClassName="group relative aspect-square overflow-hidden rounded-lg border border-border"
                    imgClassName="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-border bg-white px-6 py-2.5 font-sora text-sm font-semibold text-primary transition-colors hover:bg-primary-50 sm:w-auto"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

// Entrada simple hacia /portal/mis-vales (Vales Electrónicos, Fase 2)
// -- mismo criterio que "+ Nuevo reclamo" dentro de ReclamosTab: el
// listado real y la lógica de apertura/QR viven en su propia página,
// acá solo hay un punto de entrada consistente con el resto del tab bar.
function ValesTab({ vecino }) {
  const navigate = useNavigate()
  // Entrada a "Proveedor" (Fase 3) SOLO si el vecino tiene al menos
  // un acceso activo a un comercio -- un vecino común no debe verla.
  const accesosQ = useAccesosProveedorVecino(vecino?.id)
  const tieneComercio = (accesosQ.data ?? []).length > 0

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-sora text-lg font-bold text-primary sm:text-xl">Mis vales</h2>
        <p className="text-sm text-primary-500">
          Vales electrónicos que te emitió la Comisión Municipal.
        </p>
      </div>
      <div className="card flex flex-col items-center gap-3 p-8 text-center sm:p-10">
        <div className="text-4xl">🎫</div>
        <p className="text-sm text-primary-500">
          Vas a poder ver el estado de cada vale y generar el código para
          canjearlo en el comercio.
        </p>
        <button
          onClick={() => navigate('/portal/mis-vales')}
          className="btn-accent"
        >
          Ver mis vales →
        </button>
      </div>

      {tieneComercio && (
        <div className="card flex flex-col items-center gap-3 p-8 text-center sm:p-10">
          <div className="text-4xl">🏪</div>
          <h3 className="font-sora text-base font-bold text-primary">¿Tenés un comercio adherido?</h3>
          <p className="text-sm text-primary-500">
            Entrá para canjear los vales que te presenten los vecinos.
          </p>
          <button
            onClick={() => navigate('/portal/proveedor')}
            className="btn-accent"
          >
            Ir a Proveedor →
          </button>
        </div>
      )}
    </section>
  )
}

function ReclamosTab({ vecino, reclamos, isLoading, error }) {
  const navigate = useNavigate()
  const [reclamoSeleccionado, setReclamoSeleccionado] = useState(null)

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
        <div className="space-y-3">
          {reclamos.map(r => (
            <ReclamoCard
              key={r.id}
              reclamo={r}
              onClick={() => setReclamoSeleccionado(r)}
            />
          ))}
        </div>
      )}

      {reclamoSeleccionado && (
        <ReclamoDetalleModal
          reclamo={reclamoSeleccionado}
          onClose={() => setReclamoSeleccionado(null)}
        />
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
                    {r.notas_vecino && (
                      <p>
                        <span className="font-medium">Observaciones:</span> {r.notas_vecino}
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
// G) Agencia de Desarrollo — solicitudes de servicios rurales
// ─────────────────────────────────────────────────────────────────

function DesarrolloTab({ vecino, solicitudes, isLoading, error }) {
  const navigate = useNavigate()

  // Guard: requiere cuenta completa (mismo que Reclamos)
  if (vecino?.auth_mode !== 'supabase') {
    return (
      <section className="space-y-4">
        <div>
          <h2 className="font-sora text-lg font-bold text-primary sm:text-xl">Agencia de Desarrollo</h2>
          <p className="text-sm text-primary-500">
            Solicitudes de servicios rurales que registraste.
          </p>
        </div>

        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Cuenta requerida
            </h3>
            <p className="mt-3 text-sm text-primary-700">
              Para acceder a tus solicitudes de la Agencia de Desarrollo, se requiere que tengas una cuenta registrada.
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
          <h2 className="font-sora text-lg font-bold text-primary sm:text-xl">Mis solicitudes</h2>
          <p className="text-sm text-primary-500">
            Solicitudes de servicios rurales que registraste.
          </p>
        </div>
        <Link to="/portal/desarrollo/solicitar" className="btn-accent shrink-0">
          + Nueva solicitud
        </Link>
      </div>

      {isLoading && (
        <div className="card flex items-center justify-center p-8">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          No pudimos cargar tus solicitudes. Probá de nuevo.
        </div>
      )}

      {!isLoading && !error && solicitudes.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-sm text-primary-500">
            No tenés solicitudes registradas.
          </p>
        </div>
      )}

      {!isLoading && !error && solicitudes.length > 0 && (
        <div className="card overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {solicitudes.map(s => {
              // Mapear estados a etiquetas/clases de VecinoDashboard
              const estadoLabel = s.estado === 'pendiente' ? 'En lista de espera'
                : s.estado === 'confirmado' ? 'Aprobado'
                : s.estado === 'atendido' ? 'Realizado'
                : s.estado === 'cancelado' ? 'Dado de baja'
                : ESTADO_LABEL[s.estado] ?? s.estado

              const estadoCls = ESTADO_CLASS[s.estado] ?? 'estado-pendiente'

              return (
                <li key={s.id} className="space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-primary-400">
                        {dateOf(s.created_at)}
                      </p>
                      {s.motivo && (
                        <p className="mt-1 text-xs font-bold uppercase tracking-wide text-accent-700">
                          {s.motivo}
                        </p>
                      )}
                      {s.fecha && (
                        <p className="mt-1 text-sm text-primary-700 sm:text-base">
                          Fecha preferida: {dateOf(s.fecha)}
                        </p>
                      )}
                      {s.notas_vecino && (
                        <p className="mt-1 text-sm text-primary-700">
                          {truncate(s.notas_vecino, 60)}
                        </p>
                      )}
                    </div>
                    <span className={estadoCls}>
                      {estadoLabel}
                    </span>
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
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function VecinoDashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { vecinoSession, clearVecinoSession, authLoading } = useVecino()

  // Leer tab desde query param, default 'turnos'
  const tab = searchParams.get('tab') || 'turnos'

  function setTab(newTab) {
    setSearchParams({ tab: newTab })
  }

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
  const derivacionesQ = useOrdenesDerivacionVecino(vecinoSession?.id, supabase, ready)
  const reclamosQ = useReclamosVecino(vecinoSession?.id, supabase, ready)
  const reservasQ = useReservasVecino(vecinoSession?.id)
  const solicitudesQ = useSolicitudesVecino(vecinoSession?.id, { enabled: ready })

  function handleSignOut() {
    clearVecinoSession()
    navigate('/portal', { replace: true })
  }

  // El guard ya redirige si no hay sesión, pero por defensiva
  // chequeamos antes de renderizar UI que asume el vecino existe.
  if (!vecinoSession) return null

  return (
    <div className="min-h-svh bg-background">
      <DashboardHeader vecino={vecinoSession} onSignOut={handleSignOut} menuItems={TABS} />

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
            derivaciones={derivacionesQ.data ?? []}
            derivacionesLoading={derivacionesQ.isLoading}
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
        {tab === 'vales' && <ValesTab vecino={vecinoSession} />}
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
        {tab === 'desarrollo' && (
          <DesarrolloTab
            vecino={vecinoSession}
            solicitudes={solicitudesQ.data ?? []}
            isLoading={solicitudesQ.isLoading}
            error={solicitudesQ.error}
          />
        )}
      </main>
    </div>
  )
}
