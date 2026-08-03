// Mensaje de error de formulario — para fallos de negocio/backend
// (credenciales inválidas, cuenta pendiente, email ya registrado, etc.),
// no para el error de validación de un campo puntual (eso lo maneja
// Input.jsx con su propio texto chico debajo del campo).
//
// Pensado para que se note de un vistazo: caja con borde + fondo tenue
// en el mismo rojo del resto del sistema (token `danger`), texto más
// grande y más pesado que el texto de ayuda, separado del campo de
// arriba con margen propio.
export default function FormError({ children, className = '' }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className={`my-3 flex items-start gap-2 rounded-md border border-danger/30 bg-danger/10 px-3 py-3 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="mt-0.5 h-4 w-4 shrink-0 text-danger"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4M12 16h.01" />
      </svg>
      <p className="text-sm font-semibold leading-snug text-danger">{children}</p>
    </div>
  )
}
