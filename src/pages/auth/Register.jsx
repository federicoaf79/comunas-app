import { Navigate } from 'react-router-dom'

// El registro real de vecinos vive en /portal/acceso (tab "Registrarse",
// VecinoAcceso.jsx) -- pide DNI/teléfono y vincula/crea la fila en
// `vecinos` con `user_id`. Esta ruta (/register) solo creaba la cuenta
// de Supabase Auth, sin fila en `vecinos`: VecinoContext nunca
// encontraba al vecino por user_id y el portal lo trataba como no
// logueado -- cuenta viva, inútil y sin explicación para quien se
// registraba acá.
//
// La ruta queda (no se borra) por si quedó linkeada en un mail o un
// marcador viejo -- Navigate con replace preserva el subdominio del
// municipio porque es ruteo client-side dentro del mismo origen.
export default function Register() {
  return <Navigate to="/portal/acceso?tab=registro" replace />
}
