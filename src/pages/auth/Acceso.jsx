import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, homeRouteFor } from '../../context/AuthContext'
import { useVecino } from '../../context/VecinoContext'
import { findVecinoByDniTelefono } from '../../hooks/useVecinoData'
import { supabase } from '../../lib/supabase'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'

// =============================================================
// Acceso unificado — flujo progresivo de 3 pasos:
//
//   Paso 1 · Identificación: DNI + teléfono + email
//            (busca el vecino en la tabla vecinos por DNI+tel)
//   Paso 2 · Tipo de acceso: vecino o empleado municipal
//   Paso 3 · Contraseña (sólo empleados municipales)
//
// Una sola ruta, una sola página, sin navegar entre rutas.
// El email del paso 1 precarga el del paso 3 (editable).
// La sesión efectiva se crea SOLO al finalizar — no en el paso 1.
// =============================================================

// ─────────────────────────────────────────────────────────────────
// Header simple
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
// Indicador de pasos — muestra al usuario en qué etapa va
// ─────────────────────────────────────────────────────────────────

function StepIndicator({ step, total = 3 }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label={`Paso ${step} de ${total}`}>
      {Array.from({ length: total }, (_, i) => i + 1).map(n => {
        const active = n === step
        const done   = n < step
        return (
          <li key={n} className="flex items-center gap-2">
            <span
              className={
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ' +
                (done
                  ? 'bg-primary text-white'
                  : active
                  ? 'bg-accent text-primary-900'
                  : 'bg-primary-50 text-primary-400 ring-1 ring-inset ring-border')
              }
            >
              {done ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : n}
            </span>
            {n < total && <span className="h-px w-6 bg-border" aria-hidden="true" />}
          </li>
        )
      })}
    </ol>
  )
}

// ─────────────────────────────────────────────────────────────────
// PASO 1 · Identificación común (DNI + teléfono + email)
// ─────────────────────────────────────────────────────────────────

