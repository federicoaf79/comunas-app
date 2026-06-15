import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { isAdminDomain } from '../../hooks/useSubdomainTenant'
import Card from '../ui/Card'
import Spinner from '../ui/Spinner'

// =============================================================
// AdminDomainGuard — protege el acceso desde admin.comunas.lat
//
// Solo usuarios con rol 'superadmin' pueden acceder desde el
// dominio admin. Staff de municipios (admin_comuna, operador)
// debe usar el subdominio de su municipio (ej: realsayana.comunas.lat)
//
// Flujo:
//   - Si hostname NO es admin.* → dejar pasar (portal/admin normal)
//   - Si hostname ES admin.* + loading → spinner
//   - Si hostname ES admin.* + no auth → redirigir a /login
//   - Si hostname ES admin.* + auth sin superadmin → error "Acceso restringido"
//   - Si hostname ES admin.* + auth con superadmin → dejar pasar
// =============================================================

export default function AdminDomainGuard({ children }) {
  const { loading, user, hasRole } = useAuth()

  // Si NO estamos en admin.comunas.lat, dejar pasar sin restricción
  if (!isAdminDomain()) {
    return children
  }

  // Estamos en admin.comunas.lat — aplicar restricción

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner />
      </div>
    )
  }

  if (!user) {
    // No hay sesión → redirigir a login
    return <Navigate to="/login" replace />
  }

  if (!hasRole('superadmin')) {
    // Usuario autenticado pero sin rol superadmin
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="max-w-md text-center">
          <div className="mb-4">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="mx-auto h-16 w-16 text-danger"
            >
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h1 className="mb-2 font-sora text-xl font-bold text-primary">
            Acceso restringido
          </h1>
          <p className="mb-6 text-sm text-primary-500">
            El panel de superadmin solo está disponible para usuarios autorizados.
            Si necesitás acceso, contactá al administrador del sistema.
          </p>
          <p className="text-xs text-primary-400">
            Usuario actual: <strong>{user.email}</strong>
          </p>
        </Card>
      </div>
    )
  }

  // Usuario con rol superadmin → permitir acceso
  return children
}
