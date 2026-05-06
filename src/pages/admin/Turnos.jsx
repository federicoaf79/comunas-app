import { useMemo, useState } from 'react'
import { useTurnos, useDependencias } from '../../hooks/useTurnos'
import { todayArgYMD } from '../../lib/datetime'
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

export default function TurnosDia() {
  const [filtroDep, setFiltroDep]       = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [fecha] = useState(() => todayArgYMD())

  const { turnos, isLoading, isFetching, error, updateEstado, cancel } = useTurnos({
    dependenciaId: filtroDep    || undefined,
    estado:        filtroEstado || undefined,
    fecha,
  })

  // Catálogo de dependencias del municipio (para el dropdown).
  // Sirve también como fallback si el join de turnos no trae el nombre.
  const { data: allDeps = [] } = useDependencias()
  const depNameById = useMemo(
    () => new Map(allDeps.map(d => [d.id, d.nombre])),
    [allDeps],
  )

  // Opciones del dropdown — preferimos el catálogo entero; si está
  // vacío caemos a las dependencias presentes en los turnos del día.
  const dependenciasOpts = useMemo(() => {
    if (allDeps.length > 0) {
      return allDeps.map(d => ({ value: d.id, label: d.nombre }))
    }
    const seen = new Map()
    for (const t of turnos) {
      if (t.dependencia_id && !seen.has(t.dependencia_id)) {
        seen.set(t.dependencia_id, {
          value: t.dependencia_id,
          label: t.dependencia_nombre ?? t.dependencia?.nombre ?? t.dependencia_id,
        })
      }
    }
    return Array.from(seen.values())
  }, [allDeps, turnos])

  // Agrupar turnos por dependencia, leyendo el nombre con cadena
  // de fallbacks (alias join → table-name join → catálogo de deps).
  const grupos = useMemo(() => {
    const map = new Map()
    for (const t of turnos) {
      const key = t.dependencia_id ?? 'sin-dep'
      const nombre =
        t.dependencia_nombre ??
        t.dependencia?.nombre ??
        depNameById.get(t.dependencia_id) ??
        'Sin dependencia'
      if (!map.has(key)) {
        map.set(key, { id: key, nombre, turnos: [] })
      }
      map.get(key).turnos.push(t)
    }
    return Array.from(map.values())
  }, [turnos, depNameById])

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
