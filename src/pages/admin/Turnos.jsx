import { useMemo, useState } from 'react'
import { dependencias, turnos } from '../../lib/mockData'
import Select from '../../components/ui/Select'
import TurnoItem from '../../components/turnos/TurnoItem'

const CANAL_OPTS = [
  { value: 'web',        label: 'Web' },
  { value: 'sms',        label: 'SMS' },
  { value: 'whatsapp',   label: 'WhatsApp' },
  { value: 'presencial', label: 'Presencial' },
]

export default function TurnosDia() {
  const [filtroDep, setFiltroDep]     = useState('')
  const [filtroCanal, setFiltroCanal] = useState('')

  const grupos = useMemo(() => {
    const deps = filtroDep ? dependencias.filter(d => d.id === filtroDep) : dependencias
    return deps
      .map(dep => ({
        dep,
        turnos: turnos
          .filter(t => t.dependencia_id === dep.id)
          .filter(t => !filtroCanal || t.canal === filtroCanal)
          .sort((a, b) => a.hora.localeCompare(b.hora)),
      }))
      .filter(g => g.turnos.length > 0)
  }, [filtroDep, filtroCanal])

  const total = grupos.reduce((sum, g) => sum + g.turnos.length, 0)

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Turnos del día</h1>
          <p className="text-sm text-primary-400">
            Hoy · {total} turnos · {grupos.length} dependencia{grupos.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={filtroDep}
            onChange={setFiltroDep}
            placeholder="Todas las dependencias"
            options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
            className="min-w-[220px]"
          />
          <Select
            value={filtroCanal}
            onChange={setFiltroCanal}
            placeholder="Todos los canales"
            options={CANAL_OPTS}
            className="min-w-[180px]"
          />
        </div>
      </header>

      {grupos.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay turnos hoy con esos filtros.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {grupos.map(({ dep, turnos: ts }) => (
            <div key={dep.id} className="card overflow-hidden p-0">
              <header className="flex items-center justify-between border-b border-border bg-primary-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-primary">{dep.nombre}</h3>
                <span className="text-xs text-primary-500">{ts.length} turnos</span>
              </header>
              <ul className="divide-y divide-border">
                {ts.map(t => <TurnoItem key={t.id} turno={t} />)}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
