function formatFecha(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return String(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} · ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function ConsultaCard({ consulta }) {
  const meta = [consulta.medico, consulta.dependencia_nombre].filter(Boolean).join(' · ')
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-primary">{consulta.motivo || 'Consulta'}</p>
        <span className="text-xs text-primary-400">{formatFecha(consulta.fecha)}</span>
      </div>
      {meta && <p className="mt-1 text-xs text-primary-400">{meta}</p>}
      <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-primary-400">Diagnóstico</p>
          <p className="mt-1 text-primary-700">{consulta.diagnostico || '—'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-primary-400">Receta</p>
          <p className="mt-1 text-primary-700">{consulta.indicaciones || '—'}</p>
        </div>
      </div>
    </div>
  )
}
