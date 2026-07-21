import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'

// Guard del Portal del Vecino — redirige a /portal/acceso
// cuando no hay sesión. La sesión vive en localStorage (persiste)
// y soporta Supabase Auth (email + password) o acceso rápido (DNI + tel).
// requireCuentaCompleta: cuando true, además de exigir sesión exige
// auth_mode === 'supabase' — usado en rutas donde se decidió que el
// acceso rápido (DNI+tel) ya no alcanza (ver plan Fase 2). Las rutas
// que ya usaban <VecinoGuard /> sin este prop mantienen su
// comportamiento de siempre (solo exigen *alguna* sesión); esas
// páginas siguen gateando auth_mode internamente donde corresponda.
export default function VecinoGuard({ requireCuentaCompleta = false }) {
  const { isVecinoLogued, vecinoSession, vecinoData, clearVecinoSession, authLoading } = useVecino()
  const location = useLocation()

  // Esperar a que termine de cargar antes de redirigir
  // (evita loop cuando se navega desde login antes de que VecinoContext
  // termine de cargar el vecino tras el evento SIGNED_IN)
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#F5F4EF] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#C9A84C] border-r-transparent"></div>
          <p className="mt-4 text-sm text-[#0F1C35]/60">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!isVecinoLogued || (requireCuentaCompleta && vecinoSession?.auth_mode !== 'supabase')) {
    return <Navigate to="/portal/acceso" state={{ from: location }} replace />
  }

  // Verificar estado del portal
  const portalEstado = vecinoData?.portal_estado

  if (portalEstado === 'pendiente') {
    return (
      <div className="min-h-screen bg-[#F5F4EF] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-[#0F1C35]/20 shadow-lg p-6">
          <div className="text-center">
            <div className="mb-4 text-4xl">⏳</div>
            <h2 className="font-sora text-xl font-bold text-[#0F1C35] mb-2">
              Cuenta pendiente de aprobación
            </h2>
            <p className="text-sm text-[#0F1C35]/70 mb-6">
              Tu cuenta está siendo revisada por la administración municipal. Te notificaremos por email cuando esté lista.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                to="/portal"
                className="inline-block px-4 py-2 bg-[#C9A84C] text-white font-semibold rounded hover:bg-[#C9A84C]/90 transition"
              >
                Volver al portal
              </Link>
              <button
                onClick={clearVecinoSession}
                className="text-xs text-[#0F1C35]/60 hover:text-[#0F1C35] hover:underline"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (portalEstado === 'rechazado') {
    return (
      <div className="min-h-screen bg-[#F5F4EF] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg border border-red-200 shadow-lg p-6">
          <div className="text-center">
            <div className="mb-4 text-4xl">❌</div>
            <h2 className="font-sora text-xl font-bold text-[#0F1C35] mb-2">
              Solicitud no aprobada
            </h2>
            <p className="text-sm text-[#0F1C35]/70 mb-6">
              Tu solicitud de acceso al portal no fue aprobada. Contactate con la comisión municipal para más información.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                to="/portal"
                className="inline-block px-4 py-2 bg-[#C9A84C] text-white font-semibold rounded hover:bg-[#C9A84C]/90 transition"
              >
                Volver al portal
              </Link>
              <button
                onClick={clearVecinoSession}
                className="text-xs text-[#0F1C35]/60 hover:text-[#0F1C35] hover:underline"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return <Outlet />
}
