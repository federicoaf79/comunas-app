import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNoticiasPublicas } from '../../hooks/useNoticiasPublicas'
import Spinner from '../../components/ui/Spinner'
import NoticiaPortalCard           from '../../components/portal/NoticiaPortalCard'
import SacarTurnoFormPortal        from '../../components/portal/SacarTurnoFormPortal'
import ConsultarTurnoFormPortal    from '../../components/portal/ConsultarTurnoFormPortal'
import MiSaludForm                 from '../../components/portal/MiSaludForm'

const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'
const PROVINCIA        = 'Santiago del Estero'

const NAV_LINKS = [
  { href: '#noticias',  label: 'Noticias' },
  { href: '#turnos',    label: 'Turnos' },
  { href: '#mi-turno',  label: 'Mi Turno' },
  { href: '#mi-salud',  label: 'Mi Salud' },
  { href: '#servicios', label: 'Servicios' },
]

const ACCESOS_RAPIDOS = [
  {
    href:  '#turnos',
    label: 'Sacar turno',
    desc:  'Sala PA, Juez de Paz y más',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-8 w-8 text-accent">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path strokeLinecap="round" d="M3 9h18M8 3v4M16 3v4" />
        <path strokeLinecap="round" d="M12 13v5M9.5 15.5h5" />
      </svg>
    ),
  },
  {
    href:  '#mi-turno',
    label: 'Mi turno',
    desc:  'Consultá el estado de tu solicitud',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-8 w-8 text-accent">
        <circle cx="11" cy="11" r="7" />
        <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
      </svg>
    ),
  },
  {
    href:  '#mi-salud',
    label: 'Mi Salud',
    desc:  'Últimas atenciones en la Sala PA',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-8 w-8 text-accent">
        <path d="M12 21s-7-4.5-9-9c-1.5-3 0-7 4-7 2.5 0 4 1.5 5 3 1-1.5 2.5-3 5-3 4 0 5.5 4 4 7-2 4.5-9 9-9 9z" />
      </svg>
    ),
  },
  {
    href:  '#noticias',
    label: 'Noticias',
    desc:  'Novedades de la comuna',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-8 w-8 text-accent">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l18-7v16L3 13v-2zM7 13v5a2 2 0 0 0 4 0v-3" />
      </svg>
    ),
  },
]

const SERVICIOS = [
  {
    nombre:  'Sala de Primeros Auxilios',
    horario: 'Lunes a Viernes 8:00 – 20:00',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-6 w-6">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    nombre:  'Juzgado de Paz',
    horario: 'Lunes a Viernes 7:00 – 13:00',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-6 w-6">
        <path strokeLinecap="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" />
      </svg>
    ),
  },
  {
    nombre:  'Salón de Usos Múltiples',
    horario: 'Reservas — consultar disponibilidad',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-6 w-6">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
      </svg>
    ),
  },
  {
    nombre:  'Administración',
    horario: 'Lunes a Viernes 7:00 – 13:00',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-6 w-6">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path strokeLinecap="round" d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    ),
  },
]

// ─────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────

function AlertBar({ onClose }) {
  return (
    <div className="bg-accent text-primary">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2 text-xs sm:text-sm sm:px-6">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4 shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l18-7v16L3 13v-2zM7 13v5a2 2 0 0 0 4 0v-3" />
        </svg>
        <p className="flex-1 font-medium">
          Sala de Primeros Auxilios: Lunes a Viernes 8:00 – 20:00
        </p>
        <button
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="rounded p-1 transition-colors hover:bg-primary/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4">
            <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function HeroPattern() {
  // Patrón de puntos sutil sobre el gradiente del hero — apoya
  // la identidad institucional sin imágenes externas.
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full text-white opacity-[0.08]"
    >
      <defs>
        <pattern id="hero-dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.5" fill="currentColor" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hero-dots)" />
    </svg>
  )
}

function SocialIcon({ kind }) {
  if (kind === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">
        <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/>
      </svg>
    )
  }
  if (kind === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
        <rect x="3" y="3" width="18" height="18" rx="5"/>
        <circle cx="12" cy="12" r="4"/>
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
      </svg>
    )
  }
  if (kind === 'whatsapp') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">
        <path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4 8 8 0 0 0 4.05 12a7.94 7.94 0 0 0 1.07 4l-1.13 4.13 4.23-1.11A8 8 0 0 0 12.05 20a8 8 0 0 0 8-8 7.94 7.94 0 0 0-2.45-5.68zm-5.55 12.34a6.65 6.65 0 0 1-3.4-.93l-.24-.14-2.51.66.67-2.45-.16-.25a6.65 6.65 0 0 1-1.02-3.55 6.66 6.66 0 1 1 6.66 6.66zm3.65-4.99c-.2-.1-1.18-.58-1.36-.65-.18-.07-.32-.1-.45.1-.13.2-.51.65-.62.78-.12.13-.23.15-.42.05-.2-.1-.84-.31-1.6-.99a6 6 0 0 1-1.11-1.38c-.12-.2-.01-.31.09-.41.09-.09.2-.23.3-.35.1-.12.13-.2.2-.33.07-.13.03-.25-.02-.35-.05-.1-.45-1.08-.62-1.48-.16-.39-.32-.34-.45-.34h-.38a.74.74 0 0 0-.53.25c-.18.2-.7.69-.7 1.67 0 .98.71 1.93.81 2.06.1.13 1.4 2.13 3.39 2.99.47.2.84.32 1.13.42.48.15.91.13 1.25.08.38-.06 1.18-.48 1.34-.94.17-.47.17-.86.12-.94-.05-.08-.18-.13-.38-.23z"/>
      </svg>
    )
  }
  return null
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

