import { cn } from '../../lib/utils'

const ROLE_LABELS = {
  superadmin:   'Superadmin',
  admin_comuna: 'Admin comuna',
  operador:     'Operador',
  vecino:       'Vecino',
}

const variantClass = {
  ok:      'badge-ok',
  accent:  'badge-accent',
  neutral: 'badge-neutral',
  danger:  'badge-danger',
}

export function Badge({ variant = 'neutral', children }) {
  return <span className={variantClass[variant] ?? variantClass.neutral}>{children}</span>
}

export function RoleBadge({ role }) {
  const variant = role === 'superadmin' ? 'accent' : role === 'vecino' ? 'neutral' : 'ok'
  return (
    <span className={cn(variantClass[variant])}>
      {ROLE_LABELS[role] ?? role}
    </span>
  )
}
