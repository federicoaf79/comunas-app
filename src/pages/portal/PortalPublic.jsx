import { Link } from 'react-router-dom'
import { useNoticias } from '../../hooks/useNoticias'
import Spinner from '../../components/ui/Spinner'
import NoticiaPortalCard from '../../components/portal/NoticiaPortalCard'
import SacarTurnoForm from '../../components/portal/SacarTurnoForm'
import ConsultarTurnoForm from '../../components/portal/ConsultarTurnoForm'

// Hardcoded por ahora — cuando soportemos múltiples comunas, viene
// del slug del subdominio o del path. Hoy: Real Sayana piloto.
const MUNICIPIO_NOMBRE = 'Real Sayana'

export default function PortalPublic() {
  const {
    data: noticias = [],
    isLoading: loadingNoticias,
    error: errNoticias,
  } = useNoticias({ limit: 12 })

  return (
    <div className="min-h-svh bg-background">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          <div>
            <Link to="/" className="text-xl font-bold text-primary">COMUNAS</Link>
            <p className="text-xs text-primary-400">{MUNICIPIO_NOMBRE}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/" className="btn-ghost">Volver al inicio</Link>
            <Link to="/login" className="btn-secondary">Ingresar al sistema</Link>
          </div>
        </div>
      </header>

      {/* Hero institucional */}
      <section className="bg-primary text-white">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <span className="badge-accent mb-4 inline-flex">Portal Vecinal</span>
          <h1 className="font-sora text-3xl font-bold leading-tight sm:text-4xl">
            Tu comuna, en un solo lugar
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-100 sm:text-base">
            Sacá turnos en la Sala de Primeros Auxilios y otras dependencias
            municipales, consultá el estado de tu solicitud y enterate de las
            novedades de {MUNICIPIO_NOMBRE}.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6 sm:py-12">
        {/* Sacar turno */}
        <section aria-labelledby="sacar-turno">
          <header className="mb-4">
            <h2 id="sacar-turno" className="text-xl font-bold text-primary sm:text-2xl">
              Sacar turno
            </h2>
            <p className="mt-1 text-sm text-primary-500">
              Completá el formulario y te confirmamos por SMS o WhatsApp.
            </p>
          </header>
          <SacarTurnoForm />
        </section>

        {/* Consultar turno */}
        <section aria-labelledby="consultar-turno">
          <header className="mb-4">
            <h2 id="consultar-turno" className="text-xl font-bold text-primary sm:text-2xl">
              Consultar mi turno
            </h2>
            <p className="mt-1 text-sm text-primary-500">
              Ingresá tu DNI o el número de turno para ver el estado.
            </p>
          </header>
          <ConsultarTurnoForm />
        </section>

        {/* Noticias */}
        <section aria-labelledby="noticias">
          <header className="mb-4">
            <h2 id="noticias" className="text-xl font-bold text-primary sm:text-2xl">
              Noticias y anuncios
            </h2>
            <p className="mt-1 text-sm text-primary-500">
              Novedades de la comuna.
            </p>
          </header>

          {loadingNoticias && (
            <div className="card flex items-center justify-center p-10">
              <Spinner size="lg" />
            </div>
          )}

          {errNoticias && !loadingNoticias && (
            <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
              No pudimos cargar las noticias en este momento. Probá nuevamente más tarde.
            </div>
          )}

          {!loadingNoticias && !errNoticias && noticias.length === 0 && (
            <div className="card p-10 text-center text-sm text-primary-400">
              No hay noticias publicadas todavía.
            </div>
          )}

          {!loadingNoticias && !errNoticias && noticias.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {noticias.map(n => <NoticiaPortalCard key={n.id} noticia={n} />)}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-border bg-white py-6">
        <div className="mx-auto max-w-5xl px-4 text-center text-xs text-primary-400 sm:px-6">
          COMUNAS · Plataforma para comisiones municipales de Santiago del Estero
        </div>
      </footer>
    </div>
  )
}
