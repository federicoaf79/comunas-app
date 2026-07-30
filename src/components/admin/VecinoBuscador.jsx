import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Input from '../ui/Input'
import Spinner from '../ui/Spinner'
import Avatar from '../ui/Avatar'

// =============================================================
// VecinoBuscador — buscador de vecino por DNI/nombre con debounce.
//
// Extraído de EmitirValeModal.jsx (Fase 1) para Fase 4 parte 2, que
// necesita el mismo buscador en "Agregar persona autorizada" — mismo
// patrón de debounce + DNI/nombre que ya usan
// TurnoPresencialModal.jsx/SumReservaFormModal.jsx, pero esos dos no
// se tocan: viven con su propia copia porque no hay pedido de
// unificarlos. Este componente es el único punto de verdad para los
// dos lugares que SÍ lo comparten (emitir vale, agregar acceso).
//
// Controlado desde afuera solo por `vecino` (el seleccionado) +
// `onSeleccionar` -- la búsqueda en sí (query/candidatos/searching)
// es estado interno, el padre no necesita saber de eso.
// =============================================================

export function vecinoLabel(v) {
  if (!v) return ''
  return v.nombre_completo || `${v.apellido ?? ''} ${v.nombre ?? ''}`.trim() || 'Vecino'
}

export default function VecinoBuscador({
  municipioId, vecino, onSeleccionar,
  label = 'Buscar vecino', placeholder = 'DNI o nombre…', selectedLabel = 'Vecino seleccionado',
}) {
  const [query, setQuery]     = useState('')
  const [candidatos, setCandidatos] = useState([])
  const [searching, setSearching]   = useState(false)
  const [searched, setSearched]     = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (vecino) return
    const term = query.trim()
    if (term.length < 2) { setCandidatos([]); setSearched(false); return }
    let cancel = false
    setSearching(true)
    setSearched(false)
    const id = setTimeout(async () => {
      try {
        const esNumerico = /^\d{6,}$/.test(term)
        const pattern = `%${term.replace(/[%_]/g, '\\$&')}%`
        let q = supabase
          .from('vecinos')
          .select('id, municipio_id, dni, nombre, apellido, nombre_completo, telefono, email')
          .limit(8)
        q = esNumerico
          ? q.or(`dni.eq.${term},dni.ilike.${pattern}`)
          : q.or(`apellido.ilike.${pattern},nombre.ilike.${pattern},nombre_completo.ilike.${pattern},dni.ilike.${pattern}`)
        if (municipioId) q = q.eq('municipio_id', municipioId)
        const { data, error: err } = await q
        if (cancel) return
        if (err) throw err
        setCandidatos(data ?? [])
        setSearched(true)
      } catch (e) {
        if (!cancel) setError(e?.message ?? 'No pudimos buscar el vecino.')
      } finally {
        if (!cancel) setSearching(false)
      }
    }, 250)
    return () => { cancel = true; clearTimeout(id) }
  }, [query, vecino, municipioId])

  return (
    <div className="space-y-2">
      <Input
        label={label}
        value={query}
        onChange={e => { setQuery(e.target.value); if (vecino) onSeleccionar(null) }}
        placeholder={placeholder}
        autoComplete="off"
      />

      {vecino && (
        <div className="flex items-center gap-3 rounded-md border border-ok-100 bg-ok-50 p-3 text-sm">
          <Avatar name={vecinoLabel(vecino)} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ok-700">✓ {selectedLabel}</p>
            <p className="text-xs text-ok-700/80">
              {vecinoLabel(vecino)} · DNI {vecino.dni || '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { onSeleccionar(null); setQuery('') }}
            className="text-xs font-medium text-primary-500 hover:text-primary"
          >
            Cambiar
          </button>
        </div>
      )}

      {!vecino && query.trim().length >= 2 && (
        searching ? (
          <div className="flex items-center justify-center rounded-md border border-border bg-white py-6">
            <Spinner size="sm" />
          </div>
        ) : candidatos.length > 0 ? (
          <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border bg-white">
            {candidatos.map(v => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => { onSeleccionar(v); setQuery('') }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary-50"
                >
                  <Avatar name={vecinoLabel(v)} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-primary">{vecinoLabel(v)}</p>
                    <p className="truncate text-xs text-primary-400">
                      DNI {v.dni || '—'}{v.telefono ? ` · ${v.telefono}` : ''}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        ) : searched ? (
          <div className="rounded-md border border-dashed border-accent-200 bg-accent-50/50 p-4 text-center text-sm text-primary-500">
            No se encontró ningún vecino con ese dato.
          </div>
        ) : null
      )}

      {error && (
        <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>
      )}
    </div>
  )
}
