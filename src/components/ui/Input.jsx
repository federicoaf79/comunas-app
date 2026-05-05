import { cn } from '../../lib/utils'

export default function Input({ label, error, className, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-primary-700">{label}</label>
      )}
      <input
        className={cn('input-field', error && 'border-danger focus:border-danger focus:ring-danger/20', className)}
        {...props}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
