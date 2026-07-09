import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import PortalFormPage from '../../components/portal/PortalFormPage'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }

    setSubmitting(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) throw updateError

      setSuccess(true)
      setTimeout(() => navigate('/portal/acceso'), 2000)
    } catch (e) {
      setError(e?.message ?? 'No pudimos actualizar la contraseña')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <PortalFormPage
        titulo="Contraseña actualizada"
        descripcion="Tu contraseña fue cambiada exitosamente."
        compact
      >
        <div className="mx-auto max-w-[420px]">
          <div className="card p-5">
            <div className="rounded-md border border-[#1D4ED8] bg-[#1D4ED8]/10 p-3 text-sm text-[#0F1C35]">
              <p className="font-sora font-semibold">✓ Contraseña actualizada</p>
              <p className="mt-2 text-xs">
                Redirigiendo al portal...
              </p>
            </div>
          </div>
        </div>
      </PortalFormPage>
    )
  }

  return (
    <PortalFormPage
      titulo="Nueva contraseña"
      descripcion="Ingresá tu nueva contraseña."
      compact
    >
      <div className="mx-auto max-w-[420px]">
        <div className="card p-5">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Input
              label="Nueva contraseña"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
            />
            <Input
              label="Confirmar contraseña"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              placeholder="Repetir contraseña"
            />

            {error && (
              <div className="rounded-md border border-red-100 bg-red-50 p-2 text-xs text-danger">
                {error}
              </div>
            )}

            <Button
              type="submit"
              loading={submitting}
              disabled={!password || !confirmPassword}
              className="w-full"
            >
              Cambiar contraseña
            </Button>

            <button
              type="button"
              onClick={() => navigate('/portal/acceso')}
              className="text-center text-xs font-semibold text-[#C9A84C] hover:underline"
            >
              Cancelar
            </button>
          </form>
        </div>
      </div>
    </PortalFormPage>
  )
}
