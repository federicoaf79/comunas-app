import { useState, useMemo } from 'react'
import { useProfesionales } from '../../hooks/useProfesionales'
import { useTurnosAgendaDependencia, useUpdateEstadoTurnoAgenda, getSemanaActual, getDiasSemana, generarSlots } from '../../hooks/useTurnosAgenda'
import Spinner from '../ui/Spinner'

const ESTADO_CLS = {
  pendiente:  'bg-[#C9A84C]/20 text-[#92400E] border-[#C9A84C]',
  confirmado: 'bg-[#1D4ED8]/10 text-[#1D4ED8] border-[#1D4ED8]',
  cancelado:  'bg-red-50 text-danger border-red-200',
  atendido:   'bg-primary-50 text-primary-400 border-border line-through',
}

const ESPEC_COLOR = {
  general:     '#1D4ED8',
  obstetra:    '#7C3AED',
  ecografia:   '#0891B2',
  pediatria:   '#059669',
  odontologia: '#D97706',
  posta_rural: '#B45309',
  otro:        '#64748B',
}

export default function AgendaPublicaAdmin({ dependenciaId, municipioId }) {
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [profSelec, setProfSelec] = useState('todos')
  const [turnoDetalle, setTurnoDetalle] = useState(null)

  const { desde, hasta, lunes } = getSemanaActual(semanaOffset)
  const dias = getDiasSemana(desde)

  const { data: profesionales = [], isLoading: profLoading } = useProfesionales(municipioId, dependenciaId)
  const { data: turnos = [], isLoading: turnosLoading } = useTurnosAgendaDependencia(dependenciaId, desde, hasta)
  const updateEstado = useUpdateEstadoTurnoAgenda()

  const profActivos = profesionales.filter(p => p.activo)

  // Profesionales filtrados
  const profFiltrados = profSelec === 'todos' ? profActivos : profActivos.filter(p => p.id === profSelec)

  // Rango de horas de la semana (para construir la grilla)
  const horasRange = useMemo(() => {
    const horas = new Set()
    profFiltrados.forEach(p => {
      if (!p.hora_desde || !p.hora_hasta) return
      const dur = p.duracion_turno_min ?? 30
      const [hd, md] = p.hora_desde.split(':').map(Number)
      const [hh, mh] = p.hora_hasta.split(':').map(Number)
      let cur = hd * 60 + md
      const fin = hh * 60 + mh
      while (cur + dur <= fin) {
        horas.add(`${String(Math.floor(cur/60)).padStart(2,'0')}:${String(cur%60).padStart(2,'0')}`)
        cur += dur
      }
    })
    return [...horas].sort()
  }, [profFiltrados])

  function turnosEnSlot(profId, fecha, hora) {
    return turnos.filter(t =>
      t.profesional_id === profId &&
      t.fecha === fecha &&
      t.hora_inicio === hora &&
      t.estado !== 'cancelado'
    )
  }

  function nombreCorto(t) {
    const v = t.vecino
    if (!v) return 'Vecino'
    return v.apellido ? `${v.apellido}, ${v.nombre ?? ''}`.trim() : v.nombre_completo ?? 'Vecino'
  }

  if (profLoading) return <div className="flex justify-center py-10"><Spinner size="lg" /></div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => setSemanaOffset(v => v - 1)}
            className="rounded-md border border-border p-1.5 hover:bg-primary-50 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-sora text-sm font-semibold text-primary min-w-[160px] text-center">
            {new Date(desde + 'T12:00:00').toLocaleDateString('es-AR', { day:'numeric', month:'long' })}
            {' – '}
            {new Date(hasta + 'T12:00:00').toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })}
          </span>
          <button onClick={() => setSemanaOffset(v => v + 1)}
            className="rounded-md border border-border p-1.5 hover:bg-primary-50 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button onClick={() => setSemanaOffset(0)}
            className="ml-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-primary-50 transition-colors text-primary-500">
            Hoy
          </button>
        </div>

        {/* Filtro por profesional */}
        <select value={profSelec} onChange={e => setProfSelec(e.target.value)}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent">
          <option value="todos">Todos los profesionales</option>
          {profActivos.map(p => (
            <option key={p.id} value={p.id}>{p.nombre}</option>
          ))}
        </select>
      </div>

      {/* Leyenda de profesionales */}
      {profSelec === 'todos' && (
        <div className="flex flex-wrap gap-2">
          {profActivos.map(p => (
            <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
              style={{ borderColor: ESPEC_COLOR[p.especialidad] ?? '#64748B', color: ESPEC_COLOR[p.especialidad] ?? '#64748B' }}>
              <span className="h-2 w-2 rounded-full" style={{ background: ESPEC_COLOR[p.especialidad] ?? '#64748B' }} />
              {p.nombre}
            </span>
          ))}
        </div>
      )}

      {/* Grilla del calendario */}
      {turnosLoading ? (
        <div className="flex justify-center py-10"><Spinner size="lg" /></div>
      ) : profFiltrados.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-primary-400">No hay profesionales activos. Agregá uno desde el tab Profesionales.</p>
        </div>
      ) : horasRange.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-primary-400">Los profesionales no tienen horarios definidos. Editá cada profesional para agregar sus horarios.</p>
        </div>
      ) : (
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
              {horasRange.map(hora => (
                <tr key={hora} className="hover:bg-primary-50/30 transition-colors">
                  <td className="px-3 py-1.5 text-[10px] font-mono text-primary-400 whitespace-nowrap">{hora}</td>
                  {dias.map(d => {
                    const celdas = profFiltrados.flatMap(p => {
                      const slots = generarSlots(p, d.fecha, turnos.filter(t => t.profesional_id === p.id && t.fecha === d.fecha))
                      const slot = slots.find(s => s.hora_inicio === hora)
                      if (!slot) return []
                      const turnosSlot = turnosEnSlot(p.id, d.fecha, hora)
                      return [{ prof: p, slot, turnosSlot }]
                    })

                    if (celdas.length === 0) {
                      return <td key={d.fecha} className="px-1 py-1" />
                    }

                    return (
                      <td key={d.fecha} className="px-1 py-1 align-top">
                        <div className="space-y-0.5">
                          {celdas.map(({ prof, slot, turnosSlot }) => (
                            <div key={prof.id}>
                              {/* Slot disponible */}
                              {slot.disponibles > 0 && turnosSlot.length === 0 && (
                                <div className="rounded px-1.5 py-1 text-center"
                                  style={{ background: `${ESPEC_COLOR[prof.especialidad] ?? '#64748B'}15`, border: `1px solid ${ESPEC_COLOR[prof.especialidad] ?? '#64748B'}40` }}>
                                  <span className="text-[10px]" style={{ color: ESPEC_COLOR[prof.especialidad] ?? '#64748B' }}>
                                    {slot.disponibles} libre{slot.disponibles > 1 ? 's' : ''}
                                  </span>
                                </div>
                              )}
                              {/* Turnos ocupados */}
                              {turnosSlot.map(t => (
                                <button key={t.id} type="button" onClick={() => setTurnoDetalle(t)}
                                  className={`w-full rounded border px-1.5 py-1 text-left transition-all hover:opacity-80 ${ESTADO_CLS[t.estado] ?? ''}`}>
                                  <p className="truncate font-medium leading-tight">{nombreCorto(t)}</p>
                                  {profSelec === 'todos' && (
                                    <p className="truncate text-[9px] opacity-70">{prof.nombre.split(' ')[0]}</p>
                                  )}
                                </button>
                              ))}
                              {/* Slot lleno sin turnos mostrados */}
                              {slot.lleno && turnosSlot.length === 0 && (
                                <div className="rounded border border-red-100 bg-red-50 px-1.5 py-1 text-center">
                                  <span className="text-[10px] text-danger">Completo</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal detalle turno */}
      {turnoDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="font-sora font-semibold text-primary">Detalle del turno</h3>
              <button onClick={() => setTurnoDetalle(null)} className="rounded-md p-1.5 text-primary-400 hover:bg-primary-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-primary-400 uppercase tracking-wide">Vecino</p>
                  <p className="font-medium text-primary">{nombreCorto(turnoDetalle)}</p>
                  {turnoDetalle.vecino?.dni && <p className="text-xs text-primary-500">DNI {turnoDetalle.vecino.dni}</p>}
                  {turnoDetalle.vecino?.telefono && <p className="text-xs text-primary-500">{turnoDetalle.vecino.telefono}</p>}
                </div>
                <div>
                  <p className="text-xs text-primary-400 uppercase tracking-wide">Profesional</p>
                  <p className="font-medium text-primary">{turnoDetalle.profesional?.nombre}</p>
                  <p className="text-xs text-primary-500">{turnoDetalle.profesional?.especialidad}</p>
                </div>
                <div>
                  <p className="text-xs text-primary-400 uppercase tracking-wide">Fecha y hora</p>
                  <p className="font-medium text-primary">
                    {new Date(turnoDetalle.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long' })}
                  </p>
                  <p className="text-xs text-primary-500">{turnoDetalle.hora_inicio} – {turnoDetalle.hora_fin}</p>
                </div>
                <div>
                  <p className="text-xs text-primary-400 uppercase tracking-wide">Estado</p>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold border ${ESTADO_CLS[turnoDetalle.estado]}`}>
                    {turnoDetalle.estado}
                  </span>
                </div>
              </div>
              {turnoDetalle.motivo && (
                <div>
                  <p className="text-xs text-primary-400 uppercase tracking-wide">Motivo</p>
                  <p className="text-sm text-primary">{turnoDetalle.motivo}</p>
                </div>
              )}
              {turnoDetalle.orden_medica_url && (
                <div>
                  <p className="text-xs text-primary-400 uppercase tracking-wide mb-1">Orden médica</p>
                  <a href={turnoDetalle.orden_medica_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-primary hover:bg-primary-50">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    {turnoDetalle.orden_medica_nombre ?? 'Ver orden médica'}
                  </a>
                </div>
              )}
              {/* Acciones de estado */}
              {turnoDetalle.estado === 'pendiente' && (
                <div className="flex gap-2 pt-2">
                  <button onClick={async () => {
                    await updateEstado.mutateAsync({ id: turnoDetalle.id, estado: 'confirmado' })
                    setTurnoDetalle(null)
                  }} className="btn-primary flex-1 text-sm">
                    Confirmar turno
                  </button>
                  <button onClick={async () => {
                    if (confirm('¿Cancelar este turno?')) {
                      await updateEstado.mutateAsync({ id: turnoDetalle.id, estado: 'cancelado' })
                      setTurnoDetalle(null)
                    }
                  }} className="btn-secondary flex-1 text-sm">
                    Cancelar
                  </button>
                </div>
              )}
              {turnoDetalle.estado === 'confirmado' && (
                <button onClick={async () => {
                  await updateEstado.mutateAsync({ id: turnoDetalle.id, estado: 'atendido' })
                  setTurnoDetalle(null)
                }} className="btn-primary w-full text-sm">
                  Marcar como atendido
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
