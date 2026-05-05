import ConsultaCard from '../hc/ConsultaCard'

export default function VecinoHC({ consultas }) {
  if (!consultas?.length) {
    return (
      <div className="card p-10 text-center text-sm text-primary-400">
        Sin consultas registradas.
      </div>
    )
  }
  return (
    <div className="space-y-3">
      {consultas.map(c => <ConsultaCard key={c.id} consulta={c} />)}
    </div>
  )
}
