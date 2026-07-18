// src/pages/portal/ReservarPolideportivo.jsx
// Formulario de reserva del Polideportivo Municipal (solo para vecinos con cuenta)

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'
import { TABS } from './VecinoDashboard'
import {
  useEspaciosDeportivos,
  usePolideportivoHorario,
  useReservasEspacio,
  useCrearReservaDeportiva,
  useReservasVecino,
} from '../../hooks/useReservasDeportivas'
import { useDependenciaPublica } from '../../hooks/useDependenciaPublica'
import DashboardHeader from '../../components/portal/DashboardHeader'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import Select from '../../components/ui/Select'
import { todayArgYMD, dateOf, timeOf } from '../../lib/datetime'

const DEPORTES_PREDEFINIDOS = [
  'Fútbol salón',
  'Básquet',
  'Vóley',
  'Otro',
]

export default function ReservarPolideportivo() {
  const navigate = useNavigate()
  const { vecinoSession, clearVecinoSession, municipioId } = useVecino()

  function handleSignOut() {
    clearVecinoSession()
    navigate('/portal', { replace: true })
  }

  // AUTH GUARD: requiere cuenta supabase (email/password)
  if (!vecinoSession) {
    return (
      <div className="container max-w-2xl py-6 sm:py-10">
        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Inicio de sesión requerido
            </h3>
            <p className="mt-2 text-sm text-primary-600">
              Para reservar canchas necesitás ingresar con tu cuenta.
            </p>
            <Button
              onClick={() => navigate('/portal/login')}
              className="mt-4"
            >
              Iniciar sesión
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (vecinoSession.auth_mode !== 'supabase') {
    return (
      <div className="container max-w-2xl py-6 sm:py-10">
        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Cuenta completa requerida
            </h3>
            <p className="mt-2 text-sm text-primary-600">
              Para reservar canchas necesitás crear una cuenta completa con email y contraseña.
              El acceso rápido (DNI + teléfono) no permite hacer reservas.
            </p>
            <Button
              onClick={() => navigate('/register')}
              className="mt-4"
            >
              Crear cuenta
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // QUERIES
  const { data: depPolideportivo, isLoading: loadingDep } = useDependenciaPublica(
    municipioId,
    'polideportivo'
  )
  const { data: espacios = [], isLoading: loadingEspacios } = useEspaciosDeportivos(municipioId)
  const { data: horarioConfig, isLoading: loadingHorario } = usePolideportivoHorario(municipioId)
  const { data: misReservas = [], isLoading: loadingMisReservas } = useReservasVecino(vecinoSession.id)

  // STATE
  const [espacioId, setEspacioId] = useState('')
  const [fecha, setFecha] = useState(todayArgYMD())
  const [horaInicio, setHoraInicio] = useState('')
  const [horaFin, setHoraFin] = useState('')
  const [deporte, setDeporte] = useState('')
  const [deporteOtro, setDeporteOtro] = useState('')
  const [observaciones, setObservaciones] = useState('')

  // Query de reservas existentes para mostrar disponibilidad
  const { data: reservasDelDia = [] } = useReservasEspacio(
    espacioId || espacios[0]?.id,
    fecha,
    { enabled: !!(espacioId || espacios[0]) && !!fecha }
  )

  // MUTATION
  const crearReserva = useCrearReservaDeportiva()

  // Auto-seleccionar primer espacio disponible
  useEffect(() => {
    if (espacios.length > 0 && !espacioId) {
      setEspacioId(espacios[0].id)
    }
  }, [espacios, espacioId])

  // Validación de horario contra configuración
  const erroresHorario = useMemo(() => {
    const errores = []
    if (!horarioConfig) return errores

    const { apertura, cierre } = horarioConfig
    if (horaInicio && horaInicio < apertura) {
      errores.push(`El horario abre a las ${apertura}`)
    }
    if (horaFin && horaFin > cierre) {
      errores.push(`El horario cierra a las ${cierre}`)
    }
    if (horaInicio && horaFin && horaFin <= horaInicio) {
      errores.push('La hora de fin debe ser posterior a la de inicio')
    }
    return errores
  }, [horaInicio, horaFin, horarioConfig])

  // Verificar solapamiento client-side (feedback inmediato)
  const hayConflicto = useMemo(() => {
    if (!horaInicio || !horaFin) return false
    return reservasDelDia.some(r =>
      horaInicio < r.hora_fin && r.hora_inicio < horaFin
    )
  }, [horaInicio, horaFin, reservasDelDia])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (erroresHorario.length > 0) {
      alert(erroresHorario[0])
      return
    }

    if (hayConflicto) {
      alert('Ese horario ya está reservado. Por favor elegí otro horario.')
      return
    }

    try {
      await crearReserva.mutateAsync({
        municipio_id: municipioId,
        dependencia_id: depPolideportivo.id,
        espacio_id: espacioId,
        vecino_id: vecinoSession.id,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        deporte: deporte === 'Otro' ? deporteOtro : deporte,
        observaciones,
        horarioConfig, // Para validación client-side adicional
      })

      alert('✅ Reserva creada exitosamente. Estado: Pendiente de confirmación.')
      navigate('/portal/mi-cuenta?tab=reservas')
    } catch (err) {
      alert(`❌ Error: ${err.message}`)
    }
  }

  if (loadingDep || loadingEspacios || loadingHorario) {
    return (
      <div className="container max-w-2xl py-10">
        <Spinner />
      </div>
    )
  }

  if (!depPolideportivo || espacios.length === 0) {
    return (
      <div className="container max-w-2xl py-10">
        <div className="card p-8 text-center">
          <p className="text-sm text-primary-500">
            El Polideportivo no está disponible en este momento.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader vecino={vecinoSession} onSignOut={handleSignOut} subtitle="Reservar cancha" menuItems={TABS} />

      <div className="container max-w-3xl py-6 sm:py-10">
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate('/portal/mi-cuenta?tab=reservas')}
            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-ok"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Volver a mis reservas
          </button>
          <h1 className="font-sora text-2xl font-bold text-primary sm:text-3xl">
            Reservar Cancha
          </h1>
          <p className="mt-1 text-sm text-primary-500">
            {depPolideportivo.nombre} — Completá el formulario para solicitar tu reserva
          </p>
        </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Formulario */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            {/* Espacio */}
            {espacios.length > 1 && (
              <div>
                <label className="mb-1 block text-sm font-medium text-primary">
                  Espacio deportivo
                </label>
                <Select
                  value={espacioId}
                  onChange={e => setEspacioId(e.target.value)}
                  required
                >
                  {espacios.map(e => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </Select>
              </div>
            )}

            {/* Fecha */}
            <div>
              <label className="mb-1 block text-sm font-medium text-primary">
                Fecha <span className="text-danger">*</span>
              </label>
              <input
                type="date"
                value={fecha}
                onChange={e => setFecha(e.target.value)}
                min={todayArgYMD()}
                className="input w-full"
                required
              />
            </div>

            {/* Horarios */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-primary">
                  Hora inicio <span className="text-danger">*</span>
                </label>
                <input
                  type="time"
                  value={horaInicio}
                  onChange={e => setHoraInicio(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-primary">
                  Hora fin <span className="text-danger">*</span>
                </label>
                <input
                  type="time"
                  value={horaFin}
                  onChange={e => setHoraFin(e.target.value)}
                  className="input w-full"
                  required
                />
              </div>
            </div>

            {/* Alertas de horario */}
            {erroresHorario.length > 0 && (
              <div className="rounded border border-danger bg-danger/10 p-3 text-sm text-danger">
                {erroresHorario[0]}
              </div>
            )}
            {hayConflicto && (
              <div className="rounded border border-danger bg-danger/10 p-3 text-sm text-danger">
                ⚠️ Ese horario ya está reservado. Elegí otro horario.
              </div>
            )}

            {/* Deporte */}
            <div>
              <label className="mb-1 block text-sm font-medium text-primary">
                Actividad deportiva <span className="text-danger">*</span>
              </label>
              <Select
                value={deporte}
                onChange={e => setDeporte(e.target.value)}
                required
              >
                <option value="">-- Seleccioná --</option>
                {DEPORTES_PREDEFINIDOS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </Select>
            </div>

            {deporte === 'Otro' && (
              <div>
                <label className="mb-1 block text-sm font-medium text-primary">
                  Especificar actividad
                </label>
                <input
                  type="text"
                  value={deporteOtro}
                  onChange={e => setDeporteOtro(e.target.value)}
                  className="input w-full"
                  placeholder="Ej: Handball, gimnasia, etc."
                  required
                />
              </div>
            )}

            {/* Observaciones */}
            <div>
              <label className="mb-1 block text-sm font-medium text-primary">
                Observaciones (opcional)
              </label>
              <textarea
                value={observaciones}
                onChange={e => setObservaciones(e.target.value)}
                className="input w-full"
                rows={3}
                placeholder="Información adicional sobre la reserva..."
              />
            </div>

            {/* Botón */}
            <Button
              type="submit"
              disabled={crearReserva.isPending || erroresHorario.length > 0 || hayConflicto}
              className="w-full"
            >
              {crearReserva.isPending ? 'Creando reserva...' : 'Solicitar Reserva'}
            </Button>
          </form>
        </div>

        {/* Sidebar: Info y disponibilidad */}
        <div className="space-y-4">
          {/* Horarios del polideportivo */}
          <div className="card p-4">
            <h3 className="font-sora text-sm font-semibold text-primary">
              Horarios
            </h3>
            <p className="mt-2 text-sm text-primary-600">
              {horarioConfig?.apertura} a {horarioConfig?.cierre}
            </p>
          </div>

          {/* Reservas del día seleccionado */}
          {reservasDelDia.length > 0 && (
            <div className="card p-4">
              <h3 className="font-sora text-sm font-semibold text-primary">
                Reservas del {dateOf(fecha)}
              </h3>
              <ul className="mt-3 space-y-2">
                {reservasDelDia.map(r => (
                  <li key={r.id} className="text-xs text-primary-600">
                    🔒 {timeOf(r.hora_inicio)} - {timeOf(r.hora_fin)}
                    <span className="ml-1 text-primary-400">
                      ({r.motivo || 'Ocupado'})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mis reservas recientes */}
          {!loadingMisReservas && misReservas.length > 0 && (
            <div className="card p-4">
              <h3 className="font-sora text-sm font-semibold text-primary">
                Mis reservas
              </h3>
              <ul className="mt-3 space-y-2">
                {misReservas.slice(0, 3).map(r => (
                  <li key={r.id} className="text-xs">
                    <div className="font-medium text-primary">
                      {dateOf(r.fecha)} · {timeOf(r.hora_inicio)}-{timeOf(r.hora_fin)}
                    </div>
                    <div className="text-primary-500">
                      {r.estado === 'pendiente' && '⏳ Pendiente'}
                      {r.estado === 'confirmado' && '✅ Confirmado'}
                      {r.estado === 'cancelado' && '❌ Cancelado'}
                    </div>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate('/portal/mi-cuenta?tab=reservas')}
                className="mt-3 w-full"
              >
                Ver todas
              </Button>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
