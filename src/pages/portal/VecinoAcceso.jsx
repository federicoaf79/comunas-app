import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'
import { supabase } from '../../lib/supabase'
import PortalFormPage from '../../components/portal/PortalFormPage'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

// Banner contextual basado en la ruta de origen (mismo patrón que
// src/pages/auth/Acceso.jsx, portado acá porque VecinoGuard redirige
// a /portal/acceso — no a /acceso — con state={{ from: location }}.
function getContextualMessage(from) {
  if (!from) return null
  if (from.includes('polideportivo')) {
    return 'Para reservar una cancha necesitás iniciar sesión. Si no tenés cuenta, creála en pocos pasos — no te va a tomar más de 5 minutos.'
  }
  if (from.includes('desarrollo')) {
    return 'Para solicitar un servicio de la Agencia de Desarrollo necesitás iniciar sesión. Si no tenés cuenta, creála en pocos pasos — no te va a tomar más de 5 minutos.'
  }
  if (from.includes('reclamo')) {
    return 'Para crear un reclamo necesitás iniciar sesión. Si no tenés cuenta, creála en pocos pasos — no te va a tomar más de 5 minutos.'
  }
  if (from.includes('turno')) {
    return 'Para sacar o consultar un turno necesitás iniciar sesión. Si no tenés cuenta, creála en pocos pasos — no te va a tomar más de 5 minutos.'
  }
  if (from.includes('salud')) {
    return 'Para ver tu información de salud necesitás iniciar sesión. Si no tenés cuenta, creála en pocos pasos — no te va a tomar más de 5 minutos.'
  }
  return 'Necesitás iniciar sesión para continuar.'
}

export default function VecinoAcceso() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { setVecinoSession, isVecinoLogued } = useVecino()
  // ?tab=registro permite deep-link directo a la tab Registrarse
  // (usado desde el mensaje "sin perfil de vecino" de /acceso).
  const [tab, setTab] = useState(searchParams.get('tab') === 'registro' ? 'registro' : 'login')

  const redirectTo = location.state?.from?.pathname || '/portal/mi-cuenta'
  const contextualMessage = getContextualMessage(location.state?.from?.pathname)

  // Si ya hay sesión, ir directo al dashboard (o a la ruta de origen)
  useEffect(() => {
    if (isVecinoLogued) navigate(redirectTo, { replace: true })
  }, [isVecinoLogued, navigate, redirectTo])

  return (
    <PortalFormPage
      titulo="Mi cuenta"
      descripcion="Accedé a tus turnos, historia clínica y datos."
      compact
    >
      <div className="mx-auto max-w-[420px]">
        {contextualMessage && (
          <div className="mb-4 rounded-lg border border-primary/20 bg-primary-50 p-4">
            <div className="flex items-start gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-primary mt-0.5">
                <circle cx="12" cy="12" r="10"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4M12 8h.01"/>
              </svg>
              <p className="text-sm text-primary-700">{contextualMessage}</p>
            </div>
          </div>
        )}
        <div className="card overflow-hidden p-0">
          {/* Tabs */}
          <div className="flex border-b border-border bg-[#F5F4EF]">
            <button
              type="button"
              onClick={() => setTab('login')}
              className={
                'flex-1 px-3 py-2 font-sora text-xs font-semibold transition-colors sm:text-sm ' +
                (tab === 'login'
                  ? 'border-b-2 border-[#0F1C35] bg-white text-[#0F1C35]'
                  : 'text-[#0F1C35]/70 hover:text-[#0F1C35]')
              }
            >
              Ingresar
            </button>
            <button
              type="button"
              onClick={() => setTab('registro')}
              className={
                'flex-1 px-3 py-2 font-sora text-xs font-semibold transition-colors sm:text-sm ' +
                (tab === 'registro'
                  ? 'border-b-2 border-[#0F1C35] bg-white text-[#0F1C35]'
                  : 'text-[#0F1C35]/70 hover:text-[#0F1C35]')
              }
            >
              Registrarse
            </button>
          </div>

          {/* Contenido */}
          <div className="p-4 sm:p-5">
            {tab === 'login' && <LoginTab setVecinoSession={setVecinoSession} navigate={navigate} redirectTo={redirectTo} />}
            {tab === 'registro' && <RegistroTab setVecinoSession={setVecinoSession} navigate={navigate} redirectTo={redirectTo} />}
          </div>
        </div>
      </div>
    </PortalFormPage>
  )
}

// ═════════════════════════════════════════════════════════════
// TAB: Ingresar con Supabase Auth
// ═════════════════════════════════════════════════════════════

