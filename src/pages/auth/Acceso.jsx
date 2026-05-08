import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, homeRouteFor } from '../../context/AuthContext'
import { useVecino } from '../../context/VecinoContext'
import { findVecinoByDniTelefono } from '../../hooks/useVecinoData'
import { supabase } from '../../lib/supabase'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'

// ─────────────────────────────────────────────────────────────────
// Header simple — alineado a /portal con escudo y botón Volver
// ─────────────────────────────────────────────────────────────────

function Escudo({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="escudo-acceso-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#C9A84C" />
          <stop offset="1" stopColor="#7E682B" />
        </linearGradient>
      </defs>
      <path
        d="M24 2 L42 8 V24 C42 35 33 43 24 46 C15 43 6 35 6 24 V8 L24 2 Z"
        fill="url(#escudo-acceso-bg)"
        stroke="#0F1C35"
        strokeWidth="1.5"
      />
      <path
        d="M24 12 L26 19 L33 19 L27.5 23 L29.5 30 L24 26 L18.5 30 L20.5 23 L15 19 L22 19 Z"
        fill="#0F1C35"
      />
    </svg>
  )
}

function AccesoHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-primary-900 bg-primary text-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/portal" className="flex items-center gap-3 text-white">
          <Escudo className="h-9 w-9 shrink-0" />
          <div className="leading-tight">
            <p className="font-sora text-sm font-bold sm:text-base">{MUNICIPIO_NOMBRE}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">
              Acceso al sistema
            </p>
          </div>
        </Link>
        <Link
          to="/portal"
          className="inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          <span className="hidden sm:inline">Volver al portal</span>
          <span className="sm:hidden">Volver</span>
        </Link>
      </div>
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────
// Chooser — dos cards grandes "Soy vecino" / "Soy del municipio"
// ─────────────────────────────────────────────────────────────────

function ChooserCard({ icon, title, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-start gap-3 rounded-xl border-2 border-border bg-white p-6 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-lg sm:p-7"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-primary text-accent transition-colors group-hover:bg-primary-900">
        {icon}
      </div>
      <div className="flex-1">
        <p className="font-sora text-lg font-bold text-primary sm:text-xl">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-primary-500 sm:text-base">{desc}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent-700 group-hover:text-accent-800">
        Continuar
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  )
}

function ModeChooser({ onPick }) {
  return (
    <section className="animate-fade-in">
      <h2 className="font-sora text-2xl font-bold text-primary sm:text-3xl">
        ¿Cómo querés ingresar?
      </h2>
      <p className="mt-2 text-base text-primary-500 sm:text-lg">
        Elegí la opción que corresponde a tu rol en la Comisión.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 sm:gap-5">
        <ChooserCard
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-8 w-8" aria-hidden="true">
              <circle cx="12" cy="8" r="4" />
              <path strokeLinecap="round" d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          }
          title="Soy vecino"
          desc="Accedé con tu DNI y celular registrado."
          onClick={() => onPick('vecino')}
        />
        <ChooserCard
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-8 w-8" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M8 11h.01M12 11h.01M16 11h.01" />
            </svg>
          }
          title="Soy del municipio"
          desc="Ingresá con tu usuario y contraseña."
          onClick={() => onPick('admin')}
        />
      </div>

      <p className="mt-8 text-center text-sm text-primary-500">
        ¿Es la primera vez que usás el portal?{' '}
        <Link to="/portal/turno" className="font-semibold text-accent-700 hover:text-accent-800">
          Sacá un turno acá
        </Link>
      </p>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Form: Soy vecino — DNI + teléfono → sesión local
// ─────────────────────────────────────────────────────────────────

function VecinoForm({ onBack }) {
  const navigate = useNavigate()
  const { setVecinoSession } = useVecino()
  const [dni, setDni] = useState('')
  const [telefono, setTel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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
    <section className="animate-fade-in">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-500 hover:text-primary"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Cambiar opción
      </button>

      <h2 className="font-sora text-2xl font-bold text-primary sm:text-3xl">
        Acceso del vecino
      </h2>
      <p className="mt-2 text-sm text-primary-500 sm:text-base">
        Usá el DNI y el celular con el que te registraste en la Comisión.
      </p>

      <form onSubmit={handleSubmit} className="portal-form-page mt-6 card flex flex-col gap-5 p-5 sm:p-6">
        <Input
          label="DNI"
          value={dni}
          onChange={e => setDni(e.target.value)}
          required
          inputMode="numeric"
          type="text"
          autoComplete="off"
          placeholder="Ej: 32145678"
          autoFocus
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
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Form: Soy del municipio — email + password (Supabase auth)
// Mismo flujo que /login: signIn → verificar perfil → redirigir.
// ─────────────────────────────────────────────────────────────────

function MunicipioForm({ onBack }) {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
    <section className="animate-fade-in">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-500 hover:text-primary"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6" />
        </svg>
        Cambiar opción
      </button>

      <h2 className="font-sora text-2xl font-bold text-primary sm:text-3xl">
        Acceso al sistema
      </h2>
      <p className="mt-2 text-sm text-primary-500 sm:text-base">
        Personal de la Comisión Municipal — usuario y contraseña.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 card flex flex-col gap-4 p-6 sm:p-7">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
        />
        <Input
          label="Contraseña"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
            {error}
          </div>
        )}
        <Button type="submit" loading={loading} className="w-full">
          Ingresar
        </Button>
        <p className="text-center text-xs text-primary-400">
          ¿No tenés cuenta?{' '}
          <Link to="/register" className="font-semibold text-primary hover:underline">
            Registrate
          </Link>
        </p>
      </form>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function Acceso() {
  const navigate = useNavigate()
  const { perfil, loading: authLoading } = useAuth()
  const { isVecinoLogued } = useVecino()
  const [mode, setMode] = useState(null) // null | 'vecino' | 'admin'

  // Redirección automática si ya hay sesión activa.
  // - Sesión admin (Supabase auth con perfil cargado): a /admin o /superadmin.
  // - Sesión vecino (sessionStorage): a /mi-cuenta.
  // El flag authLoading evita parpadeos en el primer render mientras
  // el AuthContext hidrata el perfil desde el cache.
  useEffect(() => {
    if (authLoading) return
    if (perfil?.roles) {
      const route = homeRouteFor(perfil.roles)
      if (route) {
        navigate(route, { replace: true })
        return
      }
    }
    if (isVecinoLogued) {
      navigate('/mi-cuenta', { replace: true })
    }
  }, [authLoading, perfil, isVecinoLogued, navigate])

  return (
    <div className="min-h-svh bg-background">
      <AccesoHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {mode === null && <ModeChooser onPick={setMode} />}
        {mode === 'vecino' && <VecinoForm onBack={() => setMode(null)} />}
        {mode === 'admin'  && <MunicipioForm onBack={() => setMode(null)} />}
      </main>
    </div>
  )
}
