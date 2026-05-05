const LABELS = {
  web:        'Web',
  sms:        'SMS',
  whatsapp:   'WA',
  presencial: 'Presencial',
}

const STYLES = {
  web:        'bg-ok-50 text-ok-700 ring-ok-100',
  sms:        'bg-primary-50 text-primary ring-border',
  whatsapp:   'bg-accent-50 text-accent-700 ring-accent-100',
  presencial: 'bg-primary-50 text-primary-500 ring-border',
}

export default function CanalBadge({ canal }) {
  const c = canal ?? 'presencial'
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset ${STYLES[c] ?? STYLES.presencial}`}
    >
      {LABELS[c] ?? c}
    </span>
  )
}