function LoginTab({ setVecinoSession, navigate, redirectTo }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError) throw signInError

      if (!data.user) {
        throw new Error('No se pudo iniciar sesión')
      }

      // VecinoContext.onAuthStateChange se encarga de cargar el vecino
      // vinculado y popular vecinoSession cuando detecta el evento SIGNED_IN.
      // Navegamos directamente — VecinoGuard/VecinoDashboard manejan el loading.
      navigate(redirectTo, { replace: true })
    } catch (e) {
      setError(e?.message ?? 'Error al iniciar sesión. Verificá tus datos.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!email.trim() && !!password

  if (showRecovery) {
    return <RecoveryForm onBack={() => setShowRecovery(false)} />
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="tu@email.com"
      />
      <Input
        label="Contraseña"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        autoComplete="current-password"
      />

      <button
        type="button"
        onClick={() => setShowRecovery(true)}
        className="self-end text-xs font-semibold text-[#C9A84C] hover:underline"
      >
        ¿Olvidaste tu contraseña?
      </button>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-2 text-xs text-danger">
          {error}
        </div>
      )}

      <Button
        type="submit"
        loading={submitting}
        disabled={!canSubmit}
        className="w-full"
      >
        Ingresar
      </Button>

      {/* Link a acceso rápido */}
      <div className="mt-4 text-center">
        <Link
          to="/acceso"
          className="inline-flex items-center gap-2 text-xs font-medium text-primary-600 hover:text-accent"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          ¿Solo necesitás sacar un turno rápido? →
        </Link>
      </div>
    </form>
  )
}

