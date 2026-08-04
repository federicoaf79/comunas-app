import { useState } from 'react'
import {
  useVinculosFamiliaresPendientes, useAprobarVinculoFamiliar, useRechazarVinculoFamiliar,
} from '../../hooks/useVinculosFamiliaresAdmin'
import { Table, THead, Th, Tr, Td } from '../ui/Table'
import Spinner from '../ui/Spinner'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import { dateTimeOf } from '../../lib/datetime'

// Mismos 7 valores que el CHECK constraint real (ver VecinoDashboard.jsx
// del lado del portal, donde vive la definición canónica).
const PARENTESCO_LABEL = {
  hijo:     'Hijo/a',
  padre:    'Padre',
  madre:    'Madre',
  conyuge:  'Cónyuge',
  hermano:  'Hermano/a',
  tutelado: 'Persona a cargo',
  otro:     'Otro',
}

const ESTADO_LABEL = {
  pendiente:             'Pendiente',
  revision_mayoria_edad: 'Revisión por mayoría de edad',
}
const ESTADO_CLASS = {
  pendiente:             'bg-accent-50 text-accent-700 ring-accent-100',
  revision_mayoria_edad: 'bg-primary-50 text-primary-700 ring-primary-200',
}

function nombreVecino(v) {
  if (!v) return null
  return v.nombre_completo || null
}

// Modal de aprobación — el checkbox de HC arranca SIEMPRE destildado,
// a propósito: el cliente pidió que dar acceso a la historia clínica
// sea una decisión explícita en cada aprobación, nunca un default.
function AprobarModal({ vinculo, onClose }) {
  const [puedeVerHc, setPuedeVerHc] = useState(false)
  const [error, setError] = useState('')
  const aprobarMut = useAprobarVinculoFamiliar()

  async function handleConfirmar() {
    setError('')
    try {
      await aprobarMut.mutateAsync({
        vinculoId: vinculo.id,
        puedeVerHc,
        titularNombre: nombreVecino(vinculo.titular),
        familiarNombre: vinculo.familiar_nombre,
      })
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos aprobar el vínculo.')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Aprobar vínculo familiar"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={aprobarMut.isPending}>Cancelar</Button>
          <Button onClick={handleConfirmar} loading={aprobarMut.isPending}>Aprobar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-primary-700">
          <strong>{nombreVecino(vinculo.titular) ?? '—'}</strong> va a poder gestionar turnos de{' '}
          <strong>{vinculo.familiar_nombre}</strong> ({PARENTESCO_LABEL[vinculo.parentesco] ?? vinculo.parentesco}).
        </p>
        <div className="rounded-lg border border-border bg-primary-50/40 p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={puedeVerHc}
              onChange={e => setPuedeVerHc(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#C9A84C]"
            />
            <span className="text-sm text-primary-700">
              Dar acceso también a la historia clínica de {vinculo.familiar_nombre}.
            </span>
          </label>
          <p className="mt-2 pl-7 text-xs text-primary-400">
            Sin tildar esto, {nombreVecino(vinculo.titular) ?? 'el titular'} solo puede gestionar turnos —
            no ve diagnóstico, tratamiento ni indicaciones.
          </p>
        </div>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
        )}
      </div>
    </Modal>
  )
}

function RechazarModal({ vinculo, onClose }) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const rechazarMut = useRechazarVinculoFamiliar()

  async function handleConfirmar() {
    if (!motivo.trim()) return
    setError('')
    try {
      await rechazarMut.mutateAsync({
        vinculoId: vinculo.id,
        motivo: motivo.trim(),
        titularNombre: nombreVecino(vinculo.titular),
        familiarNombre: vinculo.familiar_nombre,
      })
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos rechazar el vínculo.')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Rechazar vínculo familiar"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={rechazarMut.isPending}>Cancelar</Button>
          <Button variant="danger" onClick={handleConfirmar} loading={rechazarMut.isPending} disabled={!motivo.trim()}>
            Rechazar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-primary-700">
          Vínculo de <strong>{nombreVecino(vinculo.titular) ?? '—'}</strong> hacia{' '}
          <strong>{vinculo.familiar_nombre}</strong>.
        </p>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Motivo del rechazo <span className="text-danger">*</span>
          </label>
          <textarea
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            rows={3}
            required
            className="input-field w-full"
            placeholder="Ej: el DNI cargado no coincide con el nombre del padrón."
          />
          <p className="mt-1 text-xs text-primary-400">
            El titular va a ver este motivo — que sea claro y accionable.
          </p>
        </div>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
        )}
      </div>
    </Modal>
  )
}

export default function VinculosFamiliaresBandeja({ municipioId }) {
  const { data: vinculos = [], isLoading, error } = useVinculosFamiliaresPendientes(municipioId)
  const [modalAprobar, setModalAprobar]   = useState(null) // vinculo | null
  const [modalRechazar, setModalRechazar] = useState(null) // vinculo | null

  if (isLoading) {
    return <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
  }
  if (error) {
    return (
      <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
        No pudimos cargar los vínculos pendientes: {error.message}
      </div>
    )
  }
  if (vinculos.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-primary-400">
        No hay vínculos familiares pendientes de aprobación.
      </div>
    )
  }

  return (
    <>
      <Table>
        <THead>
            <Tr>
              <Th>Titular</Th>
              <Th>Familiar</Th>
              <Th>Parentesco</Th>
              <Th>En el padrón</Th>
              <Th>DJ aceptada</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </Tr>
          </THead>
          <tbody className="divide-y divide-border">
            {vinculos.map(v => (
              <Tr key={v.id}>
                <Td>
                  <p className="font-medium text-primary">{nombreVecino(v.titular) ?? '—'}</p>
                </Td>
                <Td>
                  <p className="font-medium text-primary">{v.familiar_nombre}</p>
                  <p className="text-xs text-primary-400">DNI {v.familiar_dni}</p>
                </Td>
                <Td>{PARENTESCO_LABEL[v.parentesco] ?? v.parentesco}</Td>
                <Td>
                  {v.familiar_id ? (
                    <span className="inline-flex items-center rounded-full bg-ok-50 px-2 py-0.5 text-[11px] font-semibold text-ok-700 ring-1 ring-inset ring-ok-100">
                      Sí
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-inset ring-accent-100">
                      No — falta cargar en CRM Vecinal
                    </span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-xs text-primary-500">
                  {v.dj_aceptada_en ? dateTimeOf(v.dj_aceptada_en) : '—'}
                </Td>
                <Td>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${ESTADO_CLASS[v.estado] ?? 'bg-primary-50 text-primary-700 ring-primary-200'}`}>
                    {ESTADO_LABEL[v.estado] ?? v.estado}
                  </span>
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setModalAprobar(v)}
                      className="inline-flex h-8 items-center justify-center rounded-md bg-ok px-3 text-xs font-semibold text-white transition-colors hover:bg-ok-600"
                    >
                      Aprobar
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalRechazar(v)}
                      className="inline-flex h-8 items-center justify-center rounded-md px-3 text-xs font-medium text-danger transition-colors hover:bg-red-50"
                    >
                      Rechazar
                    </button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
      </Table>

      {modalAprobar && (
        <AprobarModal vinculo={modalAprobar} onClose={() => setModalAprobar(null)} />
      )}
      {modalRechazar && (
        <RechazarModal vinculo={modalRechazar} onClose={() => setModalRechazar(null)} />
      )}
    </>
  )
}
