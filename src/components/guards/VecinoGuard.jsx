import { Navigate, Outlet } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'

// Guard del Portal del Vecino — redirige a /portal/acceso
// cuando no hay sesión. La sesión vive en localStorage (persiste)
// y soporta Supabase Auth (email + password) o acceso rápido (DNI + tel).
export default function VecinoGuard() {
  const { isVecinoLogued } = useVecino()
  if (!isVecinoLogued) {
    return <Navigate to="/portal/acceso" replace />
  }
  return <Outlet />
}
