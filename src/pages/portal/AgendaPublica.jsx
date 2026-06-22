import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortalMunicipioId, useDatosMunicipio } from '../../hooks/useConfigPortal'
import { useProfesionales } from '../../hooks/useProfesionales'
import { useTurnosAgendaDependencia, useCrearTurnoAgenda, getSemanaActual, getDiasSemana, generarSlots } from '../../hooks/useTurnosAgenda'
import { useDependencias } from '../../hooks/useTurnos'
import { useVecino } from '../../context/VecinoContext'
import { supabase } from '../../lib/supabase'
import Spinner from '../../components/ui/Spinner'

const ESPEC_COLOR = {
  general:     '#1D4ED8',
  obstetra:    '#7C3AED',
  ecografia:   '#0891B2',
  pediatria:   '#059669',
  odontologia: '#D97706',
  posta_rural: '#B45309',
  otro:        '#64748B',
}

const ESPEC_LABEL = {
  general: 'Medicina general', obstetra: 'Obstetricia',
  ecografia: 'Ecografía', pediatria: 'Pediatría',
  odontologia: 'Odontología', posta_rural: 'Posta sanitaria rural', otro: 'Otro'
}

const TIPOS_CON_AGENDA = new Set(['caps', 'salud', 'sala'])

// Componente de upload de orden médica
function OrdenMedicaUpload({ onChange }) {
  const [preview, setPreview] = useState(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `ordenes/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from('documentos-hc').upload(path, file)
      if (error) throw error
      const { data } = await supabase.storage.from('documentos-hc').getPublicUrl(path)
      setPreview(file.name)
      onChange({ url: data.publicUrl, nombre: file.name })
    } catch (e) {
      alert('Error al subir el archivo: ' + e.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">
        Orden médica <span className="text-danger">*</span>
      </label>
      <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-4 transition-colors ${
        preview ? 'border-[#1D4ED8] bg-[#1D4ED8]/5' : 'border-border hover:border-primary-300'
      }`}>
        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleFile} />
        {uploading ? (
          <><Spinner size="sm" /><span className="text-sm text-primary-500">Subiendo...</span></>
        ) : preview ? (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" className="h-5 w-5 shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span className="text-sm text-[#1D4ED8] font-medium truncate">{preview}</span>
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-primary-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
            <div>
              <p className="text-sm text-primary">Subir orden médica</p>
              <p className="text-xs text-primary-400">PDF, JPG o PNG · Máx 5MB</p>
            </div>
          </>
        )}
      </label>
      <p className="mt-1 text-[11px] text-primary-400">
        Para turnos con especialistas se requiere orden médica firmada por médico de cabecera.
      </p>
    </div>
  )
}

