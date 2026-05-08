import { Navigate, Outlet } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'

// Guard del Portal del Vecino — redirige a /mi-cuenta/acceso
// cuando no hay sesión local. La sesión vive en sessionStorage
// y se pierde al cerrar la pestaña, así que cada visita al
// portal personal pasa primero por la pantalla de DNI + teléfono.
export default function VecinoGuard() {
  const { isVecinoLogued } = useVecino()
  if (!isVecinoLogued) {
    return <Navigate to="/mi-cuenta/acceso" replace />
  }
  return <Outlet />
}
