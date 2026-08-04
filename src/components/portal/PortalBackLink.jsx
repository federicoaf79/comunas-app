import { Link } from 'react-router-dom'

// Botón "volver" único para todo el portal del vecino — mismo texto,
// mismo ícono, misma posición (arriba a la izquierda) en cualquier
// pantalla que no sea el home (`/portal`). El destino lo decide cada
// caller: la pantalla anterior lógica (un listado, un tab de "Mi
// cuenta"), nunca hardcodeado a `/portal` salvo que esa sea
// realmente la pantalla de origen.
export default function PortalBackLink({ to, className = '' }) {
  return (
    <Link
      to={to}
      className={
        'inline-flex items-center gap-2 self-start rounded-md px-2 py-1 text-sm font-medium no-underline transition-colors ' +
        className
      }
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6" />
      </svg>
      Volver
    </Link>
  )
}
