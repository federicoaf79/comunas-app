import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'
import { findVecinoByDniTelefono } from '../../hooks/useVecinoData'
import { supabase } from '../../lib/supabase'
import PortalFormPage from '../../components/portal/PortalFormPage'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

export default function VecinoAcceso() {
  const navigate = useNavigate()
  const { setVecinoSession, isVecinoLogued } = useVecino()
  const [tab, setTab] = useState('login') // 'login' | 'registro' | 'rapido'

  // Si ya hay sesión, ir directo al dashboard
  useEffect(() => {
    if (isVecinoLogued) navigate('/mi-cuenta', { replace: true })
  }, [isVecinoLogued, navigate])

  return (
    <PortalFormPage
      titulo="Mi cuenta"
      descripcion="Ingresá a tu cuenta para acceder a tus turnos, tu historia clínica y los datos de tu familia."
    >
      <div className="card overflow-hidden p-0">
        {/* Tabs */}
        <div className="flex border-b border-border bg-[#F5F4EF]">
          <button
            type="button"
            onClick={() => setTab('login')}
            className={
              'flex-1 px-4 py-3 text-sm font-semibold transition-colors ' +
              (tab === 'login'
                ? 'border-b-2 border-primary bg-white text-primary'
                : 'text-primary-500 hover:text-primary')
            }
          >
            Ingresar
          </button>
          <button
            type="button"
            onClick={() => setTab('registro')}
            className={
              'flex-1 px-4 py-3 text-sm font-semibold transition-colors ' +
              (tab === 'registro'
                ? 'border-b-2 border-primary bg-white text-primary'
                : 'text-primary-500 hover:text-primary')
            }
          >
            Registrarse
          </button>
          <button
            type="button"
            onClick={() => setTab('rapido')}
            className={
              'flex-1 px-4 py-3 text-sm font-semibold transition-colors ' +
              (tab === 'rapido'
                ? 'border-b-2 border-primary bg-white text-primary'
                : 'text-primary-500 hover:text-primary')
            }
          >
            Acceso rápido
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 sm:p-6">
          {tab === 'login' && <LoginTab setVecinoSession={setVecinoSession} navigate={navigate} />}
          {tab === 'registro' && <RegistroTab setVecinoSession={setVecinoSession} navigate={navigate} />}
          {tab === 'rapido' && <RapidoTab setVecinoSession={setVecinoSession} navigate={navigate} />}
        </div>
      </div>
    </PortalFormPage>
  )
}

// ═════════════════════════════════════════════════════════════
// TAB: Ingresar con Supabase Auth
// ═════════════════════════════════════════════════════════════

function LoginTab({ setVecinoSession, navigate }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

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

      // Buscar vecino vinculado
      const { data: vecino, error: vecinoError } = await supabase
        .from('vecinos')
        .select('*')
        .eq('user_id', data.user.id)
        .single()

      if (vecinoError || !vecino) {
        await supabase.auth.signOut()
        throw new Error('No encontramos tu perfil de vecino vinculado a esta cuenta')
      }

      // Sesión exitosa
      setVecinoSession({
        ...vecino,
        auth_mode: 'supabase',
        user_email: data.user.email,
      })

      navigate('/mi-cuenta', { replace: true })
    } catch (e) {
      setError(e?.message ?? 'No pudimos iniciar sesión. Verificá tus datos.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!email.trim() && !!password

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
          Ingresá con tu cuenta
        </h3>
        <p className="mt-1 text-sm text-primary-500">
          Usá el email y contraseña con los que te registraste.
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

      <Button
        type="submit"
        loading={submitting}
        disabled={!canSubmit}
        className="w-full"
      >
        Ingresar
      </Button>
    </form>
  )
}

// ═════════════════════════════════════════════════════════════
// TAB: Registrarse con Supabase Auth
// ═════════════════════════════════════════════════════════════

function RegistroTab({ setVecinoSession, navigate }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dni, setDni] = useState('')
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      // 1. Crear cuenta en Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      })

      if (signUpError) throw signUpError

      if (!authData.user) {
        throw new Error('No se pudo crear la cuenta')
      }

      const userId = authData.user.id

      // 2. Buscar si existe vecino con ese DNI
      const { data: existingVecino } = await supabase
        .from('vecinos')
        .select('*')
        .eq('dni', dni.trim())
        .single()

      let vecinoFinal

      if (existingVecino) {
        // Vincular user_id al vecino existente
        const { data: updated, error: updateError } = await supabase
          .from('vecinos')
          .update({ user_id: userId })
          .eq('id', existingVecino.id)
          .select()
          .single()

        if (updateError) throw updateError
        vecinoFinal = updated
      } else {
        // Crear nuevo vecino
        const partes = nombre.trim().split(/\s+/)
        const nombreSolo = partes.shift() ?? ''
        const apellido = partes.join(' ') || nombreSolo

        const { data: newVecino, error: insertError } = await supabase
          .from('vecinos')
          .insert({
            user_id: userId,
            dni: dni.trim(),
            nombre: nombreSolo,
            apellido,
            nombre_completo: nombre.trim(),
            telefono: telefono.trim(),
            // TODO: Leer config registro_portal para portal_estado
            // Por ahora: activo por defecto
            portal_estado: 'activo',
          })
          .select()
          .single()

        if (insertError) throw insertError
        vecinoFinal = newVecino
      }

      // 3. Establecer sesión
      setVecinoSession({
        ...vecinoFinal,
        auth_mode: 'supabase',
        user_email: authData.user.email,
      })

      navigate('/mi-cuenta', { replace: true })
    } catch (e) {
      setError(e?.message ?? 'No pudimos crear tu cuenta. Probá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !!email.trim() && !!password && !!dni.trim() && !!nombre.trim()

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
          Creá tu cuenta
        </h3>
        <p className="mt-1 text-sm text-primary-500">
          Registrate para acceder a tu área personal desde cualquier dispositivo.
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
      <Input
        label="Contraseña"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        required
        autoComplete="new-password"
        placeholder="Mínimo 6 caracteres"
      />
      <Input
        label="DNI"
        value={dni}
        onChange={e => setDni(e.target.value.replace(/[^\d]/g, ''))}
        required
        inputMode="numeric"
        type="text"
        autoComplete="off"
        placeholder="Ej: 32145678"
      />
      <Input
        label="Nombre completo"
        value={nombre}
        onChange={e => setNombre(e.target.value)}
        required
        autoComplete="name"
        placeholder="Juan Pérez"
      />
      <Input
        label="Teléfono celular (opcional)"
        value={telefono}
        onChange={e => setTelefono(e.target.value)}
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
        Crear cuenta
      </Button>
    </form>
  )
}

// ═════════════════════════════════════════════════════════════
// TAB: Acceso rápido (DNI + teléfono) — Sistema anterior
// ═════════════════════════════════════════════════════════════

function RapidoTab({ setVecinoSession, navigate }) {
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
          'o registrate en la pestaña "Registrarse".'
        )
        return
      }
      setVecinoSession({
        ...vecino,
        auth_mode: 'rapido',
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
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
          Acceso sin cuenta
        </h3>
        <p className="mt-1 text-sm text-primary-500">
          Si no tenés cuenta registrada, ingresá con tu DNI y celular.
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
        Ingresar
      </Button>

      <div className="rounded-md border border-[#C9A84C] bg-[#C9A84C]/10 p-3 text-xs text-[#0F1C35]">
        <p className="font-semibold">💡 Recomendación:</p>
        <p className="mt-1">
          Registrate con email y contraseña para acceder desde cualquier
          dispositivo sin tener que recordar tu celular.
        </p>
      </div>
    </form>
  )
}
