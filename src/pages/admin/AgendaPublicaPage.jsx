import { useState } from 'react'
import { useAgendaPublica, useAgendaPublicaAdmin, useUpsertAgendaPublica, useDeleteAgendaPublica } from '../../hooks/useAgendaPublica'
import { useProfesionales } from '../../hooks/useProfesionales'
import { useDependenciasAdmin } from '../../hooks/useDependenciaPublica'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { getSemanaActual, getDiasSemana } from '../../hooks/useTurnosAgenda'
import Spinner from '../../components/ui/Spinner'

const TIPOS = [
  { value: 'medico',   label: 'Médico / Especialista', icon: '🩺' },
  { value: 'taller',   label: 'Taller',                icon: '📚' },
  { value: 'asesoria', label: 'Asesoría',              icon: '⚖️' },
  { value: 'evento',   label: 'Evento comunitario',    icon: '🎯' },
  { value: 'otro',     label: 'Otro',                  icon: '📌' },
]

const DIAS = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo']

const EMPTY = {
  titulo: '', tipo: 'medico', descripcion: '',
  recurrente: false, dias_semana: [],
  fecha_inicio: '', fecha_fin: '',
  hora_inicio: '08:00', hora_fin: '12:00',
  color: '', profesional_id: '', dependencia_id: '',
}