function StepIdentificacion({
  dni, telefono, email,
  onChange,
  submitting, error,
  onSubmit,
}) {
  // Email es opcional — el ingreso se habilita con DNI + teléfono.
  // Si el usuario lo completa se persiste en la sesión y el paso 3
  // (empleados municipales) lo pre-rellena.
  const canSubmit = dni.trim() && telefono.trim()
  return (
    <section className="animate-fade-in">
      <StepIndicator step={1} />
      <h1 className="font-sora text-2xl font-bold leading-tight text-primary sm:text-3xl">
        Identificate
      </h1>
      <p className="mt-2 text-sm text-primary-500 sm:text-base">
        Vamos a verificar tu identidad antes de seguir. Usá los datos con los que
        te registraste en la Comisión Municipal.
      </p>

      <form onSubmit={onSubmit} className="portal-form-page mt-6 card flex flex-col gap-5 p-5 sm:p-6">
        <Input
          label="DNI"
          value={dni}
          onChange={e => onChange('dni', e.target.value)}
          required
          inputMode="numeric"
          type="text"
          autoComplete="off"
          autoFocus
          placeholder="Ej: 32145678"
        />
        <div>
          <Input
            label="Teléfono celular"
            value={telefono}
            onChange={e => onChange('telefono', e.target.value)}
            required
            inputMode="tel"
            type="tel"
            autoComplete="tel"
            placeholder="3854123456"
          />
          <p className="mt-1 text-xs text-gray-500">
            Sin el +54, solo el número celular
          </p>
        </div>
        <div>
          <Input
            label="Email"
            value={email}
            onChange={e => onChange('email', e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
          />
          <p className="mt-1 text-xs text-gray-500">Opcional</p>
        </div>

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
          Continuar
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </Button>

        <div className="border-t border-border pt-4 text-center">
          <p className="text-sm text-primary-500">¿No tenés cuenta todavía?</p>
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
// PASO 2 · Elegir tipo de acceso (vecino vs empleado municipal)
// ─────────────────────────────────────────────────────────────────

function ChoiceCard({ icon, title, desc, primary = false, onClick }) {
  const accent = primary
    ? 'border-primary bg-primary text-white hover:bg-primary-600'
    : 'border-border bg-white text-primary hover:border-primary hover:shadow-lg'
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'group flex flex-col items-start gap-3 rounded-xl border-2 p-5 text-left transition-all hover:-translate-y-0.5 sm:p-6 ' + accent
      }
    >
      <div
        className={
          'flex h-12 w-12 items-center justify-center rounded-lg ' +
          (primary ? 'bg-white/15 text-accent' : 'bg-primary text-accent group-hover:bg-primary-900')
        }
      >
        {icon}
      </div>
      <div>
        <p className="font-sora text-lg font-bold sm:text-xl">{title}</p>
        <p className={'mt-1 text-sm leading-relaxed sm:text-base ' + (primary ? 'text-white/80' : 'text-primary-500')}>
          {desc}
        </p>
      </div>
      <span
        className={
          'mt-1 inline-flex items-center gap-1.5 text-sm font-semibold ' +
          (primary ? 'text-accent' : 'text-accent-700 group-hover:text-accent-800')
        }
      >
        Continuar
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  )
}

function StepTipo({ vecino, onPickVecino, onPickMunicipio, onBack }) {
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
        Volver
      </button>

      <StepIndicator step={2} />
      <h1 className="font-sora text-2xl font-bold leading-tight text-primary sm:text-3xl">
        Hola, {vecino?.nombre || 'vecino'}
      </h1>
      <p className="mt-2 text-sm text-primary-500 sm:text-base">
        ¿Sos empleado municipal?
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 sm:gap-5">
        <ChoiceCard
          primary
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-7 w-7" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          }
          title="Ingresar como vecino"
          desc="Accedé a tus turnos, salud y datos."
          onClick={onPickVecino}
        />
        <ChoiceCard
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-7 w-7" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6M8 11h.01M12 11h.01M16 11h.01" />
            </svg>
          }
          title="Ingresar al sistema municipal"
          desc="Para empleados de la Comisión."
          onClick={onPickMunicipio}
        />
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// PASO 3 · Contraseña del empleado municipal
// ─────────────────────────────────────────────────────────────────

function StepMunicipio({
  email, password,
  onChange,
  submitting, error,
  onSubmit, onBack,
}) {
  const canSubmit = email.trim() && password.length > 0
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
        Volver
      </button>

      <StepIndicator step={3} />
      <h1 className="font-sora text-2xl font-bold leading-tight text-primary sm:text-3xl">
        Acceso al sistema municipal
      </h1>
      <p className="mt-2 text-sm text-primary-500 sm:text-base">
        Ingresá tu contraseña para acceder al panel de gestión.
      </p>

      <form onSubmit={onSubmit} className="portal-form-page mt-6 card flex flex-col gap-5 p-5 sm:p-6">
        <Input
          label="Email"
          value={email}
          onChange={e => onChange('email', e.target.value)}
          required
          type="email"
          autoComplete="email"
        />
        <Input
          label="Contraseña"
          value={password}
          onChange={e => onChange('password', e.target.value)}
          required
          type="password"
          autoComplete="current-password"
          autoFocus
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
          Ingresar al sistema
        </Button>
      </form>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal — orquesta los 3 pasos
// ─────────────────────────────────────────────────────────────────

export default function Acceso() {
  const navigate = useNavigate()
  const { signIn, perfil, loading: authLoading } = useAuth()
  const { setVecinoSession, isVecinoLogued } = useVecino()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    dni:      '',
    telefono: '',
    email:    '',
    password: '',
  })
  const [vecino, setVecino] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const setField = (k, v) => setForm(s => ({ ...s, [k]: v }))

  // Auto-redirect si ya hay una sesión activa antes de empezar el flujo.
  // Esperamos a que termine el auth bootstrap (cache → fetch perfil) para
  // no parpadear con el formulario y después saltar a /admin.
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

  // Cada vez que el usuario cambia un campo, limpiamos errores
  // anteriores. Evita que un error del paso anterior se vea
  // mientras el usuario corrige.
  function handleChange(field, value) {
    setField(field, value)
    if (error) setError('')
  }

  // PASO 1 → buscar vecino por DNI + teléfono.
  async function handleStep1(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const v = await findVecinoByDniTelefono({
        dni:      form.dni,
        telefono: form.telefono,
      })
      if (!v) {
        setError(
          'No encontramos tu cuenta. Registrate sacando un turno o ' +
          'acercate a la Comisión Municipal.'
        )
        return
      }
      setVecino(v)
      setStep(2)
    } catch (e) {
      setError(e?.message ?? 'No pudimos verificar tu identidad. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  // PASO 2 — Vecino: crear sesión y entrar al área personal. El
  // email del paso 1 se guarda como `email_login` (opcional) por
  // si después se necesita para pre-rellenar formularios o
  // notificaciones, sin pisar el `email` real del vecino persistido.
  function handleEntrarComoVecino() {
    if (!vecino) return
    const emailLimpio = form.email.trim()
    setVecinoSession({
      ...vecino,
      telefono_login: form.telefono.replace(/[^0-9]/g, ''),
      ...(emailLimpio ? { email_login: emailLimpio } : {}),
    })
    navigate('/mi-cuenta', { replace: true })
  }

  // PASO 3 — Empleado: signIn + verificación de perfil/activo/roles.
  async function handleStep3(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const { data, error: signInError } = await signIn({
        email:    form.email,
        password: form.password,
      })
      if (signInError) {
        setError('Usuario o contraseña incorrectos.')
        return
      }
      const userId = data?.user?.id
      if (!userId) {
        setError('No se pudo iniciar sesión.')
        return
      }
      const { data: u, error: perfilError } = await supabase
        .from('usuarios')
        .select('roles, activo')
        .eq('id', userId)
        .maybeSingle()
      if (perfilError) {
        setError('No pudimos cargar tu perfil. Probá de nuevo.')
        return
      }
      if (!u) {
        await supabase.auth.signOut()
        setError('Tu cuenta aún no fue habilitada en el sistema.')
        return
      }
      if (u.activo === false) {
        await supabase.auth.signOut()
        setError('Tu cuenta está deshabilitada. Contactá al administrador.')
        return
      }
      const route = homeRouteFor(u.roles)
      if (!route) {
        await supabase.auth.signOut()
        setError('Tu cuenta no tiene un rol asignado.')
        return
      }
      navigate(route, { replace: true })
    } catch (e) {
      setError(e?.message ?? 'No pudimos iniciar sesión. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-svh bg-background">
      <AccesoHeader />
      <main className="mx-auto max-w-[480px] px-4 py-8 sm:py-12">
        {step === 1 && (
          <StepIdentificacion
            dni={form.dni}
            telefono={form.telefono}
            email={form.email}
            onChange={handleChange}
            submitting={submitting}
            error={error}
            onSubmit={handleStep1}
          />
        )}
        {step === 2 && (
          <StepTipo
            vecino={vecino}
            onPickVecino={handleEntrarComoVecino}
            onPickMunicipio={() => { setError(''); setStep(3) }}
            onBack={() => { setError(''); setStep(1) }}
          />
        )}
        {step === 3 && (
          <StepMunicipio
            email={form.email}
            password={form.password}
            onChange={handleChange}
            submitting={submitting}
            error={error}
            onSubmit={handleStep3}
            onBack={() => { setError(''); setStep(2) }}
          />
        )}

        {/* Link a login completo */}
        <div className="mt-6 text-center">
          <Link
            to="/portal/acceso"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            ¿Ya tenés cuenta completa? Iniciá sesión →
          </Link>
        </div>
      </main>
    </div>
  )
}
