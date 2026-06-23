import { useState, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { usePortalMunicipioId, useDatosMunicipio } from '../../hooks/useConfigPortal'
import { useAgendaPublica } from '../../hooks/useAgendaPublica'
import { useCrearTurnoAgenda } from '../../hooks/useTurnosAgenda'
import { useVecino } from '../../context/VecinoContext'
import { supabase } from '../../lib/supabase'
import Spinner from '../../components/ui/Spinner'

const TIPO_ICON_SVG = {
  medico: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14"/>
      <circle cx="12" cy="12" r="10"/>
    </svg>
  ),
  taller: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
    </svg>
  ),
  asesoria: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"/>
    </svg>
  ),
  evento: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
    </svg>
  ),
  otro: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
      <circle cx="12" cy="12" r="10"/><path strokeLinecap="round" d="M12 8v4m0 4h.01"/>
    </svg>
  ),
}

const TIPO_COLOR = {
  medico:   '#1D4ED8',
  taller:   '#7C3AED',
  asesoria: '#C9A84C',
  evento:   '#059669',
  otro:     '#64748B',
}

const TIPO_LABEL = {
  medico: 'Médico', taller: 'Taller', asesoria: 'Asesoría', evento: 'Evento', otro: 'Otro'
}

const HORA_INICIO = 7
const HORA_FIN = 20

function horaToMinutos(h) {
  const [hh, mm] = h.split(':').map(Number)
  return hh * 60 + mm
}

function formatHora(h) {
  return h.slice(0, 5)
}

