import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDatosMunicipio } from '../../hooks/useConfigPortal'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

export default function Register() {
  const { signUp } = useAuth()
  const { identidad } = useDatosMunicipio()
  const logoUrl = identidad?.logo_url || null
  const navigate = useNavigate()
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await signUp({ email, password, nombre })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo del municipio"
              className="mb-2 h-16 w-16 rounded-full bg-primary-50 object-cover ring-1 ring-inset ring-border"
            />
          ) : (
            <span className="text-2xl font-bold text-primary">COMUNAS</span>
          )}
          <p className="mt-1 text-sm text-primary-400">Crear cuenta de vecino</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nombre completo" value={nombre} onChange={e => setNombre(e.target.value)} required />
          <Input label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          <Input label="Contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">Crear cuenta</Button>
        </form>

        <p className="mt-6 text-center text-xs text-primary-400">
          ¿Ya tenés cuenta? <Link to="/login" className="font-semibold text-primary hover:underline">Ingresar</Link>
        </p>
      </div>
    </div>
  )
}
