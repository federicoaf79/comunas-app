import {
  medicoGuardia,
  vecinoById,
  alergiasOf,
  vecinoTieneAlergias,
  turnosCAPSHoy,
} from '../../lib/mockData'
import Avatar from '../../components/ui/Avatar'
import StatCard from '../../components/ui/StatCard'
import AlergiaBadge from '../../components/hc/AlergiaBadge'
import RecetaUploader from '../../components/hc/RecetaUploader'

const ESTADO = {
  reservado:  'badge-neutral',
  confirmado: 'badge-ok',
  atendido:   'badge-accent',
  ausente:    'badge-danger',
  cancelado:  'badge-danger',
}

export default function SalaPrimerosAuxilios() {
  const turnos = turnosCAPSHoy().sort((a, b) => a.hora.localeCompare(b.hora))
  const conAlergias = turnos.filter(t => vecinoTieneAlergias(t.vecino_id))
  const atendidos   = turnos.filter(t => t.estado === 'atendido').length

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Sala de Primeros Auxilios</h1>
        <p className="text-sm text-primary-400">Agenda del día — CAPS Real Sayana</p>
      </header>

      {/* Médico de guardia */}
      <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v6a4 4 0 0 1-4 4M12 2v6a4 4 0 0 0 4 4M8 12h8M12 12v8" />
            </svg>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-primary-400">Médico de guardia</p>
            <p className="text-lg font-semibold text-primary">{medicoGuardia.nombre}</p>
            <p className="text-xs text-primary-500">
              {medicoGuardia.especialidad} · {medicoGuardia.matricula}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm text-primary-700">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary-400">Horario</p>
            <p className="font-semibold">{medicoGuardia.desde} – {medicoGuardia.hasta}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-primary-400">Contacto</p>
            <p className="font-semibold">{medicoGuardia.telefono}</p>
          </div>
        </div>
      </div>

      {/* KPIs de la sala */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Turnos del día" value={turnos.length} />
        <StatCard label="Atendidos"      value={atendidos} accent="accent" />
        <StatCard
          label="Pacientes con alergia"
          value={conAlergias.length}
          accent="danger"
          hint="Verificar antes de medicar"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Agenda con alergias */}
        <div className="card overflow-hidden p-0 lg:col-span-2">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-primary-700">Agenda del día</h2>
          </header>
          {turnos.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-primary-400">Sin turnos cargados.</div>
          ) : (
            <ul className="divide-y divide-border">
              {turnos.map(t => {
                const v = vecinoById(t.vecino_id)
                const alergias = alergiasOf(t.vecino_id)
                return (
                  <li key={t.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
                    <span className="w-12 shrink-0 text-sm font-semibold text-primary">{t.hora}</span>
                    <Avatar name={`${v?.nombre} ${v?.apellido}`} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-primary-700">
                        {v?.apellido}, {v?.nombre}
                      </p>
                      <p className="truncate text-xs text-primary-400">
                        {t.motivo}{t.medico ? ` · ${t.medico}` : ''}
                      </p>
                      {alergias.length > 0 && (
                        <div className="mt-2"><AlergiaBadge alergias={alergias} /></div>
                      )}
                    </div>
                    <span className={ESTADO[t.estado] ?? 'badge-neutral'}>{t.estado}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Carga de receta */}
        <div className="card p-0">
          <header className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold text-primary-700">Cargar receta por foto</h2>
            <p className="mt-0.5 text-xs text-primary-400">
              Foto desde el celular o seleccionar archivo. Queda asociada al vecino.
            </p>
          </header>
          <div className="p-5">
            <RecetaUploader />
          </div>
        </div>
      </div>
    </div>
  )
}
