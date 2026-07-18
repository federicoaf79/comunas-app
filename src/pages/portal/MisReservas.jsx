// src/pages/portal/MisReservas.jsx
// Listado de reservas deportivas del vecino logueado

import { useNavigate } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'
import { TABS } from './VecinoDashboard'
import { useReservasVecino } from '../../hooks/useReservasDeportivas'
import DashboardHeader from '../../components/portal/DashboardHeader'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { dateOf, timeOf } from '../../lib/datetime'

export default function MisReservas() {
  const navigate = useNavigate()
  const { vecinoSession, clearVecinoSession } = useVecino()

  function handleSignOut() {
    clearVecinoSession()
    navigate('/portal', { replace: true })
  }

  // AUTH GUARD
  if (!vecinoSession) {
    return (
      <div className="container mx-auto max-w-2xl py-6 sm:py-10">
        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Inicio de sesión requerido
            </h3>
            <p className="mt-2 text-sm text-primary-600">
              Para ver tus reservas necesitás ingresar con tu cuenta.
            </p>
            <Button onClick={() => navigate('/portal/login')} className="mt-4">
              Iniciar sesión
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (vecinoSession.auth_mode !== 'supabase') {
    return (
      <div className="container mx-auto max-w-2xl py-6 sm:py-10">
        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Cuenta completa requerida
            </h3>
            <p className="mt-2 text-sm text-primary-600">
              El acceso rápido (DNI + teléfono) no permite gestionar reservas.
            </p>
            <Button onClick={() => navigate('/register')} className="mt-4">
              Crear cuenta
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const { data: reservas = [], isLoading } = useReservasVecino(vecinoSession.id)

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader vecino={vecinoSession} onSignOut={handleSignOut} subtitle="Mis reservas" menuItems={TABS} />

      {isLoading ? (
        <div className="container mx-auto max-w-3xl py-10">
          <Spinner />
        </div>
      ) : (
        <div className="container mx-auto max-w-4xl py-6 sm:py-10">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="font-sora text-2xl font-bold text-primary sm:text-3xl">
                Mis Reservas
              </h1>
              <p className="mt-1 text-sm text-primary-500">
                Historial de reservas del Polideportivo
              </p>
            </div>
            <Button onClick={() => navigate('/portal/polideportivo/reservar')}>
              Nueva Reserva
            </Button>
          </div>

      {reservas.length === 0 ? (
        <div className="card p-8 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="mx-auto h-16 w-16 text-primary-300"
          >
            <circle cx="12" cy="12" r="9" />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 12c4 0 6 4 6 9M21 12c-4 0-6 4-6 9M3 12c4 0 6-4 6-9M21 12c-4 0-6-4-6-9"
            />
          </svg>
          <p className="mt-4 text-sm text-primary-500">
            No tenés reservas registradas todavía
          </p>
          <Button
            onClick={() => navigate('/portal/polideportivo/reservar')}
            className="mt-4"
          >
            Hacer mi primera reserva
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {reservas.map(r => (
            <div key={r.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  {/* Fecha y hora */}
                  <div className="flex items-center gap-2">
                    <h3 className="font-sora text-base font-semibold text-primary">
                      {dateOf(r.fecha)}
                    </h3>
                    <span className="text-sm text-primary-500">
                      {timeOf(r.hora_inicio)} - {timeOf(r.hora_fin)}
                    </span>
                  </div>

                  {/* Espacio y actividad */}
                  <div className="mt-2 space-y-1 text-sm text-primary-600">
                    <div>
                      <span className="font-medium">Espacio:</span>{' '}
                      {r.espacio?.nombre || '—'}
                    </div>
                    <div>
                      <span className="font-medium">Actividad:</span>{' '}
                      {r.motivo || '—'}
                    </div>
                    {r.observaciones && (
                      <div>
                        <span className="font-medium">Observaciones:</span>{' '}
                        {r.observaciones}
                      </div>
                    )}
                  </div>
                </div>

                {/* Estado */}
                <div>
                  {r.estado === 'pendiente' && (
                    <span className="inline-flex items-center gap-1 rounded bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent-800">
                      ⏳ Pendiente
                    </span>
                  )}
                  {r.estado === 'confirmado' && (
                    <span className="inline-flex items-center gap-1 rounded bg-ok/20 px-3 py-1.5 text-xs font-medium text-ok-800">
                      ✅ Confirmado
                    </span>
                  )}
                  {r.estado === 'cancelado' && (
                    <span className="inline-flex items-center gap-1 rounded bg-danger/20 px-3 py-1.5 text-xs font-medium text-danger-800">
                      ❌ Cancelado
                    </span>
                  )}
                  {r.estado === 'atendido' && (
                    <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
                      ✔️ Completado
                    </span>
                  )}
                </div>
              </div>

              {/* Info adicional */}
              {r.estado === 'pendiente' && (
                <div className="mt-3 border-t border-border pt-3 text-xs text-primary-500">
                  ℹ️ Tu reserva está pendiente de confirmación por el personal
                  del Polideportivo. Te notificaremos por WhatsApp cuando se confirme.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
        </div>
      )}
    </div>
  )
}
