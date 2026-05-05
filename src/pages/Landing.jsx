import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Spinner from '../components/ui/Spinner'

export default function Landing() {
  const { user, perfil, homeRoute, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    )
  }

  if (user) {
    // Sesión activa: el perfil aún puede estar cargando.
    if (!perfil) {
      return (
        <div className="flex min-h-svh items-center justify-center bg-background">
          <Spinner size="lg" />
        </div>
      )
    }
    if (homeRoute) {
      return <Navigate to={homeRoute} replace />
    }
    // Logueado pero sin rol asignado.
    return (
      <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 text-center">
        <span className="text-2xl font-bold text-primary">COMUNAS</span>
        <p className="mt-4 max-w-md text-primary-500">
          Tu cuenta no tiene un rol asignado. Contactá al administrador de tu comuna para que te habilite.
        </p>
        <button onClick={signOut} className="btn-secondary mt-6">Cerrar sesión</button>
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-background">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-xl font-bold text-primary">COMUNAS</span>
        <div className="flex gap-2">
          <Link to="/login" className="btn-secondary">Ingresar</Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <span className="badge-accent mb-6 inline-flex">Santiago del Estero</span>
        <h1 className="font-sora text-5xl font-bold leading-tight text-primary">
          CRM/ERP municipal para las comisiones de Santiago del Estero
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-primary-500">
          Una plataforma única para administrar trámites, turnos, historia clínica y notificaciones de tu comisión municipal.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/login" className="btn-primary">Ingresar al sistema</Link>
        </div>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-primary-400">
        COMUNAS — Plataforma para comisiones municipales de Santiago del Estero
      </footer>
    </div>
  )
}
