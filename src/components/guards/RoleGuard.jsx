import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

// Regla del guard:
//   - `superadmin` pasa CUALQUIER RoleGuard sin importar el `roles`
//     requerido. Es la única excepción global — vale para /admin/*,
//     /superadmin/*, /portal y cualquier ruta protegida que aparezca
//     en el futuro. Su rol es transversal: ve y administra todo el
//     sistema, no solo su pantalla home.
//   - Cualquier otro rol: solo pasa si está en `roles`.
//   - Si no matchea, redirige a `/` (la app decide ahí qué home
//     mostrar según el perfil del usuario).
export default function RoleGuard({ roles }) {
  const { hasRole, loading } = useAuth()

  if (loading) return null

  if (hasRole('superadmin')) return <Outlet />

  if (!hasRole(roles)) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
