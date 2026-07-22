import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTurnos, useDependencias } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useAuth } from '../../context/AuthContext'
import { useProfesionales } from '../../hooks/useProfesionales'
import { shortDateOf, todayArgYMD, timeOf } from '../../lib/datetime'
import { supabase } from '../../lib/supabase'
import Avatar from '../../components/ui/Avatar'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import AdministracionTab from '../../components/admin/AdministracionTab'
import TurnoPresencialModal from '../../components/admin/TurnoPresencialModal'
import DepLandingTab from '../../components/admin/DepLandingTab'
import DepBotIATab from '../../components/admin/DepBotIATab'
import ProfesionalesTab from '../../components/admin/ProfesionalesTab'
import CalendarioSemanal from '../../components/admin/CalendarioSemanal'

const COLOR_POR_ESPECIALIDAD = {
  clinico:      '#1D4ED8',  // azul — Clínico / Medicina General
  pediatria:    '#7C3AED',  // violeta — Pediatría
  ginecologia:  '#C9A84C',  // gold — Ginecología
  cardiologia:  '#0891B2',  // celeste — Cardiología
  traumatologia: '#B45309', // tierra — Traumatología
  kinesiologia: '#059669',  // verde excepción — Kinesiología
  odontologia:  '#DC2626',  // rojo — Odontología
}
const COLOR_ESPECIALIDAD_DEFAULT = '#64748B' // slate — especialidad sin color mapeado

// Normaliza para matchear contra COLOR_POR_ESPECIALIDAD sin importar
// mayúsculas/acentos del dato real (ej. "Clínico" en vez de 'clinico').
function normalizarEspecialidad(s) {
  return (s ?? '')
    .toString()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim()
}

const ESTADO_DIA = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  pendiente_validacion: 'estado-pendiente',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
  atendido:   'estado-atendido',
  ausente:    'estado-cancelado',
}

