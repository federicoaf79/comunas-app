import { cn } from '../../lib/utils'

const sizes = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-[3px]',
}

export default function Spinner({ size = 'md', className }) {
  return (
    <div
      className={cn(
        'animate-spin rounded-full border-border border-t-primary',
        sizes[size],
        className
      )}
      role="status"
      aria-label="Cargando..."
    />
  )
}
