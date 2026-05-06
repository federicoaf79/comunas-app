const LABELS = {
  web:        'Web',
  sms:        'SMS',
  whatsapp:   'WA',
  presencial: 'Presencial',
}

// Clases definidas en src/index.css — paleta unificada COMUNAS,
// cero verde, accesible para daltónicos (cada canal usa además
// del color un peso/tipografía distinto).
const CLASS = {
  web:        'canal-web',
  sms:        'canal-sms',
  whatsapp:   'canal-whatsapp',
  presencial: 'canal-presencial',
}

export default function CanalBadge({ canal }) {
  const c = canal ?? 'presencial'
  return (
    <span className={CLASS[c] ?? CLASS.presencial}>
      {LABELS[c] ?? c}
    </span>
  )
}
