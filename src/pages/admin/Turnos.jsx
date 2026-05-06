import { useMemo, useState } from 'react'
import { useTurnos } from '../../hooks/useTurnos'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import TurnoItem from '../../components/turnos/TurnoItem'

const ESTADO_OPTS = [
  { value: 'pendiente',  label: 'Pendiente' },
  { value: 'confirmado', label: 'Confirmado' },
  { value: 'en_curso',   label: 'En curso' },
  { value: 'completado', label: 'Completado' },
  { value: 'cancelado',  label: 'Cancelado' },
]

function todayLocalStr() {
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function TurnosDia() {
  const [filtroDep, setFiltroDep]       = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [fecha] = useState(() => todayLocalStr())

  const { turnos, isLoading, isFetching, error, updateEstado, cancel } = useTurnos({
    dependenciaId: filtroDep    || undefined,
    estado:        filtroEstado || undefined,
    fecha,
  })

  // Lista de dependencias para el filtro: derivada de los turnos
  // cargados para no agregar otra query. Si una dependencia no tiene
  // turnos hoy, no aparece en el dropdown — es esperado.
  const dependenciasOpts = useMemo(() => {
    const seen = new Map()
    for (const t of turnos) {
      if (t.dependencia_id && !seen.has(t.dependencia_id)) {
        seen.set(t.dependencia_id, {
          value: t.dependencia_id,
          label: t.dependencia_nombre ?? t.dependencia_id,
        })
      }
    }
    return Array.from(seen.values())
  }, [turnos])

  // Agrupar turnos por dependencia.
  const grupos = useMemo(() => {
    const map = new Map()
    for (const t of turnos) {
      const key = t.dependencia_id ?? 'sin-dep'
      if (!map.has(key)) {
        map.set(key, {
          id:     key,
          nombre: t.dependencia_nombre ?? 'Sin dependencia',
          turnos: [],
        })
      }
      map.get(key).turnos.push(t)
    }
    return Array.from(map.values())
  }, [turnos])

  async function handleConfirmar(id) {
    try {
      await updateEstado.mutateAsync({ id, estado: 'confirmado' })
    } catch (e) {
      alert(`No se pudo confirmar el turno: ${e.message}`)
    }
  }

  async function handleCancelar(id) {
    if (!confirm('¿Cancelar este turno?')) return
    try {
      await cancel.mutateAsync(id)
    } catch (e) {
      alert(`No se pudo cancelar el turno: ${e.message}`)
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Turnos del día</h1>
          <p className="text-sm text-primary-400">
            Hoy ({fecha}) · {turnos.length} turnos · {grupos.length} dependencia{grupos.length === 1 ? '' : 's'}
            {isFetching && !isLoading && (
              <span className="ml-2 text-primary-300">(actualizando...)</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select
            value={filtroDep}
            onChange={setFiltroDep}
            placeholder="Todas las dependencias"
            options={dependenciasOpts}
            className="min-w-[220px]"
          />
          <Select
            value={filtroEstado}
            onChange={setFiltroEstado}
            placeholder="Todos los estados"
            options={ESTADO_OPTS}
            className="min-w-[180px]"
          />
        </div>
      </header>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los turnos: {error.message}
        </div>
      )}

      {isLoading && (
        <div className="card flex items-center justify-center p-10">
          <Spinner size="lg" />
        </div>
      )}

      {!isLoading && !error && turnos.length === 0 && (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay turnos hoy con esos filtros.
        </div>
      )}

      {!isLoading && !error && grupos.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {grupos.map(g => (
            <div key={g.id} className="card overflow-hidden p-0">
              <header className="flex items-center justify-between border-b border-border bg-primary-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-primary">{g.nombre}</h3>
                <span className="text-xs text-primary-500">{g.turnos.length} turnos</span>
              </header>
              <ul className="divide-y divide-border">
                {g.turnos.map(t => (
                  <TurnoItem
                    key={t.id}
                    turno={t}
                    onConfirmar={t.estado === 'pendiente' ? () => handleConfirmar(t.id) : null}
                    onCancelar={
                      t.estado !== 'cancelado' && t.estado !== 'completado'
                        ? () => handleCancelar(t.id)
                        : null
                    }
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
