import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth, homeRouteFor } from '../../context/AuthContext'
import { useDatosMunicipio, usePortalMunicipioId } from '../../hooks/useConfigPortal'
import { supabase } from '../../lib/supabase'
import { registrarAcceso, registrarIntentoFallido } from '../../hooks/useAuditLog'
import { traducirErrorAuth } from '../../lib/authErrors'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import FormError from '../../components/ui/FormError'

export default function Login() {
  const { signIn, signOut } = useAuth()
  const { identidad } = useDatosMunicipio()
  const logoUrl = identidad?.logo_url || null
  // Municipio del SUBDOMINIO, no del perfil (que todavía no existe acá) --
  // mismo hook que usa todo el portal público para lo mismo.
  const { data: municipioId } = usePortalMunicipioId()
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
      // Sin await -- el usuario tiene que ver el error al instante.
      registrarIntentoFallido({ email, via: 'login_staff' })
      setLoading(false)
      setError(traducirErrorAuth(signInError.message))
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

    // Se autenticó: el acceso queda registrado acá, sin esperar a los
    // chequeos de abajo (usuarios, activo, rol). Si alguno de esos
    // rechaza el ingreso, el LOGIN igual ocurrió de verdad.
    await registrarAcceso({ resultado: 'exito', via: 'login_staff', userId, email: data.user.email, municipioId })

    const { data: u, error: perfilError } = await supabase
      .from('usuarios')
      .select('roles, activo, aprobado_en')
      .eq('id', userId)
      .maybeSingle()

    if (perfilError) {
      setLoading(false)
      setError('No pudimos cargar tu perfil. Probá de nuevo.')
      return
    }

    if (!u) {
      await registrarAcceso({
        resultado: 'rechazado', via: 'login_staff', userId, email: data.user.email, municipioId,
        motivo: 'Cuenta sin habilitar — sin fila de staff en usuarios',
      })
      await signOut()
      setLoading(false)
      setError('Tu cuenta aún no fue habilitada en el sistema. Contactá al administrador de tu comuna.')
      return
    }

    // aprobado_en distingue "invitación nunca aprobada todavía" de
    // "estaba activa y la desactivaron" — mismo booleano `activo` para
    // los dos casos, así que sin esta columna un empleado recién
    // invitado (que hizo todo bien) leía "deshabilitada", texto que
    // suena a sanción y contradice lo que el mail de invitación le
    // prometió ("tu cuenta va a quedar en revisión hasta que un
    // administrador la habilite").
    if (u.activo === false) {
      await registrarAcceso({
        resultado: 'rechazado', via: 'login_staff', userId, email: data.user.email, municipioId,
        motivo: u.aprobado_en ? 'Cuenta deshabilitada' : 'Cuenta pendiente de aprobación',
      })
      await signOut()
      setLoading(false)
      setError(u.aprobado_en
        ? 'Tu cuenta fue deshabilitada. Contactá al administrador.'
        : 'Tu cuenta está esperando aprobación. Avisale al administrador de tu municipio para que la habilite.')
      return
    }

    const route = homeRouteFor(u.roles)
    if (!route) {
      await registrarAcceso({
        resultado: 'rechazado', via: 'login_staff', userId, email: data.user.email, municipioId,
        motivo: 'Sin rol asignado',
      })
      await signOut()
      setLoading(false)
      setError('Tu cuenta no tiene un rol asignado. Contactá al administrador.')
      return
    }

    setLoading(false)
    navigate(route, { replace: true })
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-md flex-col gap-3">
        {/* Link de retorno al portal — arriba a la izquierda del card,
            mismo patrón que el botón Volver de las páginas del portal
            pero en navy sobre fondo claro y sin subrayado en hover. */}
        <Link
          to="/portal"
          className="inline-flex items-center gap-2 self-start rounded-md px-2 py-1 text-sm font-medium text-primary no-underline transition-colors hover:bg-primary-50 hover:text-primary-700"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Volver al portal
        </Link>

        <div className="card w-full p-8">
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
          <FormError>{error}</FormError>
          <Button type="submit" loading={loading} className="w-full">
            Ingresar
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-primary-400">
          ¿No tenés cuenta? <Link to="/portal/acceso?tab=registro" className="font-semibold text-primary hover:underline">Registrate</Link>
        </p>
        </div>
      </div>
    </div>
  )
}
