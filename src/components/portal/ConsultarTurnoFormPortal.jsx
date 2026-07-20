import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { dateTimeOf } from '../../lib/datetime'
import { usePortalMunicipioId } from '../../hooks/useConfigPortal'
import Input from '../ui/Input'
import Button from '../ui/Button'

const ESTADO_LABEL = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  en_curso:   'En curso',
  completado: 'Completado',
  cancelado:  'Cancelado',
}

const ESTADO_CLASS = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
}

// Intenta primero por numero_turno, después por DNI vía RPC function.
// La RPC bypassa RLS de vecinos (SECURITY DEFINER) para permitir búsqueda
// pública sin exponer la tabla vecinos directamente.
async function buscarTurnos(input, municipioId) {
  const q = input.trim()
  if (!q || !municipioId) return []

  const COLS = `
    id, numero_turno, fecha, hora_inicio, estado, canal,
    dependencia:dependencia_id ( id, nombre )
  `

  // 1) por numero_turno (la columna podría ser int o text — PostgREST coerce).
  //    Filtrar por municipio_id para scopear la búsqueda al portal actual.
  const { data: byNumero } = await supabase
    .from('turnos_agenda')
    .select(COLS)
    .eq('numero_turno', q)
    .eq('municipio_id', municipioId)
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: false })
  if (byNumero && byNumero.length > 0) return byNumero

  // 2) por DNI: usar RPC function que hace el lookup internamente con SECURITY DEFINER.
  //    Pasar municipio_id para scopear la búsqueda al portal actual.
  const { data: rpcResult, error: rpcError } = await supabase
    .rpc('buscar_turnos_por_dni', { p_dni: q, p_municipio_id: municipioId })

  if (rpcError) {
    console.warn('[ConsultarTurno] RPC error:', rpcError.message)
    return []
  }
  if (!rpcResult || rpcResult.length === 0) return []

  // La RPC devuelve turnos con dependencia_id pero sin el join embed.
  // Necesitamos traer los nombres de dependencias para la UI.
  const depIds = [...new Set(rpcResult.map(t => t.dependencia_id).filter(Boolean))]
  let depsMap = {}
  if (depIds.length > 0) {
    const { data: deps } = await supabase
      .from('dependencias')
      .select('id, nombre')
      .in('id', depIds)
    if (deps) {
      depsMap = Object.fromEntries(deps.map(d => [d.id, d]))
    }
  }

  // Mapear resultado RPC al formato esperado por la UI (con embed de dependencia)
  return rpcResult.map(t => ({
    ...t,
    dependencia: depsMap[t.dependencia_id] || null,
  }))
}

export default function ConsultarTurnoFormPortal() {
  const portalMunicipioQ = usePortalMunicipioId()
  const municipioId = portalMunicipioQ.data ?? null

  const [busqueda, setBusqueda] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [turnos, setTurnos] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!busqueda.trim()) return
    if (!municipioId) {
      setError('No pudimos identificar el municipio. Recargá la página.')
      return
    }
    setError('')
    setSubmitting(true)
    setTurnos(null)
    try {
      const result = await buscarTurnos(busqueda, municipioId)
      setTurnos(result)
    } catch (e) {
      setError(e?.message ?? 'No pudimos consultar tu turno.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card p-5">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Input
            label="DNI o número de turno"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Ej: 32145678"
            className="flex-1"
            inputMode="numeric"
            autoComplete="off"
          />
          <div className="flex flex-col gap-1">
            <Button type="submit" loading={submitting} disabled={!busqueda.trim()}>
              Consultar
            </Button>
            {!busqueda.trim() && (
              <p className="text-xs text-primary-400">Completá el campo para continuar</p>
            )}
          </div>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
          {error}
        </div>
      )}

      {turnos !== null && !error && turnos.length === 0 && (
        <div className="mt-4 rounded-md border border-border bg-primary-50 p-3 text-sm text-primary-500">
          No encontramos turnos con ese DNI o número. Verificá los datos o sacá uno nuevo arriba.
        </div>
      )}

      {turnos && turnos.length > 0 && (
        <ul className="mt-4 divide-y divide-border rounded-md border border-border">
          {turnos.map(t => {
            const dep = t.dependencia?.nombre ?? '—'
            return (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary">
                    {t.numero_turno ? `Turno #${t.numero_turno}` : 'Turno'}
                  </p>
                  <p className="mt-1 text-xs text-primary-400">
                    {t.fecha} {t.hora_inicio} · {dep}
                  </p>
                </div>
                <span className={ESTADO_CLASS[t.estado] ?? 'estado-pendiente'}>
                  {ESTADO_LABEL[t.estado] ?? t.estado}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
