import { cn } from '../../lib/utils'

export default function Select({ label, value, onChange, options, placeholder, className, children, ...rest }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && <label className="text-sm font-medium text-primary-700">{label}</label>}
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="input-field"
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options ? (
          options.map(opt => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))
        ) : (
          children
        )}
      </select>
    </div>
  )
}
