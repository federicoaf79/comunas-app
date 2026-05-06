import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function RoleGuard({ roles }) {
  const { hasRole, loading } = useAuth()

  if (loading) return null

  // Superadmin tiene acceso a TODAS las rutas — el rol no se chequea
  // contra `roles` requeridos. Esto cubre el caso de un superadmin
  // entrando a /admin/* o /portal sin necesidad de tener esos roles
  // específicos asignados.
  if (hasRole('superadmin')) return <Outlet />

  if (!hasRole(roles)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
