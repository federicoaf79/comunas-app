import { Navigate } from 'react-router-dom'
import { isAdminDomain } from '../../hooks/useSubdomainTenant'

// =============================================================
// AdminDomainRedirect — redirige rutas del portal ciudadano
// cuando se accede desde admin.comunas.lat
//
// En admin.comunas.lat NO debe mostrarse el portal público.
// Redirige /portal → /login para que el superadmin ingrese.
// =============================================================

export default function AdminDomainRedirect({ children }) {
  if (isAdminDomain()) {
    // Estamos en admin.comunas.lat → redirigir al login
    return <Navigate to="/login" replace />
  }
  // NO estamos en admin.comunas.lat → mostrar el portal normal
  return children
}
