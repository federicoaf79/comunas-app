import { cn } from '../../lib/utils'

export function Table({ children, className }) {
  // overflow-x-auto en vez de overflow-hidden: cuando una tabla tiene
  // muchas columnas (Inventario / Flota / Administración), el wrapper
  // permite scroll horizontal en vez de comprimir las celdas y romper
  // el layout. Mantiene el clip de las esquinas redondeadas.
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-border bg-white shadow-card', className)}>
      <table className="w-full text-left text-sm">{children}</table>
    </div>
  )
}

export function THead({ children }) {
  return (
    <thead className="bg-primary-50 text-xs uppercase tracking-wide text-primary-500">
      {children}
    </thead>
  )
}

export function Th({ children, className }) {
  return <th className={cn('px-4 py-3 font-semibold', className)}>{children}</th>
}

export function Tr({ children, onClick, className }) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-t border-border',
        onClick && 'cursor-pointer transition-colors hover:bg-primary-50/60',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function Td({ children, className, colSpan }) {
  return (
    <td colSpan={colSpan} className={cn('px-4 py-3 text-primary-700', className)}>
      {children}
    </td>
  )
}
