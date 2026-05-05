import { cn } from '../../lib/utils'

const sizes = {
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-9 w-9 text-sm',
  lg: 'h-14 w-14 text-lg',
}

function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export default function Avatar({ name, size = 'md', className }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-white',
        sizes[size] ?? sizes.md,
        className,
      )}
      title={name}
    >
      {initials(name)}
    </div>
  )
}
