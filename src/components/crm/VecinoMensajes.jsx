import MensajeItem from '../sms/MensajeItem'

export default function VecinoMensajes({ mensajes }) {
  if (!mensajes?.length) {
    return (
      <div className="card p-10 text-center text-sm text-primary-400">
        Sin mensajes registrados.
      </div>
    )
  }
  return (
    <ul className="card divide-y divide-border p-0">
      {mensajes.map(m => <MensajeItem key={m.id} mensaje={m} showVecino={false} />)}
    </ul>
  )
}