function EventoForm({ initial, municipioId, onClose }) {
  const [form, setForm] = useState(initial ?? EMPTY)
  const [error, setError] = useState('')
  const upsert = useUpsertAgendaPublica()
  const { data: profesionales = [] } = useProfesionales(municipioId)
  const { data: deps = [] } = useDependenciasAdmin({ municipioIdOverride: municipioId })

  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }

  function toggleDia(dia) {
    setForm(p => ({
      ...p,
      dias_semana: p.dias_semana.includes(dia)
        ? p.dias_semana.filter(d => d !== dia)
        : [...p.dias_semana, dia]
    }))
  }

  async function handleSubmit() {
    if (!form.titulo.trim()) { setError('El título es requerido'); return }
    if (form.recurrente && form.dias_semana.length === 0) { setError('Seleccioná al menos un día'); return }
    if (!form.recurrente && !form.fecha_inicio) { setError('Ingresá la fecha del evento'); return }
    setError('')
    try {
      await upsert.mutateAsync({
        ...(initial?.id ? { id: initial.id } : { municipio_id: municipioId }),
        titulo:        form.titulo,
        tipo:          form.tipo,
        descripcion:   form.descripcion || null,
        recurrente:    form.recurrente,
        dias_semana:   form.recurrente ? form.dias_semana : [],
        fecha_inicio:  form.fecha_inicio || null,
        fecha_fin:     form.fecha_fin || null,
        hora_inicio:   form.hora_inicio,
        hora_fin:      form.hora_fin,
        color:         form.color || null,
        profesional_id: form.profesional_id || null,
        dependencia_id: form.dependencia_id || null,
        activo: true,
      })
      onClose()
    } catch(e) { setError(e.message) }
  }

  const inputCls = 'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="space-y-4">
      {/* Tipo */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-primary-500">Tipo de evento</label>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {TIPOS.map(t => (
            <button key={t.value} type="button" onClick={() => set('tipo', t.value)}
              className={`rounded-lg border-2 p-2 text-center transition-all ${
                form.tipo === t.value ? 'border-[#1D4ED8] bg-[#1D4ED8]/5' : 'border-border hover:border-primary-300'
              }`}>
              <div className="text-lg">{t.icon}</div>
              <div className="mt-1 text-[10px] font-medium text-primary leading-tight">{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Título */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Título *</label>
        <input type="text" value={form.titulo} onChange={e => set('titulo', e.target.value)}
          placeholder="Ej: Consultas de cardiología · Taller de huerta · Asesoría legal gratuita"
          className={inputCls} />
      </div>

      {/* Profesional (solo para tipo médico) */}
      {form.tipo === 'medico' && (
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Profesional (opcional)</label>
          <select value={form.profesional_id} onChange={e => set('profesional_id', e.target.value)} className={inputCls}>
            <option value="">— Sin profesional asignado —</option>
            {profesionales.filter(p => p.activo).map(p => (
              <option key={p.id} value={p.id}>{p.nombre} · {p.especialidad}</option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-primary-400">Si asignás un profesional, los horarios del evento se usan para la agenda de turnos.</p>
        </div>
      )}

      {/* Dependencia */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Dependencia (opcional)</label>
        <select value={form.dependencia_id} onChange={e => set('dependencia_id', e.target.value)} className={inputCls}>
          <option value="">— Sin dependencia —</option>
          {deps.filter(d => d.activa !== false).map(d => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>
      </div>

      {/* Descripción */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Descripción</label>
        <textarea rows={2} value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
          placeholder="Información adicional para el vecino..." className={inputCls} />
      </div>

      {/* Recurrente / Puntual */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-primary-500">Frecuencia</label>
        <div className="flex gap-3">
          {[{ v: false, label: 'Evento puntual' }, { v: true, label: 'Recurrente semanal' }].map(o => (
            <button key={String(o.v)} type="button" onClick={() => set('recurrente', o.v)}
              className={`flex-1 rounded-lg border-2 py-2 text-sm font-medium transition-all ${
                form.recurrente === o.v ? 'border-[#1D4ED8] bg-[#1D4ED8]/5 text-[#1D4ED8]' : 'border-border text-primary-500'
              }`}>
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {form.recurrente ? (
        <div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-primary-500">Días de la semana</label>
          <div className="flex flex-wrap gap-2">
            {DIAS.map(dia => (
              <button key={dia} type="button" onClick={() => toggleDia(dia)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all capitalize ${
                  form.dias_semana.includes(dia) ? 'bg-[#1D4ED8] text-white' : 'bg-primary-100 text-primary-500 hover:bg-primary-200'
                }`}>
                {dia}
              </button>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Vigente desde</label>
              <input type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Vigente hasta</label>
              <input type="date" value={form.fecha_fin} onChange={e => set('fecha_fin', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Fecha *</label>
            <input type="date" value={form.fecha_inicio} onChange={e => set('fecha_inicio', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Fecha fin (opcional)</label>
            <input type="date" value={form.fecha_fin} onChange={e => set('fecha_fin', e.target.value)} className={inputCls} />
          </div>
        </div>
      )}

      {/* Horario */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Hora inicio</label>
          <input type="time" value={form.hora_inicio} onChange={e => set('hora_inicio', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Hora fin</label>
          <input type="time" value={form.hora_fin} onChange={e => set('hora_fin', e.target.value)} className={inputCls} />
        </div>
      </div>

      {error && <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>}

      <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="button" onClick={handleSubmit} disabled={upsert.isPending}
          className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {upsert.isPending && <Spinner size="sm" />}
          {initial?.id ? 'Guardar cambios' : 'Agregar evento'}
        </button>
      </div>
    </div>
  )
}

const TIPO_ICON = {
  medico:   '🩺',
  taller:   '📚',
  asesoria: '⚖️',
  evento:   '🎯',
  otro:     '📌',
}

const TIPO_COLOR = {
  medico:   '#1D4ED8',
  taller:   '#7C3AED',
  asesoria: '#C9A84C',
  evento:   '#059669',
  otro:     '#64748B',
}

export default function AgendaPublicaPage() {
  const municipioId = useEffectiveMunicipioId()
  const { data: eventos = [], isLoading } = useAgendaPublicaAdmin(municipioId)
  const deleteMut = useDeleteAgendaPublica()
  const [modal, setModal] = useState(null)
  const [vista, setVista] = useState('lista') // 'lista' | 'semana'
  const [semanaOffset, setSemanaOffset] = useState(0)
  const { desde, hasta } = getSemanaActual(semanaOffset)
  const dias = getDiasSemana(desde)
  const { data: eventosCalendario = [] } = useAgendaPublica(municipioId, desde, hasta)

  const activos   = eventos.filter(e => e.activo)
  const inactivos = eventos.filter(e => !e.activo)

  function formatFrecuencia(ev) {
    if (ev.recurrente && ev.dias_semana?.length > 0) {
      return ev.dias_semana.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(' · ')
    }
    if (ev.fecha_inicio) {
      return new Date(ev.fecha_inicio + 'T12:00:00').toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' })
    }
    return '—'
  }

  if (isLoading) return <div className="flex justify-center py-10"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-sora text-2xl font-bold text-primary">Agenda pública</h1>
          <p className="mt-1 text-sm text-primary-500">
            Eventos, profesionales visitantes y actividades que los vecinos ven en el portal.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle vista */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            {[{ v:'lista', label:'Lista' }, { v:'semana', label:'Semana' }].map(o => (
              <button key={o.v} type="button" onClick={() => setVista(o.v)}
                className={`px-4 py-1.5 text-xs font-medium transition-colors ${
                  vista === o.v ? 'bg-primary text-white' : 'bg-white text-primary-500 hover:bg-primary-50'
                }`}>
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setModal('new')} className="btn-primary flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
            Agregar evento
          </button>
        </div>
      </header>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-white">
              <h3 className="font-sora font-semibold text-primary">
                {modal === 'new' ? 'Agregar evento a la agenda' : `Editar — ${modal.titulo}`}
              </h3>
              <button type="button" onClick={() => setModal(null)}
                className="rounded-md p-1.5 text-primary-400 hover:bg-primary-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <EventoForm
                initial={modal === 'new' ? null : modal}
                municipioId={municipioId}
                onClose={() => setModal(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Vista semanal */}
      {vista === 'semana' && (
        <div className="space-y-4">
          {/* Navegación */}
          <div className="flex items-center gap-2">
            <button onClick={() => setSemanaOffset(v => v - 1)}
              className="rounded-md border border-border p-1.5 hover:bg-primary-50">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/>
              </svg>
            </button>
            <span className="font-sora text-sm font-semibold text-primary min-w-[200px] text-center">
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
            <button onClick={() => setSemanaOffset(0)}
              className="rounded-md border border-border px-3 py-1.5 text-xs text-primary-500 hover:bg-primary-50">
              Esta semana
            </button>
          </div>

          {/* Grilla semanal */}
          <div className="overflow-x-auto rounded-xl border border-border bg-white">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-primary-50">
                  <th className="w-16 px-3 py-2 text-left text-[10px] font-semibold uppercase text-primary-400">Hora</th>
                  {dias.map(d => (
                    <th key={d.fecha} className={`px-2 py-2 text-center ${d.esHoy ? 'text-[#1D4ED8] font-bold' : 'text-primary font-semibold'}`}>
                      <div>{d.nombre}</div>
                      <div className={`text-[11px] ${d.esHoy ? 'text-[#1D4ED8]' : 'text-primary-400'}`}>
                        {new Date(d.fecha + 'T12:00:00').getDate()}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Array.from({ length: 14 }, (_, i) => `${String(i + 7).padStart(2,'0')}:00`).map(hora => {
                  const horaMin = parseInt(hora) * 60
                  return (
                    <tr key={hora} className="hover:bg-primary-50/20 transition-colors">
                      <td className="px-3 py-1.5 text-[10px] font-mono text-primary-400 align-top">{hora}</td>
                      {dias.map(d => {
                        const evsSlot = eventosCalendario.filter(ev => {
                          if (ev.fecha !== d.fecha) return false
                          const evInicio = parseInt(ev.hora_inicio) * 60
                          const evFin = parseInt(ev.hora_fin) * 60
                          return evInicio < horaMin + 60 && evFin > horaMin && ev.hora_inicio.slice(0,5) === hora.slice(0,5)
                        })
                        const TIPO_COLOR_ADMIN = { medico:'#1D4ED8', taller:'#7C3AED', asesoria:'#C9A84C', evento:'#059669', otro:'#64748B' }
                        const TIPO_ICON_ADMIN = { medico:'🩺', taller:'📚', asesoria:'⚖️', evento:'🎯', otro:'📌' }
                        return (
                          <td key={d.fecha} className="px-1 py-1 align-top min-w-[100px]">
                            {evsSlot.map(ev => {
                              const color = TIPO_COLOR_ADMIN[ev.tipo] ?? '#64748B'
                              return (
                                <button key={ev.id} type="button" onClick={() => setModal(eventos.find(e => e.id === ev.id) ?? ev)}
                                  className="w-full rounded-lg px-2 py-1.5 mb-0.5 text-left hover:opacity-80 transition-opacity"
                                  style={{ background: `${color}12`, border: `1.5px solid ${color}40` }}>
                                  <div className="flex items-center gap-1">
                                    <span className="text-[11px]">{TIPO_ICON_ADMIN[ev.tipo]}</span>
                                    <span className="text-[10px] font-semibold truncate" style={{ color }}>{ev.titulo}</span>
                                  </div>
                                  <p className="text-[9px] text-primary-400">{ev.hora_inicio.slice(0,5)} – {ev.hora_fin.slice(0,5)}</p>
                                </button>
                              )
                            })}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vista lista — solo cuando vista === 'lista' */}
      {vista === 'lista' && (
        <>
      {/* Lista */}
      {activos.length === 0 && inactivos.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-3xl mb-3">📅</p>
          <p className="font-sora font-semibold text-primary">La agenda está vacía</p>
          <p className="mt-1 text-sm text-primary-400">Agregá médicos visitantes, talleres, asesorías o cualquier actividad para la comunidad.</p>
          <button type="button" onClick={() => setModal('new')} className="btn-primary mt-4">Agregar primer evento</button>
        </div>
      ) : (
        <div className="space-y-2">
          {activos.map(ev => (
            <div key={ev.id} className="card p-4 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                style={{ background: `${TIPO_COLOR[ev.tipo] ?? '#64748B'}15` }}>
                {TIPO_ICON[ev.tipo] ?? '📌'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-sora text-sm font-bold text-primary">{ev.titulo}</p>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    style={{ background: `${TIPO_COLOR[ev.tipo]}15`, color: TIPO_COLOR[ev.tipo] }}>
                    {TIPOS.find(t => t.value === ev.tipo)?.label ?? ev.tipo}
                  </span>
                  {ev.recurrente && (
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-500">Recurrente</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-primary-500">
                  📅 {formatFrecuencia(ev)} · ⏰ {ev.hora_inicio} – {ev.hora_fin}
                </p>
                {ev.profesional && (
                  <p className="mt-0.5 text-xs text-primary-400">👤 {ev.profesional.nombre} · {ev.profesional.especialidad}</p>
                )}
                {ev.dependencia && (
                  <p className="mt-0.5 text-xs text-primary-400">🏛️ {ev.dependencia.nombre}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => setModal(ev)}
                  className="rounded-md p-1.5 text-primary-400 hover:bg-primary-50 hover:text-primary">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button type="button"
                  onClick={() => { if(confirm(`¿Eliminar "${ev.titulo}"?`)) deleteMut.mutate(ev.id) }}
                  className="rounded-md p-1.5 text-primary-400 hover:bg-red-50 hover:text-danger">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
  )
}
