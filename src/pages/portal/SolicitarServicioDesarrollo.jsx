// src/pages/portal/SolicitarServicioDesarrollo.jsx
// Formulario de solicitud de Agencia de Desarrollo — Servicios Rurales

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useCrearSolicitud } from '../../hooks/useSolicitudesDesarrollo'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import { todayArgYMD } from '../../lib/datetime'

const TIPOS_SERVICIO = [
  'Romeo del campo',
  'Limpieza de represa',
  'Agua',
  'Otro',
]

export default function SolicitarServicioDesarrollo() {
  const navigate = useNavigate()
  const { vecino, municipioId } = useAuth()

  // AUTH GUARD: requiere cuenta supabase (email/password)
  if (!vecino) {
    return (
      <div className="container max-w-2xl py-6 sm:py-10">
        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Inicio de sesión requerido
            </h3>
            <p className="mt-2 text-sm text-primary-600">
              Para solicitar servicios rurales necesitás ingresar con tu cuenta.
            </p>
            <Button
              onClick={() => navigate('/portal/login')}
              className="mt-4"
            >
              Iniciar sesión
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (vecino.auth_mode !== 'supabase') {
    return (
      <div className="container max-w-2xl py-6 sm:py-10">
        <div className="card border-accent-100 bg-accent-50 p-6 sm:p-8">
          <div className="mx-auto max-w-lg text-center">
            <div className="mb-4 text-5xl">🔒</div>
            <h3 className="font-sora text-lg font-bold text-primary">
              Cuenta completa requerida
            </h3>
            <p className="mt-2 text-sm text-primary-600">
              Para solicitar servicios rurales necesitás crear una cuenta completa con email y contraseña.
              El acceso rápido (DNI + teléfono) no permite hacer solicitudes.
            </p>
            <Button
              onClick={() => navigate('/register')}
              className="mt-4"
            >
              Crear cuenta
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // STATE
  const [tipoServicio, setTipoServicio] = useState('')
  const [fechaPreferida, setFechaPreferida] = useState('')
  const [notas, setNotas] = useState('')

  // MUTATION
  const crearSolicitud = useCrearSolicitud()

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!tipoServicio) {
      alert('Por favor seleccioná el tipo de servicio')
      return
    }

    if (!notas || notas.trim().length === 0) {
      alert('Por favor describí tu solicitud en el campo de notas')
      return
    }

    try {
      await crearSolicitud.mutateAsync({
        municipio_id: municipioId,
        vecino_id: vecino.id,
        tipo_servicio: tipoServicio,
        fecha_preferida: fechaPreferida || null,
        notas: notas.trim(),
      })

      alert('✅ Solicitud enviada exitosamente. Estado: En lista de espera.')
      navigate('/portal/mis-solicitudes-desarrollo')
    } catch (err) {
      alert(`❌ Error: ${err.message}`)
    }
  }

  return (
    <div className="container max-w-2xl py-6 sm:py-10">
      <div className="mb-6">
        <h1 className="font-sora text-2xl font-bold text-primary sm:text-3xl">
          Solicitar Servicio Rural
        </h1>
        <p className="mt-1 text-sm text-primary-500">
          Agencia de Desarrollo — Completá el formulario para enviar tu solicitud
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        {/* Tipo de servicio */}
        <div>
          <label className="mb-1 block text-sm font-medium text-primary">
            Tipo de servicio <span className="text-danger">*</span>
          </label>
          <Select
            value={tipoServicio}
            onChange={e => setTipoServicio(e.target.value)}
            required
          >
            <option value="">-- Seleccioná --</option>
            {TIPOS_SERVICIO.map(tipo => (
              <option key={tipo} value={tipo}>{tipo}</option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-primary-500">
            Elegí el servicio que necesitás o "Otro" para consultas específicas
          </p>
        </div>

        {/* Fecha preferida (opcional) */}
        <div>
          <label className="mb-1 block text-sm font-medium text-primary">
            Fecha preferida (opcional)
          </label>
          <input
            type="date"
            value={fechaPreferida}
            onChange={e => setFechaPreferida(e.target.value)}
            min={todayArgYMD()}
            className="input w-full"
          />
          <p className="mt-1.5 text-xs text-primary-500">
            Podés sugerir una fecha. La Agencia la confirmará o reprogramará al aprobar tu solicitud.
          </p>
        </div>

        {/* Notas / Ubicación / Detalle */}
        <div>
          <label className="mb-1 block text-sm font-medium text-primary">
            Detalle de la solicitud <span className="text-danger">*</span>
          </label>
          <textarea
            value={notas}
            onChange={e => setNotas(e.target.value)}
            className="input w-full"
            rows={5}
            placeholder="Describí tu solicitud: ubicación, detalles específicos, horarios preferidos, etc."
            required
          />
          <p className="mt-1.5 text-xs text-primary-500">
            Incluí toda la información relevante: ubicación exacta, referencias, problemática, etc.
          </p>
        </div>

        {/* Info adicional */}
        <div className="rounded border border-accent bg-accent/10 p-4 text-sm text-primary-600">
          <p className="font-medium text-primary">ℹ️ Importante</p>
          <ul className="mt-2 ml-4 list-disc space-y-1 text-xs">
            <li>Tu solicitud quedará en lista de espera</li>
            <li>El personal de la Agencia revisará y aprobará tu solicitud</li>
            <li>Te notificaremos por WhatsApp cuando se apruebe y coordine la fecha definitiva</li>
          </ul>
        </div>

        {/* Botón */}
        <Button
          type="submit"
          disabled={crearSolicitud.isPending}
          className="w-full"
        >
          {crearSolicitud.isPending ? 'Enviando solicitud...' : 'Enviar Solicitud'}
        </Button>
      </form>
    </div>
  )
}