export default function AgendaPublica() {
  const navigate = useNavigate()
  const municipioId = usePortalMunicipioId()
  const { data: muniDatos } = useDatosMunicipio(municipioId)
  const { vecino } = useVecino()

  const [vista, setVista] = useState('dia') // 'dia' | 'semana'
  const [fechaSelec, setFechaSelec] = useState(() => new Date().toISOString().split('T')[0])
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [modalEvento, setModalEvento] = useState(null)
  const [formTurno, setFormTurno] = useState({ motivo: '', orden: null })
  const [ordenPreview, setOrdenPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [turnoOk, setTurnoOk] = useState(null)
  const crearTurno = useCrearTurnoAgenda()

  // Rango de fechas según vista
  const { fechaDesde, fechaHasta, diasVista } = useMemo(() => {
    if (vista === 'dia') {
      return { fechaDesde: fechaSelec, fechaHasta: fechaSelec, diasVista: [fechaSelec] }
    }
    // Semana: lunes a viernes
    const d = new Date(fechaSelec + 'T12:00:00')
    const dow = d.getDay() === 0 ? 7 : d.getDay()
    const lunes = new Date(d); lunes.setDate(d.getDate() - dow + 1)
    const viernes = new Date(lunes); viernes.setDate(lunes.getDate() + 4)
    const fmt = x => x.toISOString().split('T')[0]
    const dias = []
    for (let i = 0; i < 5; i++) {
      const dd = new Date(lunes); dd.setDate(lunes.getDate() + i)
      dias.push(fmt(dd))
    }
    return { fechaDesde: fmt(lunes), fechaHasta: fmt(viernes), diasVista: dias }
  }, [vista, fechaSelec])

  const { data: eventos = [], isLoading } = useAgendaPublica(municipioId, fechaDesde, fechaHasta)

  const eventosFiltrados = filtroTipo === 'todos'
    ? eventos
    : eventos.filter(e => e.tipo === filtroTipo)

  const tiposPresentes = [...new Set(eventos.map(e => e.tipo))]

  // Horas del día (7 a 20)
  const horas = []
  for (let h = HORA_INICIO; h <= HORA_FIN; h++) {
    horas.push(`${String(h).padStart(2,'0')}:00`)
  }

  // Navegar día/semana
  function navegar(delta) {
    const d = new Date(fechaSelec + 'T12:00:00')
    d.setDate(d.getDate() + (vista === 'dia' ? delta : delta * 7))
    setFechaSelec(d.toISOString().split('T')[0])
  }

  function formatFechaHeader() {
    if (vista === 'dia') {
      return new Date(fechaSelec + 'T12:00:00').toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })
    }
    const d = new Date(diasVista[0] + 'T12:00:00')
    const h = new Date(diasVista[4] + 'T12:00:00')
    return `${d.toLocaleDateString('es-AR', { day:'numeric', month:'long' })} – ${h.toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })}`
  }

  // Eventos en un slot horario y fecha específica
  function eventosEnSlot(fecha, hora) {
    return eventosFiltrados.filter(ev => {
      if (ev.fecha !== fecha) return false
      const evInicio = horaToMinutos(ev.hora_inicio)
      const evFin = horaToMinutos(ev.hora_fin)
      const slotInicio = horaToMinutos(hora)
      const slotFin = slotInicio + 60
      return evInicio < slotFin && evFin > slotInicio
    })
  }

  async function handleUploadOrden(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `ordenes/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('documentos-hc').upload(path, file)
      if (error) throw error
      const { data } = supabase.storage.from('documentos-hc').getPublicUrl(path)
      setOrdenPreview(file.name)
      setFormTurno(p => ({ ...p, orden: { url: data.publicUrl, nombre: file.name } }))
    } catch(e) { alert('Error al subir: ' + e.message) }
    finally { setUploading(false) }
  }

  async function handleSacarTurno() {
    setError('')
    if (!vecino) { navigate('/mi-cuenta/acceso?redirect=/portal/agenda'); return }
    if (!formTurno.motivo.trim()) { setError('Ingresá el motivo'); return }
    if (modalEvento?.profesional?.requiere_orden && !formTurno.orden) {
      setError('Este especialista requiere orden médica.')
      return
    }
    try {
      const turno = await crearTurno.mutateAsync({
        municipio_id:        municipioId,
        dependencia_id:      modalEvento.dependencia_id ?? null,
        profesional_id:      modalEvento.profesional_id ?? null,
        vecino_id:           vecino.id,
        fecha:               modalEvento.fecha,
        hora_inicio:         modalEvento.hora_inicio,
        hora_fin:            modalEvento.hora_fin,
        motivo:              formTurno.motivo,
        orden_medica_url:    formTurno.orden?.url ?? null,
        orden_medica_nombre: formTurno.orden?.nombre ?? null,
      })
      setTurnoOk(turno)
      setModalEvento(null)
    } catch(e) { setError(e.message) }
  }

  const muniNombre = muniDatos?.nombre || 'Comisión Municipal'
  const hoy = new Date().toISOString().split('T')[0]

  return (
    <div className="min-h-svh bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-primary-900 bg-primary text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/portal" className="flex items-center gap-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-primary font-bold text-sm shrink-0">
              {muniNombre.charAt(0)}
            </div>
            <div className="leading-tight">
              <p className="font-sora text-sm font-bold">{muniNombre}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">Agenda pública</p>
            </div>
          </Link>
          <Link to="/portal" className="inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white hover:bg-white/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6"/>
            </svg>
            Volver
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* Banner turno creado */}
        {turnoOk && (
          <div className="mb-5 rounded-2xl border border-[#1D4ED8]/30 bg-[#1D4ED8]/5 p-5 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#1D4ED8]/10">
              <svg viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2.5" className="h-6 w-6">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <p className="font-sora font-bold text-primary">¡Turno solicitado!</p>
            <p className="mt-1 text-sm text-primary-500">
              {turnoOk.hora_inicio} del {new Date(turnoOk.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' })}
            </p>
            <button onClick={() => setTurnoOk(null)} className="btn-secondary mt-3 text-xs">Ver más</button>
          </div>
        )}

        {/* Controles */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-sora text-xl font-bold text-primary">Agenda de servicios</h1>
            <p className="text-xs text-primary-400">Actividades, profesionales y eventos de la comunidad</p>
          </div>
          {/* Toggle vista */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[{ v:'dia', label:'Día' }, { v:'semana', label:'Semana' }].map(o => (
              <button key={o.v} type="button" onClick={() => setVista(o.v)}
                className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                  vista === o.v ? 'bg-primary text-white' : 'bg-white text-primary-500 hover:bg-primary-50'
                }`}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filtros tipo */}
        <div className="mb-3 flex flex-wrap gap-2">
          <button onClick={() => setFiltroTipo('todos')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
              filtroTipo === 'todos' ? 'bg-primary text-white' : 'bg-white border border-border text-primary-500'
            }`}>
            Todos
          </button>
          {tiposPresentes.map(t => (
            <button key={t} onClick={() => setFiltroTipo(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all flex items-center gap-1 ${
                filtroTipo === t ? 'text-white' : 'bg-white border border-border text-primary-500'
              }`}
              style={filtroTipo === t ? { background: TIPO_COLOR[t] } : {}}>
              <span>{t === 'medico' ? '🩺' : t === 'taller' ? '📚' : t === 'asesoria' ? '⚖️' : t === 'evento' ? '🎯' : '📌'}</span>
              {TIPO_LABEL[t] ?? t}
            </button>
          ))}
        </div>

        {/* Navegación fecha */}
        <div className="mb-4 flex items-center gap-2">
          <button onClick={() => navegar(-1)} className="rounded-md border border-border p-1.5 hover:bg-primary-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <span className="font-sora text-sm font-semibold text-primary capitalize min-w-[200px] text-center">
            {formatFechaHeader()}
          </span>
          <button onClick={() => navegar(1)} className="rounded-md border border-border p-1.5 hover:bg-primary-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
          <button onClick={() => setFechaSelec(hoy)} className="rounded-md border border-border px-3 py-1.5 text-xs text-primary-500 hover:bg-primary-50">
            Hoy
          </button>
        </div>

        {/* Calendario */}
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-white shadow-card">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-primary-50">
                  <th className="w-16 px-3 py-2 text-left text-[10px] font-semibold uppercase text-primary-400">Hora</th>
                  {diasVista.map(fecha => {
                    const d = new Date(fecha + 'T12:00:00')
                    const esHoy = fecha === hoy
                    return (
                      <th key={fecha} className={`px-2 py-2 text-center ${esHoy ? 'text-[#1D4ED8] font-bold' : 'text-primary font-semibold'}`}>
                        <div className="capitalize">{d.toLocaleDateString('es-AR', { weekday:'short' })}</div>
                        <div className={`text-[11px] ${esHoy ? 'text-[#1D4ED8]' : 'text-primary-400'}`}>{d.getDate()}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {horas.map(hora => (
                  <tr key={hora} className="hover:bg-primary-50/20 transition-colors">
                    <td className="px-3 py-1.5 text-[10px] font-mono text-primary-400 align-top">{hora}</td>
                    {diasVista.map(fecha => {
                      const evs = eventosEnSlot(fecha, hora)
                      const pasado = fecha < hoy || (fecha === hoy && parseInt(hora) < new Date().getHours())
                      return (
                        <td key={fecha} className="px-1 py-1 align-top min-w-[80px]">
                          {evs.length > 0 && (
                            <div className="space-y-0.5">
                              {evs.map(ev => {
                                const color = TIPO_COLOR[ev.tipo] ?? '#64748B'
                                const esInicio = ev.hora_inicio.slice(0,5) === hora.slice(0,5)
                                if (!esInicio) return null
                                return (
                                  <button key={ev.id} type="button"
                                    onClick={() => { setModalEvento(ev); setFormTurno({ motivo:'', orden:null }); setOrdenPreview(null); setError('') }}
                                    className="w-full rounded-lg px-2 py-1.5 text-left transition-all hover:shadow-sm hover:opacity-90"
                                    style={{ background: `${color}12`, border: `1.5px solid ${color}40` }}>
                                    <div className="flex items-center gap-1 mb-0.5">
                                      <span style={{ color }} className="shrink-0">{TIPO_ICON_SVG[ev.tipo]}</span>
                                      <span className="text-[10px] font-bold truncate" style={{ color }}>{ev.titulo}</span>
                                    </div>
                                    <p className="text-[9px] text-primary-400">{formatHora(ev.hora_inicio)} – {formatHora(ev.hora_fin)}</p>
                                    {ev.profesional && (
                                      <p className="text-[9px] text-primary-400 truncate">{ev.profesional.nombre}</p>
                                    )}
                                    {ev.profesional?.requiere_orden && (
                                      <p className="text-[9px] mt-0.5" style={{ color }}>📋 orden requerida</p>
                                    )}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Leyenda */}
        <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-primary-400">
          {Object.entries(TIPO_LABEL).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded" style={{ background: TIPO_COLOR[k] }} />
              {k === 'medico' ? '🩺' : k === 'taller' ? '📚' : k === 'asesoria' ? '⚖️' : k === 'evento' ? '🎯' : '📌'} {v}
            </span>
          ))}
        </div>
      </main>

      {/* Modal evento */}
      {modalEvento && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="border-b border-border px-6 py-4" style={{ borderTop: `4px solid ${TIPO_COLOR[modalEvento.tipo] ?? '#64748B'}` }}>
              <div className="flex items-center gap-2">
                <span className="text-xl">{modalEvento.tipo === 'medico' ? '🩺' : modalEvento.tipo === 'taller' ? '📚' : modalEvento.tipo === 'asesoria' ? '⚖️' : modalEvento.tipo === 'evento' ? '🎯' : '📌'}</span>
                <div>
                  <h3 className="font-sora font-bold text-primary">{modalEvento.titulo}</h3>
                  <p className="text-xs text-primary-400">
                    {new Date(modalEvento.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' })} · {formatHora(modalEvento.hora_inicio)} – {formatHora(modalEvento.hora_fin)}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-6 space-y-4">
              {modalEvento.descripcion && (
                <p className="text-sm text-primary-600">{modalEvento.descripcion}</p>
              )}
              {modalEvento.profesional && (
                <div className="rounded-xl bg-primary-50 p-3">
                  <p className="text-xs font-semibold text-primary-500 uppercase tracking-wide mb-1">Profesional</p>
                  <p className="font-sora text-sm font-bold text-primary">{modalEvento.profesional.nombre}</p>
                  <p className="text-xs text-primary-500">{modalEvento.profesional.especialidad}{modalEvento.profesional.matricula ? ` · ${modalEvento.profesional.matricula}` : ''}</p>
                </div>
              )}
              {modalEvento.dependencia && (
                <p className="text-xs text-primary-400">🏛️ {modalEvento.dependencia.nombre}</p>
              )}

              {/* Solo mostrar form de turno si es médico y tiene profesional */}
              {modalEvento.tipo === 'medico' && modalEvento.profesional_id ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-sm font-semibold text-primary">Solicitar turno</p>
                  {!vecino ? (
                    <div className="rounded-xl border border-[#C9A84C]/40 bg-[#C9A84C]/10 p-3 text-sm">
                      <p className="font-semibold text-primary">Necesitás iniciar sesión para sacar turno.</p>
                      <button onClick={() => navigate('/mi-cuenta/acceso?redirect=/portal/agenda')}
                        className="mt-1 text-xs text-[#1D4ED8] font-medium hover:underline">
                        Iniciar sesión →
                      </button>
                    </div>
                  ) : (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Motivo *</label>
                        <textarea rows={2} value={formTurno.motivo}
                          onChange={e => setFormTurno(p => ({ ...p, motivo: e.target.value }))}
                          placeholder="Describí brevemente el motivo..."
                          className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
                      </div>
                      {modalEvento.profesional?.requiere_orden && (
                        <div>
                          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">
                            Orden médica <span className="text-danger">*</span>
                          </label>
                          <label className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-3 transition-colors ${
                            ordenPreview ? 'border-[#1D4ED8] bg-[#1D4ED8]/5' : 'border-border hover:border-primary-300'
                          }`}>
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={handleUploadOrden} />
                            {uploading ? <Spinner size="sm" /> : ordenPreview ? (
                              <><svg viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2" className="h-4 w-4 shrink-0"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span className="text-xs text-[#1D4ED8] truncate">{ordenPreview}</span></>
                            ) : (
                              <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-primary-400"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg><span className="text-xs text-primary">Subir orden médica (PDF/imagen)</span></>
                            )}
                          </label>
                        </div>
                      )}
                      {error && <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>}
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-xl bg-primary-50 p-3 text-xs text-primary-500 text-center">
                  Para consultas sobre este evento, acercate a la dependencia o llamá al teléfono municipal.
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t border-border px-6 py-4">
              <button onClick={() => setModalEvento(null)} className="btn-secondary flex-1">Cerrar</button>
              {modalEvento.tipo === 'medico' && modalEvento.profesional_id && vecino && (
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
