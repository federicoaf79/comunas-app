import { dependenciaById } from '../../lib/mockData'

export default function ConsultaCard({ consulta }) {
  const dep = dependenciaById(consulta.dependencia_id)
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-primary">{consulta.motivo}</p>
        <span className="text-xs text-primary-400">{consulta.fecha.replace('T', ' · ')}</span>
      </div>
      <p className="mt-1 text-xs text-primary-400">
        {consulta.medico} · {dep?.nombre}
      </p>
      <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-primary-400">Diagnóstico</p>
          <p className="mt-1 text-primary-700">{consulta.diagnostico || '—'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-primary-400">Indicaciones</p>
          <p className="mt-1 text-primary-700">{consulta.indicaciones || '—'}</p>
        </div>
      </div>
    </div>
  )
}
