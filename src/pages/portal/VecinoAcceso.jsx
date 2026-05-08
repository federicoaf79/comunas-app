import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'
import { findVecinoByDniTelefono } from '../../hooks/useVecinoData'
import PortalFormPage from '../../components/portal/PortalFormPage'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

export default function VecinoAcceso() {
  const navigate = useNavigate()
  const { setVecinoSession, isVecinoLogued } = useVecino()
  const [dni, setDni]       = useState('')
  const [telefono, setTel]  = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]   = useState('')

  // Si ya hay sesión, ir directo al dashboard. Evita que el vecino
  // re-loguee si vuelve a /mi-cuenta/acceso después de entrar.
  useEffect(() => {
    if (isVecinoLogued) navigate('/mi-cuenta', { replace: true })
  }, [isVecinoLogued, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const vecino = await findVecinoByDniTelefono({ dni, telefono })
      if (!vecino) {
        setError(
          'No encontramos tu cuenta. Verificá el DNI y el celular, ' +
          'o registrate sacando un turno desde el portal.'
        )
        return
      }
      // Guardamos también el teléfono ingresado (limpio) para que la
      // RPC de HC pueda usarlo después sin volver a pedirlo.
      setVecinoSession({
        ...vecino,
        telefono_login: telefono.replace(/[^0-9]/g, ''),
      })
      navigate('/mi-cuenta', { replace: true })
    } catch (e) {
      setError(e?.message ?? 'No pudimos verificar tu identidad. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!dni.trim() && !!telefono.trim()

  return (
    <PortalFormPage
      titulo="Mi cuenta"
      descripcion="Ingresá con tu DNI y celular registrado para acceder a tus turnos, tu historia clínica y los datos de tu familia."
    >
      <form onSubmit={handleSubmit} className="card flex flex-col gap-5 p-5 sm:p-6">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
            Verificá tu identidad
          </h3>
          <p className="mt-1 text-sm text-primary-500">
            Usá el DNI y el celular con el que te registraste en la Comisión.
          </p>
        </div>

        <Input
          label="DNI"
          value={dni}
          onChange={e => setDni(e.target.value)}
          required
          inputMode="numeric"
          type="text"
          autoComplete="off"
          placeholder="Ej: 32145678"
        />
        <Input
          label="Teléfono celular"
          value={telefono}
          onChange={e => setTel(e.target.value)}
          required
          inputMode="tel"
          type="tel"
          autoComplete="tel"
          placeholder="+54 9 ..."
        />

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
            {error}
          </div>
        )}

        <Button
          type="submit"
          loading={submitting}
          disabled={!canSubmit}
          className="w-full"
        >
          Ingresar a mi cuenta
        </Button>

        <div className="border-t border-border pt-4 text-center">
          <p className="text-sm text-primary-500">
            ¿No tenés cuenta todavía?
          </p>
          <Link
            to="/portal/turno"
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700 hover:text-accent-800"
          >
            Registrate sacando un turno
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </form>
    </PortalFormPage>
  )
}