function vecinoLabel(t) {
  const v = t.vecino
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

function startOfWeekMonday(date) {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function ymdLocal(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function CicSalud() {
  const { perfil, hasRole } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  const esDirector = hasRole(['admin_comuna', 'superadmin'])
  const canCreate = hasRole(['admin_comuna', 'superadmin', 'subadmin', 'usuario_sub'])

  const [searchParams] = useSearchParams()
  const tabRequested = searchParams.get('tab')

  // Early returns para tabs especiales
  const { data: allDeps = [] } = useDependencias(municipioId)
  const depCicSalud = useMemo(
    () => allDeps.find(d => d.tipo === 'cic_salud' && d.activa !== false),
    [allDeps]
  )

  if (tabRequested === 'landing') {
    return depCicSalud ? <DepLandingTab dependencia={depCicSalud} /> : <Spinner />
  }
  if (tabRequested === 'bot_ia') {
    return depCicSalud ? <DepBotIATab dependencia={depCicSalud} /> : <Spinner />
  }
  if (tabRequested === 'profesionales') {
    return depCicSalud ? <ProfesionalesTab dependencia={depCicSalud} /> : <Spinner />
  }
  if (tabRequested === 'admin') {
    return depCicSalud ? (
      <AdministracionTab
        dependenciaId={depCicSalud.id}
        dependenciaNombre={depCicSalud.nombre}
        municipioId={municipioId}
        canApprove={esDirector}
        canCreate={canCreate}
      />
    ) : <Spinner />
  }

  // Tab por defecto: Turnos
  return <TurnosTab depCicSalud={depCicSalud} municipioId={municipioId} canCreate={canCreate} />
}

function TurnosTab({ depCicSalud, municipioId, canCreate }) {
  const [vistaActual, setVistaActual] = useState('dia')
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => new Date())
  const [especialidadFiltro, setEspecialidadFiltro] = useState('todas')
  const [modalTurnoOpen, setModalTurnoOpen] = useState(false)
  const [validandoOrden, setValidandoOrden] = useState(null)

  const ymdSeleccionada = ymdLocal(fechaSeleccionada)
  const inicioSemana = startOfWeekMonday(fechaSeleccionada)

  const { turnos, isLoading: loadingTurnos, refetch: refetchTurnos } = useTurnos({
    dependenciaId: depCicSalud?.id,
    fecha: vistaActual === 'dia' ? ymdSeleccionada : undefined,
    fechaFrom: vistaActual === 'semana' ? ymdLocal(inicioSemana) : undefined,
    fechaTo: vistaActual === 'semana' ? ymdLocal(addDays(inicioSemana, 6)) : undefined,
  }, { municipioIdOverride: municipioId })

  // Bug previo: se llamaba useProfesionales({ dependenciaId }) pero el
  // hook espera (municipioId, dependenciaId) posicional — el objeto
  // terminaba pisando el param municipioId y la query nunca traía
  // datos reales (filtro de especialidad y color-coding silenciosamente
  // vacíos).
  const { data: profesionales = [] } = useProfesionales(municipioId, depCicSalud?.id)

  // Lista única de especialidades
  const especialidades = useMemo(() => {
    const set = new Set()
    profesionales.forEach(p => {
      if (p.especialidad) set.add(p.especialidad.toLowerCase())
    })
    return Array.from(set).sort()
  }, [profesionales])

  // Filtrar turnos por especialidad
  const turnosFiltrados = useMemo(() => {
    if (especialidadFiltro === 'todas') return turnos
    return turnos.filter(t => {
      const prof = profesionales.find(p => p.id === t.profesional_id)
      return prof?.especialidad?.toLowerCase() === especialidadFiltro
    })
  }, [turnos, especialidadFiltro, profesionales])

  async function validarOrden(turnoId) {
    setValidandoOrden(turnoId)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase
        .from('ordenes_derivacion')
        .update({
          estado: 'validada',
          validada_por: user?.id,
          validada_at: new Date().toISOString(),
        })
        .eq('turno_id', turnoId)
        .eq('estado', 'pendiente')

      await supabase
        .from('turnos_agenda')
        .update({ estado: 'confirmado' })
        .eq('id', turnoId)

      refetchTurnos()
    } catch (e) {
      console.error('[CicSalud] validarOrden error:', e)
      alert('Error al validar orden: ' + (e.message || 'Error desconocido'))
    } finally {
      setValidandoOrden(null)
    }
  }

  if (!depCicSalud) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <p className="text-primary-500">No se encontró la dependencia CIC — Servicios de Salud</p>
          <p className="mt-2 text-xs text-primary-400">Verificá que exista en la DB con tipo=cic_salud</p>
        </div>
      </div>
    )
  }

  if (vistaActual === 'semana') {
    const eventosCalendario = turnosFiltrados.map(t => {
      const prof = profesionales.find(p => p.id === t.profesional_id)
      const especialidad = normalizarEspecialidad(prof?.especialidad)
      return {
        id: t.id,
        fecha: t.fecha_hora?.split('T')[0],
        horaInicio: timeOf(t.fecha_hora),
        horaFin: t.hora_fin ? timeOf(t.hora_fin) : undefined,
        titulo: vecinoLabel(t),
        subtitulo: prof?.especialidad || 'Sin especialidad',
        color: COLOR_POR_ESPECIALIDAD[especialidad] || COLOR_ESPECIALIDAD_DEFAULT,
      }
    })

    return (
      <div className="space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-sora text-2xl font-bold text-primary">CIC — Servicios de Salud</h1>
            <p className="mt-1 text-sm text-primary-500">Vista semanal de turnos</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setVistaActual('dia')}
              className="rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary-50"
            >
              Vista día
            </button>
          </div>
        </header>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFechaSeleccionada(addDays(inicioSemana, -7))}
            className="rounded-md border border-border bg-white p-2 transition-colors hover:bg-primary-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="font-sora text-sm font-semibold text-primary">
            Semana {shortDateOf(ymdLocal(inicioSemana))} - {shortDateOf(ymdLocal(addDays(inicioSemana, 6)))}
          </span>
          <button
            onClick={() => setFechaSeleccionada(addDays(inicioSemana, 7))}
            className="rounded-md border border-border bg-white p-2 transition-colors hover:bg-primary-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            onClick={() => setFechaSeleccionada(new Date())}
            className="ml-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Hoy
          </button>
        </div>

        <CalendarioSemanal
          weekStart={inicioSemana}
          eventos={eventosCalendario}
          onEventoClick={(e) => console.log('Evento:', e)}
        />
      </div>
    )
  }

  // Vista día
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sora text-2xl font-bold text-primary">CIC — Servicios de Salud</h1>
          <p className="mt-1 text-sm text-primary-500">
            Turnos del {shortDateOf(ymdSeleccionada)}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setVistaActual('semana')}
            className="rounded-md border border-border bg-white px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary-50"
          >
            Vista semana
          </button>
          {canCreate && (
            <Button onClick={() => setModalTurnoOpen(true)}>+ Turno presencial</Button>
          )}
        </div>
      </header>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setFechaSeleccionada(addDays(fechaSeleccionada, -1))}
          className="rounded-md border border-border bg-white p-2 transition-colors hover:bg-primary-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="font-sora text-sm font-semibold text-primary">
          {shortDateOf(ymdSeleccionada)}
        </span>
        <button
          onClick={() => setFechaSeleccionada(addDays(fechaSeleccionada, 1))}
          className="rounded-md border border-border bg-white p-2 transition-colors hover:bg-primary-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          onClick={() => setFechaSeleccionada(new Date())}
          className="ml-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          Hoy
        </button>

        <select
          value={especialidadFiltro}
          onChange={e => setEspecialidadFiltro(e.target.value)}
          className="ml-auto rounded-md border border-border bg-white px-3 py-1.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        >
          <option value="todas">Todas las especialidades</option>
          {especialidades.map(esp => (
            <option key={esp} value={esp}>
              {esp.charAt(0).toUpperCase() + esp.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {loadingTurnos ? (
        <div className="flex justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : turnosFiltrados.length === 0 ? (
        <div className="rounded-xl border border-border bg-white p-8 text-center">
          <p className="text-primary-500">No hay turnos para esta fecha</p>
        </div>
      ) : (
        <div className="space-y-2">
          {turnosFiltrados.map(t => {
            const prof = profesionales.find(p => p.id === t.profesional_id)
            const tieneOrden = t.metadata?.orden_url || t.metadata?.tiene_orden
            const requiereValidacion = t.estado === 'pendiente_validacion'

            return (
              <div
                key={t.id}
                className="flex items-center gap-4 rounded-xl border border-border bg-white p-4 transition-shadow hover:shadow-md"
              >
                <Avatar nombre={vecinoLabel(t)} size="md" />
                <div className="flex-1">
                  <p className="font-sora text-sm font-semibold text-primary">{vecinoLabel(t)}</p>
                  <p className="text-xs text-primary-500">
                    {prof?.especialidad || 'Sin especialidad'} · {prof?.nombre || 'Sin profesional'}
                  </p>
                  <p className="text-xs text-primary-400">
                    {timeOf(t.fecha_hora)} {t.motivo && `· ${t.motivo}`}
                  </p>
                </div>
                {tieneOrden && (
                  <span className="rounded-full bg-accent-50 px-2 py-1 text-xs font-medium text-accent-700">
                    📄 Con orden
                  </span>
                )}
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${ESTADO_DIA[t.estado] || ''}`}>
                  {t.estado}
                </span>
                {requiereValidacion && (
                  <Button
                    size="sm"
                    onClick={() => validarOrden(t.id)}
                    loading={validandoOrden === t.id}
                  >
                    Validar orden
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {modalTurnoOpen && depCicSalud && (
        <TurnoPresencialModal
          open
          dependencia={depCicSalud}
          municipioId={municipioId}
          fecha={ymdSeleccionada}
          onClose={() => {
            setModalTurnoOpen(false)
            refetchTurnos()
          }}
        />
      )}
    </div>
  )
}
