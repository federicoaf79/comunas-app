import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useTurnos, useDependencias } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useAuth } from '../../context/AuthContext'
import { shortDateOf, todayArgYMD, timeOf, ARG_OFFSET } from '../../lib/datetime'
import Avatar from '../../components/ui/Avatar'
import StatCard from '../../components/ui/StatCard'
import Spinner from '../../components/ui/Spinner'
import AdministracionTab from '../../components/admin/AdministracionTab'
import TurnoPresencialModal from '../../components/admin/TurnoPresencialModal'
import DepLandingTab from '../../components/admin/DepLandingTab'
import DepBotIATab from '../../components/admin/DepBotIATab'
import ProfesionalesTab from '../../components/admin/ProfesionalesTab'
import PlanillaImprimir from '../../components/admin/PlanillaImprimir'
import CalendarioSemanal from '../../components/admin/CalendarioSemanal'

// =============================================================
// Odontologia — módulo de gestión del Consultorio Odontológico
// Ruta: /admin/dependencia/odontologia
// Tabs: ?tab= agenda | profesionales | landing | bot_ia | admin
// =============================================================

const COLOR_ODONTOLOGIA = '#D97706'  // naranja — paleta comunas

// Etiqueta de sección activa para el breadcrumb del header.
const SECCION_LABEL = {
  agenda:         'Agenda',
  profesionales:  'Profesionales',
  administracion: 'Administración',
}

function vecinoLabel(t) {
  const v = t.vecino
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

const ESTADO_DIA = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
  reservado:  'estado-pendiente',
  atendido:   'estado-atendido',
  ausente:    'estado-cancelado',
}

// Lunes 00:00 local de la semana que contiene `date`.
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

