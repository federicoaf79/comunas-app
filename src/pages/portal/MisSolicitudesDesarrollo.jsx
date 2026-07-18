// src/pages/portal/MisSolicitudesDesarrollo.jsx
// Listado de solicitudes de Agencia de Desarrollo del vecino logueado

import { useNavigate } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'
import { TABS } from './VecinoDashboard'
import { useSolicitudesVecino } from '../../hooks/useSolicitudesDesarrollo'
import DashboardHeader from '../../components/portal/DashboardHeader'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { dateOf } from '../../lib/datetime'

// Mapeo de estados de turnos_agenda a labels de Agencia de Desarrollo
const ESTADO_LABELS = {
  pendiente: 'En lista de espera',
  confirmado: 'Aprobado',
  atendido: 'Realizado',
  cancelado: 'Dado de baja',
}

export default function MisSolicitudesDesarrollo() {
  const navigate = useNavigate()
  const { vecinoSession, clearVecinoSession } = useVecino()

  function handleSignOut() {
    clearVecinoSession()
    navigate('/portal', { replace: true })
  }

  const vecino = vecinoSession

  // AUTH GUARD
  if (!vecino) {
    return (
      <div className="container mx-auto max-w-2xl py-6 sm:py-10">
        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Inicio de sesión requerido
            </h3>
            <p className="mt-2 text-sm text-primary-600">
              Para ver tus solicitudes necesitás ingresar con tu cuenta.
            </p>
            <Button onClick={() => navigate('/portal/login')} className="mt-4">
              Iniciar sesión
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (vecino.auth_mode !== 'supabase') {
    return (
      <div className="container mx-auto max-w-2xl py-6 sm:py-10">
        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Cuenta completa requerida
            </h3>
            <p className="mt-2 text-sm text-primary-600">
              El acceso rápido (DNI + teléfono) no permite gestionar solicitudes.
            </p>
            <Button onClick={() => navigate('/register')} className="mt-4">
              Crear cuenta
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const { data: solicitudes = [], isLoading } = useSolicitudesVecino(vecino.id)

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader vecino={vecino} onSignOut={handleSignOut} subtitle="Mis solicitudes" menuItems={TABS} />

      {isLoading ? (
        <div className="container mx-auto max-w-3xl py-10">
          <Spinner />
        </div>
      ) : (
        <div className="container mx-auto max-w-4xl py-6 sm:py-10">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="font-sora text-2xl font-bold text-primary sm:text-3xl">
                Mis Solicitudes
              </h1>
              <p className="mt-1 text-sm text-primary-500">
                Historial de solicitudes de Agencia de Desarrollo — Servicios Rurales
              </p>
            </div>
            <Button onClick={() => navigate('/portal/desarrollo/solicitar')}>
              Nueva Solicitud
            </Button>
          </div>

      {solicitudes.length === 0 ? (
        <div className="card p-8 text-center">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            className="mx-auto h-16 w-16 text-primary-300"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <p className="mt-4 text-sm text-primary-500">
            No tenés solicitudes registradas todavía
          </p>
          <Button
            onClick={() => navigate('/portal/desarrollo/solicitar')}
            className="mt-4"
          >
            Hacer mi primera solicitud
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {solicitudes.map(s => (
            <div key={s.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1">
                  {/* Tipo de servicio */}
                  <h3 className="font-sora text-base font-semibold text-primary">
                    {s.motivo || 'Servicio rural'}
                  </h3>

                  {/* Fecha preferida */}
                  {s.fecha && (
                    <div className="mt-1 text-sm text-primary-500">
                      📅 Fecha preferida/asignada: {dateOf(s.fecha)}
                    </div>
                  )}

                  {/* Detalle de la solicitud */}
                  {s.notas_vecino && (
                    <div className="mt-3 rounded bg-background p-3 text-sm text-primary-600">
                      <p className="whitespace-pre-wrap">{s.notas_vecino}</p>
                    </div>
                  )}

                  {/* Fecha de creación */}
                  <div className="mt-2 text-xs text-primary-400">
                    Solicitado el {new Date(s.created_at).toLocaleDateString('es-AR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>

                {/* Estado */}
                <div>
                  {s.estado === 'pendiente' && (
                    <span className="inline-flex items-center gap-1 rounded bg-accent/20 px-3 py-1.5 text-xs font-medium text-accent-800">
                      ⏳ {ESTADO_LABELS.pendiente}
                    </span>
                  )}
                  {s.estado === 'confirmado' && (
                    <span className="inline-flex items-center gap-1 rounded bg-ok/20 px-3 py-1.5 text-xs font-medium text-ok-800">
                      ✅ {ESTADO_LABELS.confirmado}
                    </span>
                  )}
                  {s.estado === 'atendido' && (
                    <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
                      ✔️ {ESTADO_LABELS.atendido}
                    </span>
                  )}
                  {s.estado === 'cancelado' && (
                    <span className="inline-flex items-center gap-1 rounded bg-danger/20 px-3 py-1.5 text-xs font-medium text-danger-800">
                      ❌ {ESTADO_LABELS.cancelado}
                    </span>
                  )}
                </div>
              </div>

              {/* Info adicional para pendientes */}
              {s.estado === 'pendiente' && (
                <div className="mt-3 border-t border-border pt-3 text-xs text-primary-500">
                  ℹ️ Tu solicitud está en lista de espera. El personal de la Agencia de Desarrollo
                  la revisará y te notificaremos por WhatsApp cuando se apruebe y coordine la fecha.
                </div>
              )}

              {/* Info adicional para aprobados */}
              {s.estado === 'confirmado' && s.fecha && (
                <div className="mt-3 border-t border-border pt-3 text-xs text-ok-700">
                  ✅ Tu solicitud fue aprobada. Fecha confirmada: {dateOf(s.fecha)}
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
