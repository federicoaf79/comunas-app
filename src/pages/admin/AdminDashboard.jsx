import { Link } from 'react-router-dom'
import StatCard from '../../components/ui/StatCard'
import {
  vecinos,
  turnosHoy,
  mensajesDelMes,
  denunciasAbiertas,
  dependenciaById,
  vecinoById,
} from '../../lib/mockData'

const ESTADO = {
  reservado:  'badge-neutral',
  confirmado: 'badge-ok',
  atendido:   'badge-accent',
  ausente:    'badge-danger',
  cancelado:  'badge-danger',
}

export default function AdminDashboard() {
  const turnos    = turnosHoy()
  const mensajes  = mensajesDelMes()
  const denuncias = denunciasAbiertas()
  const atendidos = turnos.filter(t => t.estado === 'atendido').length
  const sms = mensajes.filter(m => m.canal === 'sms').length
  const wa  = mensajes.filter(m => m.canal === 'whatsapp').length

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <p className="text-sm text-primary-400">Resumen del día — Real Sayana</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Turnos hoy"          value={turnos.length}    hint={`${atendidos} atendidos`} />
        <StatCard label="Vecinos registrados" value={vecinos.length}   hint="Padrón actual" />
        <StatCard label="Mensajes del mes"    value={mensajes.length}  hint={`${sms} SMS · ${wa} WhatsApp`} />
        <StatCard label="Denuncias abiertas"  value={denuncias.length} hint="Sin resolver" accent="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary-700">Próximos turnos</h3>
            <Link to="/admin/turnos" className="text-xs font-medium text-primary hover:underline">
              Ver todos →
            </Link>
          </div>
          <ul className="divide-y divide-border">
            {turnos.slice(0, 6).map(t => {
              const v = vecinoById(t.vecino_id)
              const dep = dependenciaById(t.dependencia_id)
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-primary-700">
                      {v?.apellido}, {v?.nombre}
                    </p>
                    <p className="truncate text-xs text-primary-400">
                      {t.hora} · {dep?.nombre}
                    </p>
                  </div>
                  <span className={ESTADO[t.estado] ?? 'badge-neutral'}>{t.estado}</span>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-primary-700">Denuncias abiertas</h3>
            <span className="badge-danger">{denuncias.length}</span>
          </div>
          <ul className="divide-y divide-border">
            {denuncias.slice(0, 6).map(d => {
              const v = vecinoById(d.vecino_id)
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-primary-700">{d.asunto}</p>
                    <p className="truncate text-xs text-primary-400">
                      {v?.apellido}, {v?.nombre} · {d.tipo}
                    </p>
                  </div>
                  <span className="text-xs text-primary-400">{d.fecha}</span>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