export default function Odontologia() {
  const navigate = useNavigate()
  const { perfil, hasRole } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  const esDirector  = hasRole(['admin_comuna', 'superadmin'])
  const canApprove  = esDirector
  const canCreate   = hasRole(['admin_comuna', 'superadmin', 'subadmin', 'usuario_sub'])

  // Lectura del ?tab= desde URL
  const [searchParams] = useSearchParams()
  const tabRequested = searchParams.get('tab')

  const { data: dependencias = [], isLoading: loadingDeps } = useDependencias(municipioId)
  const depOdonto = useMemo(
    () => dependencias.find(d => d.tipo === 'odontologia' || d.slug === 'consultorio-odontologico'),
    [dependencias]
  )

  // Early returns para tabs especiales
  if (tabRequested === 'landing' && depOdonto) {
    return <DepLandingTab dependenciaId={depOdonto.id} />
  }
  if (tabRequested === 'bot_ia' && depOdonto) {
    return <DepBotIATab dependenciaId={depOdonto.id} />
  }
  if (tabRequested === 'profesionales' && depOdonto) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="font-sora text-2xl font-bold text-primary">
            Profesionales · Consultorio Odontológico
          </h1>
          <p className="mt-1 text-sm text-primary-500">
            Configurá los odontólogos que atienden, sus horarios y especialidades.
          </p>
        </header>
        <ProfesionalesTab
          municipioId={municipioId}
          dependenciaId={depOdonto.id}
          defaultEspecialidad="odontologia"
        />
      </div>
    )
  }

  // Gestionar qué sección se muestra: agenda o administración
  const seccion = tabRequested === 'admin' || tabRequested === 'administracion'
    ? 'administracion'
    : 'agenda'

  const [semanaInicio, setSemanaInicio] = useState(() => startOfWeekMonday(new Date()))
  const [modalTurno, setModalTurno]     = useState(false)
  const qc = useQueryClient()

  // Turnos de la semana actual
  const fechaDesde = ymdLocal(semanaInicio)
  const fechaHasta = ymdLocal(addDays(semanaInicio, 6))
  const { data: turnosRaw = [], isLoading: loadingTurnos } = useTurnos(
    { dependenciaId: depOdonto?.id, fechaFrom: fechaDesde, fechaTo: fechaHasta },
    { municipioIdOverride: municipioId },
  )

  // turnos_agenda no tiene columna fecha_hora — solo fecha + hora_inicio
  // por separado. Se combinan acá (mismo fix que CicSalud.jsx); antes se
  // leía t.fecha_hora directo, que siempre era undefined.
  const turnos = useMemo(() => turnosRaw.filter(Boolean).map(t => ({
    ...t,
    fecha_hora: t.fecha && t.hora_inicio ? `${t.fecha}T${t.hora_inicio}${ARG_OFFSET}` : undefined,
  })), [turnosRaw])
  const hoy = todayArgYMD()

  // Métricas del día
  const turnosHoy = useMemo(() => {
    return turnos.filter(t => {
      if (!t.fecha_hora) return false
      const tDate = ymdLocal(new Date(t.fecha_hora))
      return tDate === hoy
    })
  }, [turnos, hoy])

  const turnosPendientes = turnosHoy.filter(t => ['pendiente', 'reservado'].includes(t.estado)).length
  const turnosConfirmados = turnosHoy.filter(t => t.estado === 'confirmado').length
  const turnosAtendidos = turnosHoy.filter(t => ['atendido', 'completado'].includes(t.estado)).length
  const turnosCancelados = turnosHoy.filter(t => ['cancelado', 'ausente'].includes(t.estado)).length

  // Calendario semanal
  const eventosCalendario = useMemo(() => {
    return turnos.map(t => {
      const v = t.vecino
      const label = v
        ? (v.apellido && v.nombre ? `${v.apellido}, ${v.nombre}` : v.nombre_completo || v.apellido || v.nombre || 'Sin nombre')
        : 'Sin vecino'
      return {
        id:          t.id,
        fecha_hora:  t.fecha_hora,
        title:       label,
        dni:         v?.dni || '',
        telefono:    v?.telefono || '',
        estado:      t.estado,
        motivo:      t.motivo || '',
        color:       COLOR_ODONTOLOGIA,
        tipo:        'turno_odonto',
      }
    })
  }, [turnos])

  if (loadingDeps) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!depOdonto) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="font-sora text-2xl font-bold text-primary">
            Consultorio Odontológico
          </h1>
        </header>
        <div className="card p-10 text-center">
          <p className="font-sora text-lg font-semibold text-primary">
            No encontramos la dependencia Consultorio Odontológico
          </p>
          <p className="mt-2 text-sm text-primary-500">
            Configurala desde Gestión → Dependencias
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1">
          <h1 className="font-sora text-2xl font-bold text-primary">
            Consultorio Odontológico
            {seccion !== 'agenda' && ` · ${SECCION_LABEL[seccion] ?? ''}`}
          </h1>
          <p className="mt-1 text-sm text-primary-500">
            {seccion === 'agenda'
              ? 'Agenda semanal de turnos odontológicos'
              : 'Gestión administrativa y financiera'}
          </p>
        </div>
      </header>

      {seccion === 'administracion' && depOdonto && (
        <AdministracionTab
          dependenciaId={depOdonto.id}
          dependenciaNombre={depOdonto.nombre}
          municipioId={municipioId}
          canApprove={canApprove}
          canCreate={canCreate}
        />
      )}

      {seccion === 'agenda' && (
        <>
          {/* Métricas del día */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Pendientes"
              value={turnosPendientes}
              icon={(
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <circle cx="12" cy="12" r="10" />
                  <path strokeLinecap="round" d="M12 6v6l4 2" />
                </svg>
              )}
              color="blue"
            />
            <StatCard
              label="Confirmados"
              value={turnosConfirmados}
              icon={(
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              color="blue"
            />
            <StatCard
              label="Atendidos hoy"
              value={turnosAtendidos}
              icon={(
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              color="blue"
            />
            <StatCard
              label="Cancelados / Ausentes"
              value={turnosCancelados}
              icon={(
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              color="gray"
            />
          </div>

          {/* Calendario semanal */}
          <div className="card p-4 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-sora text-lg font-bold text-primary">
                Agenda semanal
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSemanaInicio(s => addDays(s, -7))}
                  className="btn-secondary px-3 py-2 text-sm"
                  aria-label="Semana anterior"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setSemanaInicio(startOfWeekMonday(new Date()))}
                  className="btn-secondary px-3 py-2 text-sm"
                >
                  Hoy
                </button>
                <button
                  onClick={() => setSemanaInicio(s => addDays(s, 7))}
                  className="btn-secondary px-3 py-2 text-sm"
                  aria-label="Semana siguiente"
                >
                  Siguiente →
                </button>
                <button
                  onClick={() => setModalTurno(true)}
                  className="btn-primary px-3 py-2 text-sm"
                >
                  + Nuevo turno
                </button>
                <PlanillaImprimir
                  fecha={hoy}
                  dependenciaId={depOdonto.id}
                  municipioId={municipioId}
                  dependenciaNombre="Consultorio Odontológico"
                  subtitulo={null}
                />
              </div>
            </div>

            {loadingTurnos ? (
              <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
              </div>
            ) : (
              <CalendarioSemanal
                semanaInicio={semanaInicio}
                eventos={eventosCalendario}
                onEventClick={ev => {
                  if (ev.tipo === 'turno_odonto') {
                    navigate(`/admin/atencion/${ev.id}`)
                  }
                }}
              />
            )}
          </div>
        </>
      )}

      {modalTurno && depOdonto && (
        <TurnoPresencialModal
          open
          onClose={() => setModalTurno(false)}
          dependencia={depOdonto}
          onCreated={() => {
            setModalTurno(false)
            qc.invalidateQueries({ queryKey: ['turnos'] })
          }}
        />
      )}
    </div>
  )
}
