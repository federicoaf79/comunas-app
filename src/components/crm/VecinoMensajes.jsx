import Spinner from '../ui/Spinner'
import MensajeItem from '../sms/MensajeItem'

export default function VecinoMensajes({ mensajes, isLoading = false, error = null }) {
  if (isLoading) {
    return (
      <div className="card flex items-center justify-center p-10">
        <Spinner size="lg" />
      </div>
    )
  }
  if (error) {
    return (
      <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
        No pudimos cargar los mensajes: {error.message}
      </div>
    )
  }
  if (!mensajes?.length) {
    return (
      <div className="card p-10 text-center text-sm text-primary-400">
        Todavía no se enviaron mensajes.
      </div>
    )
  }
  return (
    <ul className="card divide-y divide-border p-0">
      {mensajes.map(m => <MensajeItem key={m.id} mensaje={m} showVecino={false} />)}
    </ul>
  )
}
