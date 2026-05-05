import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function RoleGuard({ roles }) {
  const { role, loading } = useAuth()

  if (loading) return null

  if (!roles.includes(role)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
