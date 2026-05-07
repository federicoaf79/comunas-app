import { Link } from 'react-router-dom'
import { useNoticiasPublicas } from '../../hooks/useNoticiasPublicas'
import Spinner from '../../components/ui/Spinner'
import NoticiaPortalCard           from '../../components/portal/NoticiaPortalCard'
import SacarTurnoFormPortal        from '../../components/portal/SacarTurnoFormPortal'
import ConsultarTurnoFormPortal    from '../../components/portal/ConsultarTurnoFormPortal'
import MiSaludForm                 from '../../components/portal/MiSaludForm'

// Hardcoded por ahora — cuando soportemos múltiples comunas, viene
// del slug del subdominio o del path. Hoy: Real Sayana piloto.
const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'
const PROVINCIA        = 'Santiago del Estero'

const NAV_LINKS = [
  { href: '#noticias', label: 'Noticias' },
  { href: '#turnos',   label: 'Turnos' },
  { href: '#mi-turno', label: 'Mi Turno' },
  { href: '#mi-salud', label: 'Mi Salud' },
]

// Accesos rápidos arriba del fold — texto grande, ícono gold, borde
// navy. Ancla a las secciones del portal.
const ACCESOS_RAPIDOS = [
  {
    href:  '#turnos',
    label: 'Sacar turno',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-10 w-10 text-accent">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path strokeLinecap="round" d="M3 9h18M8 3v4M16 3v4" />
        <path strokeLinecap="round" d="M12 13v5M9.5 15.5h5" />
      </svg>
    ),
  },
  {
    href:  '#mi-turno',
    label: 'Mi turno',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-10 w-10 text-accent">
        <circle cx="11" cy="11" r="7" />
        <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
      </svg>
    ),
  },
  {
    href:  '#mi-salud',
    label: 'Mi Salud',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-10 w-10 text-accent">
        <path d="M12 21s-7-4.5-9-9c-1.5-3 0-7 4-7 2.5 0 4 1.5 5 3 1-1.5 2.5-3 5-3 4 0 5.5 4 4 7-2 4.5-9 9-9 9z" />
      </svg>
    ),
  },
  {
    href:  '#noticias',
    label: 'Noticias',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-10 w-10 text-accent">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l18-7v16L3 13v-2zM7 13v5a2 2 0 0 0 4 0v-3" />
      </svg>
    ),
  },
]

export default function PortalPublico() {
  const {
    data: noticias = [],
    isLoading: loadingNoticias,
    error: errNoticias,
  } = useNoticiasPublicas({ limit: 6 })

  return (
    <div className="min-h-svh bg-background">
      {/* Header */}
      <header className="border-b border-border bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <Link to="/" className="text-xl font-bold text-primary">COMUNAS</Link>
              <p className="mt-0.5 text-sm font-semibold text-primary-700">{MUNICIPIO_NOMBRE}</p>
              <p className="text-xs text-primary-400">{PROVINCIA}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/" className="btn-ghost">Volver al inicio</Link>
              <Link to="/login" className="btn-secondary">Ingresar al sistema</Link>
            </div>
          </div>
          <nav aria-label="Secciones del portal" className="mt-4 flex flex-wrap gap-1 text-sm">
            {NAV_LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-md px-3 py-1.5 font-medium text-primary-500 hover:bg-primary-50 hover:text-primary"
              >
                {l.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-primary text-white">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
          <span className="badge-accent mb-4 inline-flex">Portal Ciudadano</span>
          <h1 className="font-sora text-3xl font-bold leading-tight sm:text-4xl">
            Tu municipio, en línea
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-primary-100 sm:text-base">
            Sacá turnos en la Sala de Primeros Auxilios y otras dependencias municipales,
            consultá el estado de tu solicitud y enterate de las novedades de la comuna.
          </p>
        </div>
      </section>

      <main className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6 sm:py-12">
        {/* Accesos rápidos */}
        <section aria-labelledby="accesos-h2">
          <h2 id="accesos-h2" className="sr-only">Accesos rápidos</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {ACCESOS_RAPIDOS.map(a => (
              <a
                key={a.href}
                href={a.href}
                className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-primary bg-white p-5 text-center transition-colors hover:bg-primary-50 sm:p-6"
              >
                {a.icon}
                <span className="text-base font-semibold text-primary sm:text-lg">
                  {a.label}
                </span>
              </a>
            ))}
          </div>
        </section>

        {/* Noticias */}
        <section id="noticias" aria-labelledby="noticias-h2" className="scroll-mt-20">
          <header className="mb-4">
            <h2 id="noticias-h2" className="text-xl font-bold text-primary sm:text-2xl">
              Noticias y anuncios
            </h2>
            <p className="mt-1 text-sm text-primary-500">Novedades de la comuna.</p>
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

        {/* Sacar turno */}
        <section id="turnos" aria-labelledby="turnos-h2" className="scroll-mt-20">
          <header className="mb-4">
            <h2 id="turnos-h2" className="text-xl font-bold text-primary sm:text-2xl">
              Sacar turno online
            </h2>
            <p className="mt-1 text-sm text-primary-500">
              Completá el formulario y te confirmamos por SMS o WhatsApp.
            </p>
          </header>
          <SacarTurnoFormPortal />
        </section>

        {/* Consultar turno */}
        <section id="mi-turno" aria-labelledby="mi-turno-h2" className="scroll-mt-20">
          <header className="mb-4">
            <h2 id="mi-turno-h2" className="text-xl font-bold text-primary sm:text-2xl">
              Consultar mi turno
            </h2>
            <p className="mt-1 text-sm text-primary-500">
              Ingresá tu DNI o el número de turno para ver el estado.
            </p>
          </header>
          <ConsultarTurnoFormPortal />
        </section>

        {/* Mi salud */}
        <section id="mi-salud" aria-labelledby="mi-salud-h2" className="scroll-mt-20">
          <header className="mb-4">
            <h2 id="mi-salud-h2" className="text-xl font-bold text-primary sm:text-2xl">
              Mi Salud
            </h2>
            <p className="mt-1 text-sm text-primary-500">
              Consultá el resumen de tus últimas atenciones en la Sala de Primeros Auxilios.
            </p>
          </header>
          <MiSaludForm />
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border bg-white">
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-8 text-sm text-primary-500 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <h3 className="font-semibold text-primary">Dirección</h3>
              <p>Av. San Martín s/n</p>
              <p>Real Sayana, Santiago del Estero</p>
            </div>
            <div>
              <h3 className="font-semibold text-primary">Contacto</h3>
              <p>Tel: (0385) 4-110-001</p>
              <p>WhatsApp: +54 9 3854 110001</p>
            </div>
            <div>
              <h3 className="font-semibold text-primary">Horarios de atención</h3>
              <p>Lunes a viernes 7:00 – 13:00</p>
              <p>Sala PA: 8:00 – 20:00</p>
            </div>
          </div>
          <div className="border-t border-border pt-3 text-center text-xs text-primary-400">
            Desarrollado por <span className="font-semibold text-primary-600">Frey Consulting</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
