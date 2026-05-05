import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  vecinoById,
  consultasByVecino,
  turnosByVecino,
  mensajesByVecino,
} from '../../lib/mockData'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import VecinoDatos    from '../../components/crm/VecinoDatos'
import VecinoHC       from '../../components/crm/VecinoHC'
import VecinoTurnos   from '../../components/crm/VecinoTurnos'
import VecinoMensajes from '../../components/crm/VecinoMensajes'

export default function VecinoDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const v = vecinoById(id)
  const [tab, setTab] = useState('datos')

  if (!v) {
    return (
      <div className="card p-10 text-center">
        <p className="text-primary-500">No se encontró el vecino.</p>
        <Button variant="secondary" onClick={() => navigate('/admin/crm')} className="mt-4">
          Volver
        </Button>
      </div>
    )
  }

  const consultas = consultasByVecino(id)
  const turnosV   = turnosByVecino(id)
  const mensajesV = mensajesByVecino(id)

  const tabs = [
    { value: 'datos',    label: 'Datos' },
    { value: 'hc',       label: 'HC',     count: consultas.length },
    { value: 'turnos',   label: 'Turnos', count: turnosV.length },
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
          <Avatar name={`${v.nombre} ${v.apellido}`} size="lg" />
          <div>
            <h1 className="text-xl font-bold text-primary">
              {v.apellido}, {v.nombre}
            </h1>
            <p className="text-sm text-primary-400">DNI {v.dni} · {v.barrio}</p>
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      <div>
        {tab === 'datos'    && <VecinoDatos vecino={v} />}
        {tab === 'hc'       && <VecinoHC consultas={consultas} />}
        {tab === 'turnos'   && <VecinoTurnos turnos={turnosV} />}
        {tab === 'mensajes' && <VecinoMensajes mensajes={mensajesV} />}
      </div>
    </div>
  )
}
