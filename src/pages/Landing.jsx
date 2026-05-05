import { Link } from 'react-router-dom'

export default function Landing() {
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
