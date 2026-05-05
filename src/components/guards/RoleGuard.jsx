import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function RoleGuard({ roles }) {
  const { hasRole, loading } = useAuth()

  if (loading) return null

  if (!hasRole(roles)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
