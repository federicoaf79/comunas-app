import { cn } from '../../lib/utils'

const accentClass = {
  primary: 'text-primary',
  accent:  'text-accent-700',
  ok:      'text-ok',
  danger:  'text-danger',
}

export default function StatCard({ label, value, hint, accent = 'primary', className }) {
  return (
    <div className={cn('card p-5', className)}>
      <p className="text-sm font-medium text-primary-500">{label}</p>
      <p className={cn('mt-2 text-3xl font-bold', accentClass[accent] ?? accentClass.primary)}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-primary-400">{hint}</p>}
    </div>
  )
}
