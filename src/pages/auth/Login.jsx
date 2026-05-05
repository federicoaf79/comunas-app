import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth, homeRouteFor } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const expired = location.state?.expired

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: signInError } = await signIn({ email, password })
    if (signInError) {
      setLoading(false)
      setError(signInError.message)
      return
    }

    // Resolver destino según el rol antes de navegar.
    // Hacemos el fetch acá (en vez de esperar al state del context) para
    // poder validar inmediatamente y mostrar el error correcto.
    const userId = data?.user?.id
    if (!userId) {
      setLoading(false)
      setError('No se pudo iniciar sesión.')
      return
    }

    const { data: u, error: perfilError } = await supabase
      .from('usuarios')
      .select('roles, activo')
      .eq('id', userId)
      .maybeSingle()

    if (perfilError) {
      setLoading(false)
      setError('No pudimos cargar tu perfil. Probá de nuevo.')
      return
    }

    if (!u) {
      await supabase.auth.signOut()
      setLoading(false)
      setError('Tu cuenta aún no fue habilitada en el sistema. Contactá al administrador de tu comuna.')
      return
    }

    if (u.activo === false) {
      await supabase.auth.signOut()
      setLoading(false)
      setError('Tu cuenta está deshabilitada. Contactá al administrador.')
      return
    }

    const route = homeRouteFor(u.roles)
    if (!route) {
      await supabase.auth.signOut()
      setLoading(false)
      setError('Tu cuenta no tiene un rol asignado. Contactá al administrador.')
      return
    }

    setLoading(false)
    navigate(route, { replace: true })
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <span className="text-2xl font-bold text-primary">COMUNAS</span>
          <p className="mt-1 text-sm text-primary-400">Ingresá al sistema</p>
        </div>

        {expired && (
          <div className="mb-4 rounded-md border border-accent-200 bg-accent-50 p-3 text-xs text-accent-700">
            Tu sesión expiró. Iniciá sesión nuevamente.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          <Input
            label="Contraseña"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            Ingresar
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-primary-400">
          ¿No tenés cuenta? <Link to="/register" className="font-semibold text-primary hover:underline">Registrate</Link>
        </p>
      </div>
    </div>
  )
}