export default function AgendaPublica() {
  const navigate = useNavigate()
  const { data: municipioId } = usePortalMunicipioId()
  const { datos: muniDatos } = useDatosMunicipio()
  const { vecino } = useVecino()
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [filtroEspec, setFiltroEspec] = useState('todos')
  const [modalSlot, setModalSlot] = useState(null) // { prof, fecha, slot }
  const [formTurno, setFormTurno] = useState({ motivo: '', orden: null })
  const [turnoCreado, setTurnoCreado] = useState(null)
  const [error, setError] = useState('')

  const { desde, hasta } = getSemanaActual(semanaOffset)
  const dias = getDiasSemana(desde)

  // Buscar dependencia de tipo caps/salud
  const { data: deps = [] } = useDependencias(municipioId)
  const depSalud = useMemo(() =>
    deps.find(d => TIPOS_CON_AGENDA.has((d?.tipo ?? '').toLowerCase()) && d.activa !== false)
  , [deps])

  const { data: profesionales = [], isLoading: profLoading } = useProfesionales(municipioId, depSalud?.id ?? null)
  const { data: turnos = [], isLoading: turnosLoading } = useTurnosAgendaDependencia(depSalud?.id ?? null, desde, hasta)
  const crearTurno = useCrearTurnoAgenda()

  const profActivos = profesionales.filter(p => p.activo)
  const profFiltrados = filtroEspec === 'todos' ? profActivos : profActivos.filter(p => p.especialidad === filtroEspec)
  const especialidades = [...new Set(profActivos.map(p => p.especialidad))]

  // Slots de toda la semana para mostrar en la grilla
  const horasRange = useMemo(() => {
    const horas = new Set()
    profFiltrados.forEach(p => {
      if (!p.hora_desde || !p.hora_hasta) return
      const dur = p.duracion_turno_min ?? 30
      const [hd, md] = p.hora_desde.split(':').map(Number)
      const [hh, mh] = p.hora_hasta.split(':').map(Number)
      let cur = hd * 60 + md
      while (cur + dur <= hh * 60 + mh) {
        horas.add(`${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`)
        cur += dur
      }
    })
    return [...horas].sort()
  }, [profFiltrados])

  async function handleSacarTurno() {
    setError('')
    if (!vecino) {
      navigate('/mi-cuenta/acceso?redirect=/portal/agenda')
      return
    }
    if (!formTurno.motivo.trim()) { setError('Ingresá el motivo de la consulta'); return }
    const prof = modalSlot.prof
    if (prof.requiere_orden && !formTurno.orden) {
      setError('Este especialista requiere orden médica. Por favor subila antes de continuar.')
      return
    }
    try {
      const turno = await crearTurno.mutateAsync({
        municipio_id:         municipioId,
        dependencia_id:       depSalud.id,
        profesional_id:       prof.id,
        vecino_id:            vecino.id,
        fecha:                modalSlot.fecha,
        hora_inicio:          modalSlot.slot.hora_inicio,
        hora_fin:             modalSlot.slot.hora_fin,
        motivo:               formTurno.motivo,
        orden_medica_url:     formTurno.orden?.url ?? null,
        orden_medica_nombre:  formTurno.orden?.nombre ?? null,
      })
      setTurnoCreado(turno)
      setModalSlot(null)
    } catch (e) {
      setError(e.message)
    }
  }

  const muniNombre = muniDatos?.nombre || 'Comisión Municipal'

  return (
    <div className="min-h-svh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-primary-900 bg-primary text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/portal" className="flex items-center gap-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-primary font-bold text-sm">C</div>
            <div className="leading-tight">
              <p className="font-sora text-sm font-bold">{muniNombre}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">Agenda de servicios</p>
            </div>
          </Link>
          <Link to="/portal" className="inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            Volver al portal
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {/* Turno creado exitosamente */}
        {turnoCreado && (
          <div className="mb-6 rounded-2xl border border-[#1D4ED8]/30 bg-[#1D4ED8]/5 p-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#1D4ED8]/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2.5" className="h-7 w-7">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <h2 className="font-sora text-lg font-bold text-primary">¡Turno solicitado!</h2>
            <p className="mt-1 text-sm text-primary-500">
              Tu turno con <strong>{turnoCreado.profesional?.nombre}</strong> el{' '}
              <strong>{new Date(turnoCreado.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' })}</strong>{' '}
              a las <strong>{turnoCreado.hora_inicio}</strong> fue solicitado.
            </p>
            <p className="mt-1 text-xs text-primary-400">Recibirás confirmación por WhatsApp cuando sea aprobado.</p>
            <button onClick={() => setTurnoCreado(null)} className="btn-secondary mt-4 text-sm">
              Ver más turnos disponibles
            </button>
          </div>
        )}

        <div className="mb-6">
          <h1 className="font-sora text-2xl font-bold text-primary">Agenda de servicios</h1>
          <p className="mt-1 text-sm text-primary-500">
            Consultá la disponibilidad de profesionales y solicitá tu turno online.
          </p>
        </div>

        {/* Filtros */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => setFiltroEspec('todos')}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              filtroEspec === 'todos' ? 'bg-primary text-white' : 'bg-white border border-border text-primary-500 hover:border-primary-300'
            }`}>
            Todas las especialidades
          </button>
          {especialidades.map(e => (
            <button key={e} onClick={() => setFiltroEspec(e)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                filtroEspec === e ? 'text-white' : 'bg-white border border-border text-primary-500 hover:border-primary-300'
              }`}
              style={filtroEspec === e ? { background: ESPEC_COLOR[e] ?? '#64748B' } : {}}>
              {ESPEC_LABEL[e] ?? e}
            </button>
          ))}
        </div>

        {/* Navegación de semana */}
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => setSemanaOffset(v => v - 1)}
            className="rounded-md border border-border p-1.5 hover:bg-primary-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span className="font-sora text-sm font-semibold text-primary">
            {new Date(desde + 'T12:00:00').toLocaleDateString('es-AR', { day:'numeric', month:'long' })}
            {' – '}
            {new Date(hasta + 'T12:00:00').toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })}
          </span>
          <button onClick={() => setSemanaOffset(v => v + 1)}
            className="rounded-md border border-border p-1.5 hover:bg-primary-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
          <button onClick={() => setSemanaOffset(0)} className="rounded-md border border-border px-3 py-1.5 text-xs text-primary-500 hover:bg-primary-50">
            Esta semana
          </button>
        </div>

        {/* Calendario */}
        {profLoading || turnosLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : profFiltrados.length === 0 ? (
          <div className="rounded-2xl border border-border bg-white p-10 text-center">
            <p className="text-sm text-primary-400">No hay profesionales disponibles esta semana.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-card">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-primary-50">
                  <th className="w-20 px-3 py-3 text-left text-[10px] font-semibold uppercase text-primary-400">Profesional / Hora</th>
                  {dias.map(d => (
                    <th key={d.fecha} className={`px-2 py-3 text-center min-w-[80px] ${d.esHoy ? 'text-[#1D4ED8] font-bold' : 'text-primary font-semibold'}`}>
                      <div>{d.nombre}</div>
                      <div className={`text-[11px] ${d.esHoy ? 'text-[#1D4ED8]' : 'text-primary-400'}`}>
                        {new Date(d.fecha + 'T12:00:00').getDate()}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {profFiltrados.map(prof => {
                  const color = ESPEC_COLOR[prof.especialidad] ?? '#64748B'
                  const slots = generarSlots(prof, dias[0].fecha, [])
                  if (slots.length === 0) return null

                  return slots.map((slot, si) => {
                    return (
                      <tr key={`${prof.id}-${slot.hora_inicio}`} className={`border-b border-border last:border-0 ${si === 0 ? 'border-t-2' : ''}`}
                        style={si === 0 ? { borderTopColor: color } : {}}>
                        <td className="px-3 py-2 align-top">
                          {si === 0 && (
                            <div className="mb-0.5">
                              <p className="font-sora text-[11px] font-bold text-primary truncate max-w-[70px]">{prof.nombre.split(' ')[0]} {prof.nombre.split(' ')[1]?.[0]}.</p>
                              <p className="text-[9px]" style={{ color }}>{ESPEC_LABEL[prof.especialidad] ?? prof.especialidad}</p>
                            </div>
                          )}
                          <span className="text-[10px] font-mono text-primary-400">{slot.hora_inicio}</span>
                        </td>
                        {dias.map(d => {
                          const dSlots = generarSlots(prof, d.fecha, turnos.filter(t => t.profesional_id === prof.id && t.fecha === d.fecha))
                          const dSlot = dSlots.find(s => s.hora_inicio === slot.hora_inicio)

                          // Verificar si el profesional atiende este día
                          const diasProf = prof.dias_atencion ?? []
                          const nombreDia = d.nombreFull
                          const atiende = diasProf.length === 0 || diasProf.includes(nombreDia)

                          if (!atiende || !dSlot) {
                            return <td key={d.fecha} className="px-1 py-1.5 bg-primary-50/30" />
                          }

                          const pasado = d.fecha < new Date().toISOString().split('T')[0]

                          return (
                            <td key={d.fecha} className="px-1 py-1.5">
                              {dSlot.lleno || pasado ? (
                                <div className="rounded-lg border border-border bg-primary-50 px-2 py-1.5 text-center">
                                  <span className="text-[10px] text-primary-400">{pasado ? '—' : 'Completo'}</span>
                                </div>
                              ) : (
                                <button type="button"
                                  onClick={() => { setModalSlot({ prof, fecha: d.fecha, slot: dSlot }); setFormTurno({ motivo: '', orden: null }); setError('') }}
                                  className="w-full rounded-lg border px-2 py-1.5 text-center transition-all hover:shadow-sm"
                                  style={{ borderColor: `${color}40`, background: `${color}08` }}>
                                  <p className="text-[10px] font-semibold" style={{ color }}>
                                    {dSlot.disponibles} libre{dSlot.disponibles > 1 ? 's' : ''}
                                  </p>
                                  {prof.requiere_orden && (
                                    <p className="text-[9px] text-primary-400 mt-0.5">📋 orden requerida</p>
                                  )}
                                </button>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Leyenda */}
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-primary-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-[#1D4ED8]/40 bg-[#1D4ED8]/08" />
            Disponible
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded border border-border bg-primary-50" />
            Completo
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded bg-primary-50/30" />
            No atiende ese día
          </span>
        </div>
      </main>

      {/* Modal sacar turno */}
      {modalSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="border-b border-border px-6 py-4">
              <h3 className="font-sora font-semibold text-primary">Solicitar turno</h3>
              <p className="mt-0.5 text-xs text-primary-500">
                {modalSlot.prof.nombre} · {ESPEC_LABEL[modalSlot.prof.especialidad]}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-xl bg-primary-50 px-4 py-3 text-sm">
                <p className="font-semibold text-primary">
                  {new Date(modalSlot.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
                </p>
                <p className="text-primary-500">{modalSlot.slot.hora_inicio} – {modalSlot.slot.hora_fin}</p>
              </div>

              {!vecino && (
                <div className="rounded-xl border border-[#C9A84C]/40 bg-[#C9A84C]/10 p-3 text-sm text-primary-800">
                  <p className="font-semibold">Necesitás iniciar sesión para sacar turno.</p>
                  <button onClick={() => navigate('/mi-cuenta/acceso?redirect=/portal/agenda')}
                    className="mt-2 text-xs text-[#1D4ED8] font-medium hover:underline">
                    Iniciar sesión o registrarse →
                  </button>
                </div>
              )}

              {vecino && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">
                      Motivo de la consulta <span className="text-danger">*</span>
                    </label>
                    <textarea rows={3} value={formTurno.motivo}
                      onChange={e => setFormTurno(p => ({ ...p, motivo: e.target.value }))}
                      placeholder="Describí brevemente el motivo de tu consulta..."
                      className="w-full rounded-md border border-border px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
                  </div>

                  {modalSlot.prof.requiere_orden && (
                    <OrdenMedicaUpload onChange={orden => setFormTurno(p => ({ ...p, orden }))} />
                  )}

                  {error && (
                    <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-3 border-t border-border px-6 py-4">
              <button onClick={() => setModalSlot(null)} className="btn-secondary flex-1">Cancelar</button>
              {vecino && (
                <button onClick={handleSacarTurno} disabled={crearTurno.isPending}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50">
                  {crearTurno.isPending && <Spinner size="sm" />}
                  {crearTurno.isPending ? 'Solicitando...' : 'Solicitar turno'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