function RecoveryForm({ onBack }) {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setSubmitting(true)

    try {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/portal/reset-password`,
      })

      if (recoveryError) throw recoveryError

      setSuccess(true)
    } catch (e) {
      setError(e?.message ?? 'No pudimos enviar el email de recuperación')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-[#1D4ED8] bg-[#1D4ED8]/10 p-3 text-sm text-[#0F1C35]">
          <p className="font-sora font-semibold">✉️ Email enviado</p>
          <p className="mt-1 text-xs">
            Revisá tu casilla. Te enviamos un link para restablecer tu contraseña.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-semibold text-[#C9A84C] hover:underline"
        >
          ← Volver al ingreso
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="mb-2 text-xs font-semibold text-[#C9A84C] hover:underline"
        >
          ← Volver
        </button>
        <p className="text-sm text-[#0F1C35]">
          Ingresá tu email y te enviaremos un link para restablecer tu contraseña.
        </p>
      </div>

      <Input
        label="Email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="tu@email.com"
      />

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-2 text-xs text-danger">
          {error}
        </div>
      )}

      <Button
        type="submit"
        loading={submitting}
        disabled={!email.trim()}
        className="w-full"
      >
        Enviar link de recuperación
      </Button>
    </form>
  )
}

// ═════════════════════════════════════════════════════════════
// TAB: Registrarse con Supabase Auth
// ═════════════════════════════════════════════════════════════

function RegistroTab({ setVecinoSession, navigate, redirectTo }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dni, setDni] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [pendiente, setPendiente] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    // TEMPORAL — prueba de identidad de objeto en memoria, no solo de
    // nombre de variable. Si el `supabase` de esta línea fuera un
    // objeto distinto al usado más abajo en signUp/getSession/insert
    // (imposible por scoping de JS ya que es el mismo import de
    // módulo, pero lo confirmamos en runtime igual), el tag no
    // coincidiría entre los logs.
    if (!supabase.__instanceTag) supabase.__instanceTag = Math.random().toString(36).slice(2)
    const instanceTagAlInicio = supabase.__instanceTag

    try {
      // 1. Leer configuración de registro
      const { data: configData } = await supabase
        .from('configuracion_portal')
        .select('valor')
        .eq('clave', 'registro_portal')
        .maybeSingle()

      let config = { modo: 'abierto', requiere_aprobacion: false }
      if (configData?.valor) {
        try {
          config = typeof configData.valor === 'string'
            ? JSON.parse(configData.valor)
            : configData.valor
        } catch {}
      }

      const portalEstado = config.requiere_aprobacion ? 'pendiente' : 'activo'

      // 2. Crear cuenta en Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })

      if (signUpError) throw signUpError

      if (!authData.user) {
        throw new Error('No se pudo crear la cuenta')
      }

      // TEMPORAL — diagnóstico del bug de RLS en el insert de vecinos.
      // authData.session: lo que devolvió signUp() mismo (null si el
      // proyecto tiene "Confirm email" activado — en ese caso NO hay
      // sesión hasta que el usuario confirme por mail).
      // getSession(): lo que el cliente cree tener adjunto en este
      // momento exacto, justo antes del insert.
      const { data: sessionCheck } = await supabase.auth.getSession()
      console.log('[RegistroTab] DIAGNÓSTICO sesión post-signUp:', {
        'authData.session (de signUp)': authData.session,
        'getSession().session':          sessionCheck?.session,
        'access_token presente':          !!sessionCheck?.session?.access_token,
        'instanceTag (signUp/getSession)': supabase.__instanceTag,
        'instanceTag coincide con el de inicio de handleSubmit': supabase.__instanceTag === instanceTagAlInicio,
      })

      const userId = authData.user.id

      // 3. Buscar si existe vecino con ese DNI
      const { data: existingVecino, error: existingError } = await supabase
        .from('vecinos')
        .select('*')
        .eq('dni', dni.trim())
        .single()

      // TEMPORAL — este error se ignoraba en silencio; si falla por RLS
      // acá, el código sigue como si no existiera nadie con ese DNI.
      if (existingError) {
        console.warn('[RegistroTab] DIAGNÓSTICO error en SELECT existingVecino (ignorado, sigue a "crear nuevo"):', {
          code: existingError.code, message: existingError.message,
          details: existingError.details, hint: existingError.hint,
        })
      }

      let vecinoFinal

      if (existingVecino) {
        // Vincular user_id al vecino existente
        const { data: updated, error: updateError } = await supabase
          .from('vecinos')
          .update({
            user_id: userId,
            portal_estado: portalEstado,
          })
          .eq('id', existingVecino.id)
          .select()
          .single()

        if (updateError) {
          console.error('[RegistroTab] DIAGNÓSTICO error en UPDATE vecinos:', {
            code: updateError.code, message: updateError.message,
            details: updateError.details, hint: updateError.hint,
          })
          throw updateError
        }
        vecinoFinal = updated
      } else {
        // Crear nuevo vecino
        const partes = nombre.trim().split(/\s+/)
        const nombreSolo = partes.shift() ?? ''
        const apellido = partes.join(' ') || nombreSolo

        // TEMPORAL — confirmar userId y sesión en el momento exacto del insert.
        const { data: sessionAtInsert } = await supabase.auth.getSession()
        console.log('[RegistroTab] DIAGNÓSTICO justo antes del INSERT:', {
          userId,
          'sessionAtInsert.session?.user?.id': sessionAtInsert?.session?.user?.id,
          'coinciden userId === session.user.id': userId === sessionAtInsert?.session?.user?.id,
          'access_token presente': !!sessionAtInsert?.session?.access_token,
          'instanceTag justo antes del insert': supabase.__instanceTag,
          'instanceTag coincide con el de inicio de handleSubmit': supabase.__instanceTag === instanceTagAlInicio,
        })

        // La variable `supabase` de esta llamada es LITERALMENTE la
        // misma referencia que hizo signUp/getSession arriba — no hay
        // forma de que sea otra sin una reasignación local, que ya
        // confirmamos por grep que no existe en este archivo.
        const { data: newVecino, error: insertError } = await supabase
          .from('vecinos')
          .insert({
            user_id: userId,
            dni: dni.trim(),
            nombre: nombreSolo,
            apellido,
            nombre_completo: nombre.trim(),
            telefono: telefono.trim(),
            portal_estado: portalEstado,
          })
          .select()
          .single()

        if (insertError) {
          console.error('[RegistroTab] DIAGNÓSTICO error en INSERT vecinos:', {
            code: insertError.code, message: insertError.message,
            details: insertError.details, hint: insertError.hint,
          })
          throw insertError
        }
        vecinoFinal = newVecino
      }

      // 4. Manejar según estado
      if (vecinoFinal.portal_estado === 'pendiente') {
        setPendiente(true)
      } else {
        setVecinoSession({
          ...vecinoFinal,
          auth_mode: 'supabase',
          user_email: authData.user.email,
        })
        navigate(redirectTo, { replace: true })
      }
    } catch (e) {
      setError(e?.message ?? 'Error al crear cuenta. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!email.trim() && !!password && !!dni.trim() && !!nombre.trim()

  if (pendiente) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-[#C9A84C] bg-[#C9A84C]/10 p-3 text-sm text-[#0F1C35]">
          <p className="font-sora font-semibold">✅ Cuenta creada</p>
          <p className="mt-2 text-xs">
            Tu cuenta fue creada exitosamente. Un administrador la revisará antes de que puedas acceder al portal.
          </p>
          <p className="mt-2 text-xs">
            Te notificaremos por email cuando esté lista.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/portal')}
          className="text-center text-xs font-semibold text-[#C9A84C] hover:underline"
        >
          Volver al portal →
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Input
        label="Email"
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        autoComplete="email"
        placeholder="tu@email.com"
      />
      <Input
        label="Contraseña"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        autoComplete="new-password"
        placeholder="Mínimo 6 caracteres"
      />
      <div className="grid grid-cols-2 gap-2">
        <Input
          label="DNI"
          value={dni}
          onChange={e => setDni(e.target.value.replace(/[^\d]/g, ''))}
          required
          inputMode="numeric"
          type="text"
          autoComplete="off"
          placeholder="32145678"
        />
        <Input
          label="Teléfono"
          value={telefono}
          onChange={e => setTelefono(e.target.value)}
          inputMode="tel"
          type="tel"
          autoComplete="tel"
          placeholder="+54 9..."
        />
      </div>
      <Input
        label="Nombre completo"
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        required
        autoComplete="name"
        placeholder="Juan Pérez"
      />

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-2 text-xs text-danger">
          {error}
        </div>
      )}

      <Button
        type="submit"
        loading={submitting}
        disabled={!canSubmit}
        className="w-full"
      >
        Crear cuenta
      </Button>
    </form>
  )
}
