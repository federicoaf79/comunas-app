import { Navigate } from 'react-router-dom'
import { isLandingDomain } from '../../hooks/useSubdomainTenant'

// =============================================================
// LandingDomainGuard — redirige a raíz si estamos en el dominio
// de landing (comunas.lat / www) y alguien intenta acceder
// directamente a /portal o rutas internas.
//
// En comunas.lat todas las rutas excepto / deben redirigir a /
// para mostrar la landing de ventas.
// =============================================================

export default function LandingDomainGuard({ children }) {
  if (isLandingDomain() && window.location.pathname !== '/') {
    return <Navigate to="/" replace />
  }
  return children
}