export default function PortalPublico() {
  const [alertOpen, setAlertOpen] = useState(true)
  const {
    data: noticias = [],
    isLoading: loadingNoticias,
    error: errNoticias,
  } = useNoticiasPublicas({ limit: 6 })

  return (
    <div className="min-h-svh bg-background">
      {alertOpen && <AlertBar onClose={() => setAlertOpen(false)} />}

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
      <section
        className="relative overflow-hidden bg-gradient-to-br from-primary-900 via-primary to-primary-700 text-white"
        style={{ minHeight: '60vh' }}
      >
        <HeroPattern />
        {/* Halo gold decorativo */}
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-ok/20 blur-3xl" />

        <div className="relative mx-auto flex max-w-5xl flex-col items-start justify-center gap-5 px-4 py-14 sm:px-6 sm:py-20 lg:py-24" style={{ minHeight: '60vh' }}>
          <span className="badge-accent inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-3.5 w-3.5">
              <circle cx="12" cy="12" r="6" />
            </svg>
            Servicios disponibles 24/7
          </span>
          <h1 className="font-sora text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            {MUNICIPIO_NOMBRE}
          </h1>
          <p className="text-base text-white/80 sm:text-lg">
            {PROVINCIA} · Portal Ciudadano
          </p>
          <p className="max-w-2xl text-sm text-white/70 sm:text-base">
            Sacá turnos en la Sala de Primeros Auxilios y otras dependencias
            municipales, consultá el estado de tu solicitud y enterate de las
            novedades de la comuna.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <a
              href="#turnos"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-primary-900 shadow-sm transition-all hover:bg-accent-600 hover:text-white active:scale-95"
            >
              Sacar turno
            </a>
            <a
              href="#noticias"
              className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-white/40 bg-transparent px-6 py-3 text-base font-semibold text-white transition-all hover:bg-white/10 active:scale-95"
            >
              Ver noticias
            </a>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl space-y-12 px-4 py-10 sm:px-6 sm:py-14">
        {/* Accesos rápidos */}
        <section aria-labelledby="accesos-h2">
          <h2 id="accesos-h2" className="sr-only">Accesos rápidos</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {ACCESOS_RAPIDOS.map(a => (
              <a
                key={a.href}
                href={a.href}
                className="group flex h-full flex-col gap-3 rounded-xl border-2 border-primary bg-white p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg sm:p-6"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-accent-50 group-hover:bg-accent-100">
                  {a.icon}
                </div>
                <div>
                  <p className="text-lg font-semibold text-primary sm:text-xl">{a.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-primary-500 sm:text-sm">
                    {a.desc}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Servicios municipales */}
        <section id="servicios" aria-labelledby="servicios-h2" className="scroll-mt-20">
          <header className="mb-4">
            <h2 id="servicios-h2" className="text-xl font-bold text-primary sm:text-2xl">
              Servicios de la Comisión
            </h2>
            <p className="mt-1 text-sm text-primary-500">
              Dependencias y horarios de atención al ciudadano.
            </p>
          </header>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICIOS.map(s => (
              <div key={s.nombre} className="card flex items-start gap-3 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary">
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-primary">{s.nombre}</p>
                  <p className="mt-1 text-xs text-primary-400">{s.horario}</p>
                </div>
              </div>
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
      <footer className="bg-primary-900 text-white">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
          <div className="grid gap-8 sm:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-accent">
                Contacto
              </h3>
              <ul className="mt-3 space-y-1 text-sm text-white/80">
                <li>Av. San Martín s/n</li>
                <li>Real Sayana, Santiago del Estero</li>
                <li className="pt-2">Tel: (0385) 4-110-001</li>
                <li>WhatsApp: +54 9 3854 110001</li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-accent">
                Servicios
              </h3>
              <ul className="mt-3 space-y-1 text-sm text-white/80">
                <li><a href="#turnos"   className="transition-colors hover:text-white">Sacar turno</a></li>
                <li><a href="#mi-turno" className="transition-colors hover:text-white">Consultar mi turno</a></li>
                <li><a href="#mi-salud" className="transition-colors hover:text-white">Mi Salud</a></li>
                <li><a href="#noticias" className="transition-colors hover:text-white">Noticias</a></li>
                <li><a href="#servicios" className="transition-colors hover:text-white">Horarios de atención</a></li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-accent">
                Seguinos
              </h3>
              <div className="mt-3 flex gap-2">
                <a
                  href="#"
                  aria-label="Facebook"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-accent hover:text-primary"
                >
                  <SocialIcon kind="facebook" />
                </a>
                <a
                  href="#"
                  aria-label="Instagram"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-accent hover:text-primary"
                >
                  <SocialIcon kind="instagram" />
                </a>
                <a
                  href="https://wa.me/5493854110001"
                  aria-label="WhatsApp"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-accent hover:text-primary"
                >
                  <SocialIcon kind="whatsapp" />
                </a>
              </div>
              <p className="mt-4 text-xs text-white/60">
                L-V 7:00 – 13:00 · Sala PA 8:00 – 20:00
              </p>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs text-white/50 sm:flex-row">
            <p>© {new Date().getFullYear()} {MUNICIPIO_NOMBRE}. Todos los derechos reservados.</p>
            <p>
              Desarrollado por{' '}
              <span className="font-semibold text-accent">Frey Consulting</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
