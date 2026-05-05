import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
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
    const { error } = await signIn({ email, password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/', { replace: true })
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
