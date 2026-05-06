import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { mensajesByVecino } from '../../lib/mockData'
import { useVecino } from '../../hooks/useVecinos'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import Tabs from '../../components/ui/Tabs'
import VecinoDatos    from '../../components/crm/VecinoDatos'
import VecinoHC       from '../../components/crm/VecinoHC'
import VecinoTurnos   from '../../components/crm/VecinoTurnos'
import VecinoMensajes from '../../components/crm/VecinoMensajes'

// "Apellido, Nombre" si están separados; nombre_completo si no.
function displayName(v) {
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Sin nombre'
}

// "Nombre Apellido" para iniciales del Avatar; nombre_completo si no.
function avatarName(v) {
  if (v.nombre && v.apellido) return `${v.nombre} ${v.apellido}`
  return v.nombre_completo || v.apellido || v.nombre || '?'
}

export default function VecinoDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { vecino: v, isLoading, error } = useVecino(id)
  const [tab, setTab] = useState('datos')

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center p-10">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/admin/crm')}
          className="text-sm text-primary-400 transition-colors hover:text-primary"
        >
          ← Volver al padrón
        </button>
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar el vecino: {error.message}
        </div>
      </div>
    )
  }

  if (!v) {
    return (
      <div className="card p-10 text-center">
        <p className="text-primary-500">No se encontró el vecino.</p>
        <Button variant="secondary" onClick={() => navigate('/admin/crm')} className="mt-4">
          Volver al padrón
        </Button>
      </div>
    )
  }

  // HC y Turnos se autoabastecen vía useParams. SMS sigue con mock
  // por ahora — se conecta en una iteración posterior.
  const mensajesV = mensajesByVecino(id)

  const tabs = [
    { value: 'datos',    label: 'Datos' },
    { value: 'hc',       label: 'HC' },
    { value: 'turnos',   label: 'Turnos' },
    { value: 'mensajes', label: 'SMS',    count: mensajesV.length },
  ]

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate('/admin/crm')}
        className="text-sm text-primary-400 transition-colors hover:text-primary"
      >
        ← Volver al padrón
      </button>

      <div className="card p-6">
        <div className="flex items-center gap-4">
          <Avatar name={avatarName(v)} size="lg" />
          <div>
            <h1 className="text-xl font-bold text-primary">{displayName(v)}</h1>
            <p className="text-sm text-primary-400">
              {v.dni ? `DNI ${v.dni}` : 'Sin DNI'}
              {v.barrio ? ` · ${v.barrio}` : ''}
            </p>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <div>
        {tab === 'datos'    && <VecinoDatos vecino={v} />}
        {tab === 'hc'       && <VecinoHC />}
        {tab === 'turnos'   && <VecinoTurnos />}
        {tab === 'mensajes' && <VecinoMensajes mensajes={mensajesV} />}
      </div>
    </div>
  )
}
