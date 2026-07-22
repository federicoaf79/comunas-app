import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useHC } from '../../hooks/useHC'
import { useOrdenesDerivacionVecino } from '../../hooks/useVecinoData'
import { supabase } from '../../lib/supabase'
import Spinner from '../ui/Spinner'
import Button from '../ui/Button'
import ConsultaCard from '../hc/ConsultaCard'
import ConsultaFormModal from '../hc/ConsultaFormModal'
import DerivacionCard from '../hc/DerivacionCard'

export default function VecinoHC() {
  const { id: vecinoId } = useParams()
  const { consultas, isLoading, isFetching, error, createConsulta } = useHC(vecinoId)
  // Cliente autenticado siempre — esta pantalla vive del lado admin.
  const { data: derivaciones = [], isLoading: derivLoading } = useOrdenesDerivacionVecino(vecinoId, supabase)
  const [open, setOpen] = useState(false)

  async function handleCreate(form) {
    // Lanza para que el modal muestre el error en línea.
    await createConsulta.mutateAsync(form)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-primary-400">
          {consultas.length > 0
            ? `${consultas.length} consulta${consultas.length === 1 ? '' : 's'} registrada${consultas.length === 1 ? '' : 's'}`
            : 'Historial clínico'}
          {isFetching && !isLoading && (
            <span className="ml-2 text-primary-300">(actualizando...)</span>
          )}
        </p>
        <Button onClick={() => setOpen(true)}>+ Nueva consulta</Button>
      </div>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar el historial: {error.message}
        </div>
      )}

      {isLoading && (
        <div className="card flex items-center justify-center p-10">
          <Spinner size="lg" />
        </div>
      )}

      {!isLoading && !error && consultas.length === 0 && (
        <div className="card p-10 text-center text-sm text-primary-400">
          Sin consultas registradas.
        </div>
      )}

      {!isLoading && !error && consultas.length > 0 && (
        <div className="space-y-3">
          {consultas.map(c => <ConsultaCard key={c.id} consulta={c} />)}
        </div>
      )}

      {/* Derivaciones — internas (origen='digital', el Médico General
          del CIC) y físicas (orden subida por el vecino). */}
      <div className="pt-2">
        <p className="text-sm font-semibold text-primary">
          Derivaciones
          {derivaciones.length > 0 && (
            <span className="ml-1.5 font-normal text-primary-400">({derivaciones.length})</span>
          )}
        </p>

        {derivLoading && (
          <div className="card mt-2 flex items-center justify-center p-6">
            <Spinner />
          </div>
        )}

        {!derivLoading && derivaciones.length === 0 && (
          <div className="card mt-2 p-6 text-center text-sm text-primary-400">
            Sin derivaciones registradas.
          </div>
        )}

        {!derivLoading && derivaciones.length > 0 && (
          <div className="mt-2 space-y-3">
            {derivaciones.map(d => (
              <DerivacionCard key={d.id} derivacion={d}>
                <p className="mt-2 text-xs text-primary-500">
                  {d.turno_id
                    ? '✓ Ya usada — vinculada a un turno reservado.'
                    : 'Sin usar todavía — el vecino puede reservar turno con el especialista.'}
                </p>
              </DerivacionCard>
            ))}
          </div>
        )}
      </div>

      <ConsultaFormModal
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  )
}
