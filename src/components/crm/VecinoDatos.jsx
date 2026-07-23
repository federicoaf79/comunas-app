import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { updateVecino } from '../../hooks/useVecinos'
import Button from '../ui/Button'
import VecinoFormModal from './VecinoFormModal'

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-primary-400">{label}</p>
      <p className="mt-1 text-sm text-primary-700">{value || '—'}</p>
    </div>
  )
}

const SEXO_LABEL = { F: 'Femenino', M: 'Masculino', X: 'Otro' }

export default function VecinoDatos({ vecino }) {
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)

  async function handleSave(data) {
    await updateVecino(vecino.id, data)
    qc.invalidateQueries({ queryKey: ['vecino', vecino.id] })
    qc.invalidateQueries({ queryKey: ['vecinos'] })
  }

  const tieneAlergias   = vecino.alergias?.length > 0
  const sinAlergias     = vecino.sin_alergias_conocidas && !tieneAlergias
  const alergiasSinDato = !tieneAlergias && !sinAlergias
  const tieneContacto   = vecino.contacto_emergencia_nombre || vecino.contacto_emergencia_telefono

  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-primary-700">Datos personales</h3>
        <Button size="sm" variant="secondary" onClick={() => setEditOpen(true)}>
          Editar
        </Button>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Nombre"     value={vecino.nombre} />
        <Field label="Apellido"   value={vecino.apellido} />
        <Field label="DNI"        value={vecino.dni} />
        <Field label="Sexo"       value={SEXO_LABEL[vecino.sexo]} />
        <Field label="Fecha de nacimiento" value={vecino.fecha_nac} />
        <Field label="Teléfono"   value={vecino.telefono} />
        <Field label="Email"      value={vecino.email} />
        <Field label="Barrio"     value={vecino.barrio} />
        <Field label="Dirección"  value={vecino.direccion} />
        <Field label="Grupo sanguíneo" value={vecino.grupo_sanguineo} />
        <Field
          label="Contacto de emergencia"
          value={tieneContacto
            ? [vecino.contacto_emergencia_nombre, vecino.contacto_emergencia_telefono].filter(Boolean).join(' · ')
            : null}
        />
      </div>

      {/* Alergias — mismo criterio visual que AtencionDrawer.jsx: alerta
          prominente si hay alergias cargadas, para que también se vea
          fuera del flujo de atención (antes solo se mostraba ahí). */}
      <div className="mt-5">
        <p className="text-xs uppercase tracking-wide text-primary-400">Alergias</p>
        {tieneAlergias && (
          <div className="mt-1 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-danger">
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4M12 16h.01" />
            </svg>
            <span className="text-sm font-semibold text-danger">
              {vecino.alergias.join(', ')}
            </span>
          </div>
        )}
        {sinAlergias && (
          <p className="mt-1 text-sm text-primary-700">Sin alergias conocidas (confirmado)</p>
        )}
        {alergiasSinDato && (
          <p className="mt-1 text-sm text-primary-400">—</p>
        )}
      </div>

      <VecinoFormModal
        open={editOpen}
        vecino={vecino}
        onClose={() => setEditOpen(false)}
        onSubmit={handleSave}
      />
    </div>
  )
}
